const { Producto, Categoria, Sede, StockSede, NumeroSerie, MovimientoInventario, Usuario, sequelize } = require('../models');
const { assertSedeAccess } = require('../utils/sede');
const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const { resolveQuerySede } = require('../utils/sede');
const { getComboAvailability } = require('../utils/combo');

exports.getStockSede = async (req, res, next) => {
  try {
    const { sedeId } = req.query;
    const querySedeId = resolveQuerySede(sedeId, req.usuario) || req.usuario.sedeId;

    if (!querySedeId) {
      return res.status(400).json({ error: 'Por favor, especifique una sede.' });
    }

    const stock = await StockSede.findAll({
      where: { sedeId: querySedeId },
      include: [
        {
          model: Producto,
          as: 'producto',
          where: { activo: true },
          attributes: ['id', 'nombre', 'codigoBarras', 'descripcion', 'precioVenta', 'precioCosto', 'stockMinimo', 'tieneNumeroSerie', 'tieneIVA', 'esReacondicionado', 'esServicio', 'esCombo', 'unidadMedida', 'categoriaId', 'imagenUrl'],
          include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] }]
        }
      ],
      order: [[{ model: Producto, as: 'producto' }, 'nombre', 'ASC']]
    });

    const response = await Promise.all(stock.map(async (row) => {
      const json = row.toJSON();
      if (json.producto?.esCombo) {
        const disponibilidad = await getComboAvailability(json.producto.id, querySedeId);
        json.cantidad = disponibilidad.cantidad;
        json.producto.componentes = disponibilidad.componentes;
        json.producto.disponibilidadCombo = disponibilidad.cantidad;
      }
      return json;
    }));

    return res.json(response);
  } catch (error) {
    next(error);
  }
};

exports.getMovimientos = async (req, res, next) => {
  try {
    const { sede, sedeId, desde, hasta, productoId, tipo } = req.query;
    const resolvedSedeId = resolveQuerySede(sede || sedeId, req.usuario);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const allowedTypes = new Set(['entrada', 'salida', 'traslado_entrada', 'traslado_salida', 'ajuste']);
    if (tipo && !allowedTypes.has(tipo)) {
      return res.status(400).json({ error: 'Tipo de movimiento no válido.' });
    }

    const createdAt = {};
    if (desde) createdAt[Op.gte] = new Date(`${desde}T00:00:00`);
    if (hasta) createdAt[Op.lte] = new Date(`${hasta}T23:59:59.999`);
    const where = {
      ...(resolvedSedeId ? { sedeId: resolvedSedeId } : {}),
      ...(productoId ? { productoId } : {}),
      ...(tipo ? { tipo } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {})
    };

    const { count, rows } = await MovimientoInventario.findAndCountAll({
      where,
      include: [
        { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });

    const totalPages = Math.max(Math.ceil(count / limit), 1);
    const currentPage = Math.min(page, totalPages);
    const items = rows.map((movimiento) => ({
      id: movimiento.id,
      fecha: movimiento.createdAt,
      tipo: movimiento.tipo,
      direccion: movimiento.cantidad >= 0 ? 'entrada' : 'salida',
      producto: movimiento.producto?.nombre || 'Producto sin registro',
      codigo: movimiento.producto?.codigoBarras || '—',
      sede: movimiento.sede?.nombre || '—',
      cantidad: Math.abs(parseInt(movimiento.cantidad, 10) || 0),
      responsable: movimiento.usuario?.nombre || 'Sin registro',
      referencia: movimiento.referenciaId ? String(movimiento.referenciaId).slice(0, 8).toUpperCase() : '—',
      detalle: movimiento.motivo || 'Sin motivo'
    }));

    return res.json({ items, pagination: { page: currentPage, limit, total: count, totalPages } });
  } catch (error) {
    next(error);
  }
};

exports.trasladarMercancia = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { productoId, sedeOrigenId, sedeDestinoId, cantidad: rawCantidad, motivo, series } = req.body;
    const cantidad = Number(rawCantidad);

    if (!productoId || !sedeOrigenId || !sedeDestinoId || !Number.isSafeInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({ error: 'Datos de traslado incompletos o cantidad inválida.' });
    }
    assertSedeAccess(req.usuario, sedeOrigenId);

    const producto = await Producto.findByPk(productoId, { transaction });
    if (!producto || producto.esCombo || producto.esServicio) {
      await transaction.rollback();
      return res.status(400).json({ error: producto?.esCombo
        ? 'Los combos tienen stock calculado y no se pueden trasladar directamente.'
        : 'Producto no encontrado.' });
    }

    if (sedeOrigenId === sedeDestinoId) {
      return res.status(400).json({ error: 'La sede origen y destino deben ser distintas.' });
    }
    for (const id of [sedeOrigenId, sedeDestinoId].sort()) {
      const sede = await Sede.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!sede) return res.status(400).json({ error: 'Una de las sedes no existe.' });
    }

    let seriales = [];
    if (producto.tieneNumeroSerie) {
      if (!Array.isArray(series) || series.length !== cantidad || new Set(series).size !== cantidad) {
        return res.status(400).json({ error: 'Indique un IMEI o serial distinto por cada equipo trasladado.' });
      }
      seriales = await NumeroSerie.findAll({ where: { serie: { [Op.in]: series }, productoId,
        sedeId: sedeOrigenId, estado: 'en_stock' }, transaction, lock: transaction.LOCK.UPDATE });
      if (seriales.length !== cantidad) return res.status(400).json({ error: 'Los seriales deben estar disponibles en la sede origen.' });
    }

    // 1. Obtener y verificar stock en origen
    const stockOrigen = await StockSede.findOne({
      where: { productoId, sedeId: sedeOrigenId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!stockOrigen || stockOrigen.cantidad < cantidad) {
      return res.status(400).json({ error: 'Stock insuficiente en la sede origen para realizar el traslado.' });
    }

    // 2. Obtener o crear stock en destino
    let stockDestino = await StockSede.findOne({
      where: { productoId, sedeId: sedeDestinoId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!stockDestino) {
      stockDestino = await StockSede.create({
        productoId,
        sedeId: sedeDestinoId,
        cantidad: 0
      }, { transaction });
    }

    // 3. Modificar cantidades
    await stockOrigen.update({ cantidad: stockOrigen.cantidad - cantidad }, { transaction });
    await stockDestino.update({ cantidad: stockDestino.cantidad + cantidad }, { transaction });
    for (const serie of seriales) await serie.update({ sedeId: sedeDestinoId }, { transaction });

    // 4. Registrar movimientos de inventario
    const trasladoRef = randomUUID();

    // Salida en origen
    await MovimientoInventario.create({
      productoId,
      sedeId: sedeOrigenId,
      tipo: 'traslado_salida',
      cantidad: -cantidad,
      motivo: motivo || 'Traslado entre sedes',
      referenciaId: trasladoRef,
      usuarioId: req.usuario.userId
    }, { transaction });

    // Entrada en destino
    await MovimientoInventario.create({
      productoId,
      sedeId: sedeDestinoId,
      tipo: 'traslado_entrada',
      cantidad,
      motivo: motivo || 'Traslado entre sedes',
      referenciaId: trasladoRef,
      usuarioId: req.usuario.userId
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Inventario',
        registroId: productoId,
        valorAnterior: { sedeOrigen: sedeOrigenId, stockPrevio: stockOrigen.cantidad + cantidad },
        valorNuevo: { sedeDestino: sedeDestinoId, trasladoCantidad: cantidad }
      });
    }

    return res.json({ message: 'Traslado realizado exitosamente.' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

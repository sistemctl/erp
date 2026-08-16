const { Producto, Categoria, Sede, StockSede, MovimientoInventario, Usuario, sequelize } = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede } = require('../utils/sede');

exports.getStockSede = async (req, res, next) => {
  try {
    const { sedeId } = req.query;
    const querySedeId = sedeId || req.usuario.sedeId;

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
          attributes: ['id', 'nombre', 'codigoBarras', 'precioVenta', 'precioCosto', 'stockMinimo', 'tieneNumeroSerie', 'tieneIVA', 'esReacondicionado', 'esServicio', 'unidadMedida', 'categoriaId', 'imagenUrl'],
          include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] }]
        }
      ],
      order: [[{ model: Producto, as: 'producto' }, 'nombre', 'ASC']]
    });

    return res.json(stock);
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
  try {
    const { productoId, sedeOrigenId, sedeDestinoId, cantidad, motivo } = req.body;

    if (!productoId || !sedeOrigenId || !sedeDestinoId || !cantidad || cantidad <= 0) {
      return res.status(400).json({ error: 'Datos de traslado incompletos o cantidad inválida.' });
    }

    if (sedeOrigenId === sedeDestinoId) {
      return res.status(400).json({ error: 'La sede origen y destino deben ser distintas.' });
    }

    // 1. Obtener y verificar stock en origen
    const stockOrigen = await StockSede.findOne({
      where: { productoId, sedeId: sedeOrigenId },
      transaction
    });

    if (!stockOrigen || stockOrigen.cantidad < cantidad) {
      return res.status(400).json({ error: 'Stock insuficiente en la sede origen para realizar el traslado.' });
    }

    // 2. Obtener o crear stock en destino
    let stockDestino = await StockSede.findOne({
      where: { productoId, sedeId: sedeDestinoId },
      transaction
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

    // 4. Registrar movimientos de inventario
    const trasladoRef = sequelize.Sequelize.UUIDV4(); // UUID común para enlazar ambos movimientos

    // Salida en origen
    await MovimientoInventario.create({
      productoId,
      sedeId: sedeOrigenId,
      tipo: 'traslado_salida',
      cantidad: -cantidad,
      motivo: motivo || 'Traslado entre sedes',
      referenciaId: null,
      usuarioId: req.usuario.userId
    }, { transaction });

    // Entrada en destino
    await MovimientoInventario.create({
      productoId,
      sedeId: sedeDestinoId,
      tipo: 'traslado_entrada',
      cantidad,
      motivo: motivo || 'Traslado entre sedes',
      referenciaId: null,
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
    await transaction.rollback();
    next(error);
  }
};

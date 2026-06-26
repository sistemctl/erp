const { NumeroSerie, Producto, Sede, Cliente, Venta, OrdenReparacion, StockSede, sequelize } = require('../models');

exports.getSeries = async (req, res, next) => {
  try {
    const { producto } = req.query;
    const where = {};
    if (producto) {
      where.productoId = producto;
    }

    const series = await NumeroSerie.findAll({
      where,
      include: [
        { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'telefono'] }
      ],
      order: [['serie', 'ASC']]
    });

    return res.json(series);
  } catch (error) {
    next(error);
  }
};

exports.createSerie = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { serie, productoId, sedeId } = req.body;

    if (!serie || !productoId || !sedeId) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
    }

    // Verificar unicidad
    const existe = await NumeroSerie.findOne({ where: { serie }, transaction });
    if (existe) {
      return res.status(400).json({ error: 'Este número de serie/IMEI ya está registrado.' });
    }

    const numeroSerie = await NumeroSerie.create({
      serie,
      productoId,
      sedeId,
      estado: 'en_stock'
    }, { transaction });

    // Sincronizar StockSede
    const stock = await StockSede.findOne({
      where: { productoId, sedeId },
      transaction
    });

    if (stock) {
      await stock.update({ cantidad: stock.cantidad + 1 }, { transaction });
    } else {
      await StockSede.create({
        productoId,
        sedeId,
        cantidad: 1
      }, { transaction });
    }

    // Registrar MovimientoInventario
    const { MovimientoInventario } = require('../models');
    await MovimientoInventario.create({
      productoId,
      sedeId,
      tipo: 'entrada',
      cantidad: 1,
      motivo: `Ingreso de Serie/IMEI: ${serie}`,
      usuarioId: req.usuario.userId
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Series',
        registroId: numeroSerie.id,
        valorNuevo: numeroSerie.toJSON()
      });
    }

    return res.status(201).json(numeroSerie);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.getHistorialImei = async (req, res, next) => {
  try {
    const { imei } = req.params;

    const serieInfo = await NumeroSerie.findOne({
      where: { serie: imei },
      include: [
        { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'telefono', 'email'] }
      ]
    });

    if (!serieInfo) {
      return res.status(404).json({ error: 'Número de serie/IMEI no encontrado en el sistema.' });
    }

    // Obtener órdenes de reparación vinculadas
    const reparaciones = await OrdenReparacion.findAll({
      where: { imei },
      attributes: ['id', 'numeroOrden', 'createdAt', 'estado', 'totalCobrado', 'diagnostico'],
      order: [['createdAt', 'DESC']]
    });

    return res.json({
      info: serieInfo,
      reparaciones
    });
  } catch (error) {
    next(error);
  }
};

exports.createSeriesBulk = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { series, productoId, sedeId } = req.body;

    if (!series || !Array.isArray(series) || series.length === 0 || !productoId || !sedeId) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios o formato inválido.' });
    }

    // Limpiar seriales (remover duplicados y espacios en blanco)
    const serialesLimpios = [...new Set(series.map(s => s.trim()).filter(s => s.length > 0))];

    if (serialesLimpios.length === 0) {
      return res.status(400).json({ error: 'No se ingresaron números de serie válidos.' });
    }

    // Verificar si alguno ya existe en la base de datos
    const existentes = await NumeroSerie.findAll({
      where: {
        serie: serialesLimpios
      },
      transaction
    });

    if (existentes.length > 0) {
      const listaExistentes = existentes.map(e => e.serie).join(', ');
      return res.status(400).json({ error: `Los siguientes números de serie ya están registrados: ${listaExistentes}` });
    }

    // Crear los registros en lote
    const nuevosRegistros = serialesLimpios.map(s => ({
      serie: s,
      productoId,
      sedeId,
      estado: 'en_stock'
    }));

    const creados = await NumeroSerie.bulkCreate(nuevosRegistros, { transaction });

    // Sincronizar StockSede
    const cantidadNuevos = creados.length;
    const stock = await StockSede.findOne({
      where: { productoId, sedeId },
      transaction
    });

    if (stock) {
      await stock.update({ cantidad: stock.cantidad + cantidadNuevos }, { transaction });
    } else {
      await StockSede.create({
        productoId,
        sedeId,
        cantidad: cantidadNuevos
      }, { transaction });
    }

    // Registrar MovimientoInventario
    const { MovimientoInventario } = require('../models');
    await MovimientoInventario.create({
      productoId,
      sedeId,
      tipo: 'entrada',
      cantidad: cantidadNuevos,
      motivo: `Ingreso masivo de ${cantidadNuevos} Series/IMEIs`,
      usuarioId: req.usuario.userId
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE_BULK',
        modulo: 'Series',
        valorNuevo: { cantidad: creados.length, series: serialesLimpios }
      });
    }

    return res.status(201).json({
      message: `${creados.length} números de serie registrados exitosamente.`,
      cantidad: creados.length
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.deleteSerie = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;

    const serieReg = await NumeroSerie.findByPk(id, { transaction });
    if (!serieReg) {
      return res.status(404).json({ error: 'Número de serie/IMEI no encontrado.' });
    }

    const { productoId, sedeId, estado, serie } = serieReg;

    // Solo descontar stock si el serial estaba en stock
    if (estado === 'en_stock') {
      const stock = await StockSede.findOne({
        where: { productoId, sedeId },
        transaction
      });

      if (stock) {
        const nuevaCantidad = Math.max(0, stock.cantidad - 1);
        await stock.update({ cantidad: nuevaCantidad }, { transaction });
      }

      // Registrar Movimiento Inventario de salida
      const { MovimientoInventario } = require('../models');
      await MovimientoInventario.create({
        productoId,
        sedeId,
        tipo: 'salida',
        cantidad: -1,
        motivo: `Eliminación/Anulación de Serie/IMEI: ${serie}`,
        usuarioId: req.usuario.userId
      }, { transaction });
    }

    const valorAnterior = serieReg.toJSON();
    await serieReg.destroy({ transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Series',
        registroId: id,
        valorAnterior
      });
    }

    return res.json({ message: 'Número de serie/IMEI eliminado exitosamente.' });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};


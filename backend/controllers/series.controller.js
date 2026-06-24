const { NumeroSerie, Producto, Sede, Cliente, Venta, OrdenReparacion } = require('../models');

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
  try {
    const { serie, productoId, sedeId } = req.body;

    if (!serie || !productoId || !sedeId) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
    }

    // Verificar unicidad
    const existe = await NumeroSerie.findOne({ where: { serie } });
    if (existe) {
      return res.status(400).json({ error: 'Este número de serie/IMEI ya está registrado.' });
    }

    const numeroSerie = await NumeroSerie.create({
      serie,
      productoId,
      sedeId,
      estado: 'en_stock'
    });

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

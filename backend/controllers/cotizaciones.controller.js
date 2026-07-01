const { Cotizacion, ItemCotizacion, Cliente, Sede, Usuario, Producto, Venta, OrdenReparacion, ConfiguracionSistema, sequelize } = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const { resolveQuerySede, resolveActionSede } = require('../utils/sede');
const { generarCotizacionPDF } = require('../utils/cotizacion-pdf');

// --- GET ALL COTIZACIONES ---
exports.getCotizaciones = async (req, res, next) => {
  try {
    const { sede, estado, cliente, desde, hasta, buscar } = req.query;
    const where = {};

    const querySedeId = resolveQuerySede(sede, req.usuario);
    if (querySedeId) {
      where.sedeId = querySedeId;
    }

    if (estado) {
      where.estado = estado;
    }

    if (cliente) {
      where.clienteId = cliente;
    }

    if (desde && hasta) {
      where.createdAt = { [Op.between]: [new Date(desde), new Date(hasta)] };
    }

    if (buscar) {
      where[Op.or] = [
        { numeroCotizacion: { [Op.iLike]: `%${buscar}%` } },
        { '$cliente.nombre$': { [Op.iLike]: `%${buscar}%` } }
      ];
    }

    const cotizaciones = await Cotizacion.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento', 'telefono'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(cotizaciones);
  } catch (error) {
    next(error);
  }
};

// --- GET COTIZACION BY ID ---
exports.getCotizacionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cotizacion = await Cotizacion.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        {
          model: ItemCotizacion,
          as: 'items',
          include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras', 'precioVenta', 'tieneNumeroSerie', 'tieneIVA'] }]
        }
      ]
    });

    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    return res.json(cotizacion);
  } catch (error) {
    next(error);
  }
};

// --- CREAR COTIZACION ---
exports.crearCotizacion = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { clienteId, items, fechaVencimiento, notas, sedeId: bodySedeId } = req.body;
    let sedeId = bodySedeId || req.usuario.sedeId;

    if (!sedeId) {
      sedeId = await resolveActionSede(null, req.usuario, Sede, transaction);
    }

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe especificar una sede para la cotización.' });
    }

    const usuarioId = req.usuario.userId;

    if (!clienteId || !items || items.length === 0 || !fechaVencimiento) {
      return res.status(400).json({ error: 'Datos de cotización incompletos.' });
    }

    const count = await Cotizacion.count({ transaction });
    const numeroCotizacion = `COT-${String(count + 1).padStart(6, '0')}`;

    let total = 0;
    const itemsACrear = [];

    for (const item of items) {
      const subtotal = parseFloat(item.cantidad) * parseFloat(item.precioUnitario);
      total += subtotal;

      itemsACrear.push({
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal,
        productoId: item.productoId || null
      });
    }

    const cotizacion = await Cotizacion.create({
      numeroCotizacion,
      clienteId,
      usuarioId,
      sedeId,
      total,
      estado: 'borrador',
      fechaVencimiento: new Date(fechaVencimiento),
      notas: notas || ''
    }, { transaction });

    for (const item of itemsACrear) {
      item.cotizacionId = cotizacion.id;
      await ItemCotizacion.create(item, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Cotizacion',
        registroId: cotizacion.id,
        valorNuevo: cotizacion.toJSON()
      });
    }

    return res.status(201).json(cotizacion);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// --- APROBAR COTIZACION ---
exports.aprobarCotizacion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ventaId, ordenReparacionId } = req.body;

    const cotizacion = await Cotizacion.findByPk(id);
    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    if (cotizacion.estado === 'aprobada') {
      return res.status(400).json({ error: 'La cotización ya ha sido aprobada.' });
    }

    const valorAnterior = cotizacion.toJSON();

    await cotizacion.update({
      estado: 'aprobada',
      ventaId: ventaId || null,
      ordenReparacionId: ordenReparacionId || null
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'APROBAR_COTIZACION',
        modulo: 'Cotizacion',
        registroId: cotizacion.id,
        valorAnterior,
        valorNuevo: cotizacion.toJSON()
      });
    }

    return res.json({ message: 'Cotización aprobada correctamente.', cotizacion });
  } catch (error) {
    next(error);
  }
};

// --- GENERAR COTIZACION PDF ---
exports.generarCotizacionPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cotizacion = await Cotizacion.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        {
          model: ItemCotizacion,
          as: 'items',
          include: [{ model: Producto, as: 'producto', attributes: ['codigoBarras', 'nombre', 'tieneIVA'] }]
        }
      ]
    });

    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    const config = await ConfiguracionSistema.findOne();
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cotizacion_${cotizacion.numeroCotizacion}.pdf`);
    doc.pipe(res);

    await generarCotizacionPDF(doc, cotizacion, config || {});

    doc.end();
  } catch (error) {
    next(error);
  }
};

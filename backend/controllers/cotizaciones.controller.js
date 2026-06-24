const { Cotizacion, ItemCotizacion, Cliente, Sede, Usuario, Producto, Venta, OrdenReparacion, sequelize } = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');

// --- GET ALL COTIZACIONES ---
exports.getCotizaciones = async (req, res, next) => {
  try {
    const { sede, estado, cliente, desde, hasta, buscar } = req.query;
    const where = {};

    const querySedeId = sede || (req.usuario.rol !== 'admin' ? req.usuario.sedeId : null);
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
          include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras', 'precioVenta', 'tieneNumeroSerie'] }]
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
    const { clienteId, items, fechaVencimiento, notas } = req.body;
    const sedeId = req.usuario.sedeId;
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
        { model: Usuario, as: 'usuario' },
        { model: ItemCotizacion, as: 'items' }
      ]
    });

    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cotizacion_${cotizacion.numeroCotizacion}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('TECHSTORE COLOMBIA S.A.S.', { align: 'center', bold: true });
    doc.fontSize(10).text(`NIT: 901.456.789-0 | Sede: ${cotizacion.sede.nombre}`, { align: 'center' });
    doc.text(`Dirección: ${cotizacion.sede.direccion}`, { align: 'center' });
    doc.moveDown(2);

    // Cotizacion Info
    doc.fontSize(14).text(`PRESUPUESTO / COTIZACIÓN: #${cotizacion.numeroCotizacion}`, { align: 'center', color: '#2563eb' });
    doc.fontSize(10).text(`Fecha Emisión: ${new Date(cotizacion.createdAt).toLocaleDateString()}`, { align: 'center' });
    doc.text(`Fecha Vence: ${new Date(cotizacion.fechaVencimiento).toLocaleDateString()}`, { align: 'center' });
    doc.text(`Estado: ${cotizacion.estado.toUpperCase()}`, { align: 'center' });
    doc.moveDown(1.5);

    // Cliente
    doc.fontSize(12).text('INFORMACIÓN DEL CLIENTE', { underline: true });
    doc.fontSize(10).text(`Nombre: ${cotizacion.cliente ? cotizacion.cliente.nombre : 'Cliente General'}`);
    doc.text(`Cédula/NIT: ${cotizacion.cliente ? cotizacion.cliente.documento || 'No registrado' : 'N/A'}`);
    doc.text(`Teléfono: ${cotizacion.cliente ? cotizacion.cliente.telefono || 'No registrado' : 'N/A'}`);
    doc.moveDown(1.5);

    // Detalle Items
    doc.fontSize(12).text('ITEMS COTIZADOS', { underline: true });
    doc.moveDown(0.5);

    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    doc.fontSize(10);
    doc.text('Descripción / Item                        Cant      Precio Unit.      Subtotal', { bold: true });
    doc.text('---------------------------------------------------------------------------------');
    
    for (const item of cotizacion.items) {
      doc.text(`${item.descripcion.substring(0, 35).padEnd(40)} ${String(item.cantidad).padStart(4)} ${formatter.format(item.precioUnitario).padStart(17)} ${formatter.format(item.subtotal).padStart(15)}`);
    }

    doc.text('---------------------------------------------------------------------------------');
    doc.moveDown(1);

    // Totales
    doc.fontSize(12).text(`TOTAL COTIZADO: ${formatter.format(cotizacion.total)}`, { align: 'right', bold: true });
    doc.moveDown(2);

    if (cotizacion.notas) {
      doc.fontSize(10).text('Notas / Observaciones:', { underline: true });
      doc.fontSize(9).text(cotizacion.notas);
      doc.moveDown(1.5);
    }

    // Términos
    doc.fontSize(8);
    doc.text('Este presupuesto es meramente informativo y tiene una validez limitada según la fecha de vencimiento descrita.', { align: 'center' });
    doc.text('¡Gracias por cotizar con TechStore Colombia!', { align: 'center', bold: true });

    doc.end();
  } catch (error) {
    next(error);
  }
};

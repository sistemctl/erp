const { devolverComponentesCombo } = require('../utils/venta-inventario');
const { httpError } = require('../utils/http-error');
const { assertSedeAccess } = require('../utils/sede');
const {
  Factura,
  Venta,
  ItemVenta,
  PagoVenta,
  OrdenReparacion,
  OrdenInstalacion,
  MaterialInstalacion,
  RepuestoOrden,
  Cliente,
  Sede,
  Usuario,
  Producto,
  StockSede,
  MovimientoInventario,
  NumeroSerie,
  Caja,
  CuentaPorCobrar,
  Abono,
  sequelize,
  ConfiguracionSistema,
  ItemVentaComponente
} = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const { resolveQuerySede } = require('../utils/sede');
const { revertirCobrosFactura } = require('../utils/caja-cobros');
const { generarFacturaPDF } = require('../utils/factura-pdf');
const emailService = require('../services/email.service');

// --- GET ALL FACTURAS ---
exports.getFacturas = async (req, res, next) => {
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
        { numeroFactura: { [Op.iLike]: `%${buscar}%` } },
        { '$cliente.nombre$': { [Op.iLike]: `%${buscar}%` } }
      ];
    }

    const facturas = await Factura.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento', 'telefono', 'email'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Venta, as: 'venta', attributes: ['numeroVenta'] },
        { model: OrdenReparacion, as: 'ordenReparacion', attributes: ['numeroOrden'] },
        { model: OrdenInstalacion, as: 'ordenInstalacion', attributes: ['numeroOrden'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(facturas);
  } catch (error) {
    next(error);
  }
};

// --- GET FACTURA BY ID ---
exports.getFacturaById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const factura = await Factura.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' },
        {
          model: Venta,
          as: 'venta',
          include: [
            {
              model: ItemVenta,
              as: 'items',
              include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras', 'unidadMedida'] }]
            },
            { model: PagoVenta, as: 'pagos' },
            { model: Usuario, as: 'usuario', attributes: ['nombre'] }
          ]
        },
        {
          model: OrdenReparacion,
          as: 'ordenReparacion',
          include: [
            {
              model: RepuestoOrden,
              as: 'repuestos',
              include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras', 'unidadMedida'] }]
            }
          ]
        },
        {
          model: OrdenInstalacion,
          as: 'ordenInstalacion',
          include: [
            { model: Usuario, as: 'tecnico', attributes: ['id', 'nombre'] },
            {
              model: MaterialInstalacion,
              as: 'materiales',
              include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras', 'unidadMedida'] }]
            }
          ]
        }
      ]
    });
    if (factura) assertSedeAccess(req.usuario, factura.sedeId);

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada.' });
    }

    return res.json(factura);
  } catch (error) {
    next(error);
  }
};

// --- ANULACIÓN POR NOTA DE CRÉDITO ---
exports.anularFactura = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const factura = await Factura.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (factura) assertSedeAccess(req.usuario, factura.sedeId);

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada.' });
    }

    if (factura.estado === 'anulada') {
      return res.status(400).json({ error: 'Esta factura ya se encuentra anulada.' });
    }

    // Bloquear anulación si ya hubo devoluciones parciales/totales del cliente
    if (factura.ventaId) {
      await Venta.findByPk(factura.ventaId, { transaction, lock: transaction.LOCK.UPDATE });
      const ventaPrev = await Venta.findByPk(factura.ventaId, {
        attributes: ['id', 'devolucionEstado'],
        transaction
      });
      if (ventaPrev?.devolucionEstado && ventaPrev.devolucionEstado !== 'ninguna') {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Esta venta tiene devoluciones registradas. Use el flujo de devoluciones en Historial de Ventas; la anulación total no aplica.'
        });
      }
    }

    const valorAnterior = factura.toJSON();

    await revertirCobrosFactura(factura, transaction);
    // 1. Marcar Factura como anulada
    await factura.update({ estado: 'anulada' }, { transaction });

    // 2. Si viene de una Venta POS
    if (factura.ventaId) {
      const venta = await Venta.findByPk(factura.ventaId, {
        include: [
          { model: ItemVenta, as: 'items', include: [{ model: Producto, as: 'producto' }, { model: ItemVentaComponente, as: 'componentesVendidos' }] },
          { model: PagoVenta, as: 'pagos' }
        ],
        transaction
      });

      if (venta) {
        await venta.update({ estado: 'anulada', saldoPendiente: 0 }, { transaction });

        // Devolver productos al Stock de la Sede y registrar movimientos
        for (const item of venta.items) {
          if (item.componentesVendidos?.length) {
            await devolverComponentesCombo({ item, cantidad: item.cantidad, yaDev: 0, venta,
              devolucion: { id: factura.id }, numero: factura.numeroFactura, usuarioId: req.usuario.userId, transaction });
            continue;
          }
          if (item.producto?.esServicio) continue;
          if (item.producto?.esCombo) throw httpError(409, 'La venta no conserva los componentes originales del combo.');
          const stock = await StockSede.findOne({
            where: { productoId: item.productoId, sedeId: factura.sedeId },
            lock: transaction.LOCK.UPDATE,
            transaction
          });

          if (stock) {
            await stock.update({ cantidad: stock.cantidad + item.cantidad }, { transaction });
          }

          await MovimientoInventario.create({
            productoId: item.productoId,
            sedeId: factura.sedeId,
            tipo: 'entrada',
            cantidad: item.cantidad,
            motivo: `Anulación administrativa de Factura #${factura.numeroFactura}`,
            referenciaId: factura.id,
            usuarioId: req.usuario.userId
          }, { transaction });

          if (item.producto?.tieneNumeroSerie) {
            if (!item.numeroSerieId) throw httpError(409, 'Esta venta antigua no conserva el IMEI original. Debe regularizarse antes de anular.');
            const serie = await NumeroSerie.findByPk(item.numeroSerieId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!serie || serie.estado !== 'vendido' || String(serie.productoId) !== String(item.productoId)) {
              throw httpError(409, 'El serial original no puede reintegrarse.');
            }
            await serie.update({ estado: 'en_stock', clienteId: null, fechaVenta: null }, { transaction });
          }
        }

      }
    }

    // 3. Si viene de una Orden de Reparación
    if (factura.ordenReparacionId) {
      const orden = await OrdenReparacion.findByPk(factura.ordenReparacionId, {
        include: [{ model: RepuestoOrden, as: 'repuestos' }],
        transaction
      });

      if (orden) {
        await orden.update({ estado: 'cancelado' }, { transaction });

        // Devolver repuestos usados al inventario
        for (const rep of orden.repuestos) {
          const stock = await StockSede.findOne({
            where: { productoId: rep.productoId, sedeId: factura.sedeId },
            lock: transaction.LOCK.UPDATE,
            transaction
          });

          if (stock) {
            await stock.update({ cantidad: stock.cantidad + rep.cantidad }, { transaction });
          }

          await MovimientoInventario.create({
            productoId: rep.productoId,
            sedeId: factura.sedeId,
            tipo: 'entrada',
            cantidad: rep.cantidad,
            motivo: `Repuestos devueltos por anulación de Factura #${factura.numeroFactura} (Reparación)`,
            referenciaId: factura.id,
            usuarioId: req.usuario.userId
          }, { transaction });
        }
      }
    }

    if (factura.ordenInstalacionId) {
      const orden = await OrdenInstalacion.findByPk(factura.ordenInstalacionId, { transaction, lock: transaction.LOCK.UPDATE });
      if (orden) {
        await orden.update({ estado: 'cancelada' }, { transaction });
        const materiales = await MaterialInstalacion.findAll({ where: { ordenId: orden.id }, transaction });
        for (const material of materiales) {
          const stock = await StockSede.findOne({ where: { productoId: material.productoId, sedeId: factura.sedeId },
            transaction, lock: transaction.LOCK.UPDATE });
          if (stock) await stock.update({ cantidad: stock.cantidad + material.cantidad }, { transaction });
          if (material.series?.length) {
            const seriales = await NumeroSerie.findAll({ where: { productoId: material.productoId,
              sedeId: factura.sedeId, serie: { [Op.in]: material.series } }, transaction, lock: transaction.LOCK.UPDATE });
            if (seriales.length !== material.cantidad || seriales.some((serie) => serie.estado !== 'instalado')) {
              throw httpError(409, 'Los seriales originales de la instalación no pueden reintegrarse.');
            }
            for (const serie of seriales) await serie.update({ estado: 'en_stock', clienteId: null, fechaVenta: null }, { transaction });
          }
          await MovimientoInventario.create({ productoId: material.productoId, sedeId: factura.sedeId, tipo: 'entrada',
            cantidad: material.cantidad, motivo: `Materiales devueltos por anulación de Factura #${factura.numeroFactura} (Instalación)`,
            referenciaId: factura.id, usuarioId: req.usuario.userId }, { transaction });
        }
      }
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Facturas',
        registroId: id,
        valorAnterior,
        valorNuevo: { estado: 'anulada' }
      });
    }

    return res.json({ message: 'Factura y transacciones asociadas anuladas con éxito.' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

// --- EXPORTAR FACTURA A PDF (PDFKIT) ---
exports.getFacturaPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const factura = await Factura.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' },
        {
          model: Venta,
          as: 'venta',
          include: [
            {
              model: ItemVenta,
              as: 'items',
              include: [{ model: Producto, as: 'producto' }]
            },
            { model: PagoVenta, as: 'pagos' },
            { model: Usuario, as: 'usuario', attributes: ['nombre'] }
          ]
        },
        {
          model: OrdenReparacion,
          as: 'ordenReparacion',
          include: [
            {
              model: RepuestoOrden,
              as: 'repuestos',
              include: [{ model: Producto, as: 'producto' }]
            }
          ]
        },
        {
          model: OrdenInstalacion,
          as: 'ordenInstalacion',
          include: [
            { model: Usuario, as: 'tecnico', attributes: ['id', 'nombre'] },
            {
              model: MaterialInstalacion,
              as: 'materiales',
              include: [{ model: Producto, as: 'producto' }]
            }
          ]
        }
      ]
    });
    if (factura) assertSedeAccess(req.usuario, factura.sedeId);

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada.' });
    }

    const config = await ConfiguracionSistema.findOne();
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=factura_${factura.numeroFactura}.pdf`);
    doc.pipe(res);

    await generarFacturaPDF(doc, factura, config || {});

    doc.end();
  } catch (error) {
    next(error);
  }
};

exports.enviarFacturaEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const factura = await Factura.findByPk(id);
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada.' });
    assertSedeAccess(req.usuario, factura.sedeId);
    const result = await emailService.enviarFacturaPorEmail(id);
    if (result.skipped) {
      return res.status(400).json({ error: 'El envío por correo está desactivado en configuración.' });
    }
    return res.json({
      message: `Factura enviada a ${result.email}.`,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

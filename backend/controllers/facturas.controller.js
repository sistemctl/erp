const {
  Factura,
  Venta,
  ItemVenta,
  PagoVenta,
  OrdenReparacion,
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
  ConfiguracionSistema
} = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const { resolveQuerySede } = require('../utils/sede');
const { generarFacturaPDF } = require('../utils/factura-pdf');

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
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento', 'telefono'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Venta, as: 'venta', attributes: ['numeroVenta'] },
        { model: OrdenReparacion, as: 'ordenReparacion', attributes: ['numeroOrden'] }
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
              include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] }]
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
              include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] }]
            }
          ]
        }
      ]
    });

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
  try {
    const { id } = req.params;
    const factura = await Factura.findByPk(id, { transaction });

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada.' });
    }

    if (factura.estado === 'anulada') {
      return res.status(400).json({ error: 'Esta factura ya se encuentra anulada.' });
    }

    const valorAnterior = factura.toJSON();

    // 1. Marcar Factura como anulada
    await factura.update({ estado: 'anulada' }, { transaction });

    // 2. Si viene de una Venta POS
    if (factura.ventaId) {
      const venta = await Venta.findByPk(factura.ventaId, {
        include: [
          { model: ItemVenta, as: 'items', include: [{ model: Producto, as: 'producto' }] },
          { model: PagoVenta, as: 'pagos' }
        ],
        transaction
      });

      if (venta) {
        await venta.update({ estado: 'cancelada' }, { transaction });

        // Devolver productos al Stock de la Sede y registrar movimientos
        for (const item of venta.items) {
          const stock = await StockSede.findOne({
            where: { productoId: item.productoId, sedeId: factura.sedeId },
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
            motivo: `Devolución por anulación de Factura #${factura.numeroFactura}`,
            referenciaId: factura.id,
            usuarioId: req.usuario.userId
          }, { transaction });

          // Si el producto tiene número de serie, devolver series a stock
          if (item.producto.tieneNumeroSerie) {
            // Buscamos las series vendidas en esta venta
            // En una implementación simplificada, buscamos las series asociadas a esta venta
            // Si el IMEI está en ItemVenta o en NumeroSerie:
            // Busquemos en NumeroSerie por clienteId y productoId con fechaVenta reciente, o simplemente buscar por IMEI si lo tuviéramos
            // Para ser precisos, podemos buscar series vendidas
            // Buscamos cualquier serie asociada que tenga estado 'vendido' y coincida con el producto
            // Nota: En pos.js guardamos el IMEI en NumeroSerie al procesar la venta
            const series = await NumeroSerie.findAll({
              where: {
                productoId: item.productoId,
                clienteId: factura.clienteId || null,
                estado: 'vendido'
              },
              order: [['updatedAt', 'DESC']],
              limit: item.cantidad,
              transaction
            });

            for (const s of series) {
              await s.update({
                estado: 'en_stock',
                clienteId: null,
                fechaVenta: null
              }, { transaction });
            }
          }
        }

        // Revertir flujos de dinero de la Caja Abierta
        const caja = await Caja.findOne({
          where: { sedeId: factura.sedeId, estado: 'abierta' },
          transaction
        });

        if (caja) {
          let efectivo = 0, nequi = 0, daviplata = 0, tarjeta = 0, transferencia = 0;
          for (const pago of venta.pagos) {
            const monto = parseFloat(pago.monto);
            if (pago.metodo === 'efectivo') efectivo += monto;
            else if (pago.metodo === 'nequi') nequi += monto;
            else if (pago.metodo === 'daviplata') daviplata += monto;
            else if (pago.metodo === 'tarjeta') tarjeta += monto;
            else if (pago.metodo === 'transferencia') transferencia += monto;
          }

          await caja.update({
            totalVentasEfectivo: Math.max(0, parseFloat(caja.totalVentasEfectivo) - efectivo),
            totalVentasNequi: Math.max(0, parseFloat(caja.totalVentasNequi) - nequi),
            totalVentasDaviplata: Math.max(0, parseFloat(caja.totalVentasDaviplata) - daviplata),
            totalVentasTarjeta: Math.max(0, parseFloat(caja.totalVentasTarjeta) - tarjeta),
            totalVentasTransferencia: Math.max(0, parseFloat(caja.totalVentasTransferencia) - transferencia)
          }, { transaction });
        }

        // Anular cuentas por cobrar si es crédito
        const cpc = await CuentaPorCobrar.findOne({ where: { facturaId: factura.id }, transaction });
        if (cpc) {
          await Abono.destroy({ where: { cuentaPorCobrarId: cpc.id }, transaction });
          await cpc.destroy({ transaction });
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

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'ANULACION',
        modulo: 'Facturas',
        registroId: id,
        valorAnterior,
        valorNuevo: { estado: 'anulada' }
      });
    }

    return res.json({ message: 'Factura y transacciones asociadas anuladas con éxito.' });
  } catch (error) {
    await transaction.rollback();
    next(error);
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
        }
      ]
    });

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

const {
  Venta,
  ItemVenta,
  PagoVenta,
  Caja,
  Producto,
  StockSede,
  NumeroSerie,
  Factura,
  CuentaPorCobrar,
  MovimientoInventario,
  ConfiguracionSistema,
  Usuario,
  TradeIn,
  Cliente,
  Sede,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede } = require('../utils/sede');

exports.procesarVenta = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      clienteId,
      subtotal,
      descuentoTotal,
      iva,
      total,
      esCredito,
      observaciones,
      items, // array of { productoId, cantidad, precioBase, precioModificado, descuentoPct, imei }
      pagos, // array of { metodo, monto }
      pinAdmin // opcional para price overrides
    } = req.body;

    const { sedeId: bodySedeId } = req.body;
    const sedeId = bodySedeId || req.usuario.sedeId;

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe especificar una sede para la venta.' });
    }

    const usuarioId = req.usuario.userId;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No se puede procesar una venta sin artículos.' });
    }

    // 1. Verificar Caja Abierta
    const caja = await Caja.findOne({
      where: { sedeId, estado: 'abierta' },
      transaction
    });

    if (!caja) {
      return res.status(400).json({ error: 'Debe abrir caja antes de realizar ventas.' });
    }

    // 2. Cargar configuración del sistema para límites de descuento
    const config = await ConfiguracionSistema.findOne({ transaction });
    const maxDescuento = config ? parseFloat(config.descuentoMaximoPct) : 15.00;

    let requierePin = false;
    let autorizadoPorId = null;

    // Verificar si algún ítem requiere Price Override
    for (const item of items) {
      const producto = await Producto.findByPk(item.productoId, { transaction });
      if (!producto) {
        return res.status(404).json({ error: `Producto con ID ${item.productoId} no encontrado.` });
      }

      // Check Descuento superior al límite
      if (parseFloat(item.descuentoPct) > maxDescuento) {
        requierePin = true;
      }

      // Check venta bajo costo
      if (parseFloat(item.precioModificado) < parseFloat(producto.precioCosto)) {
        requierePin = true;
      }
    }

    // Validar PIN de administrador si se requiere
    if (requierePin) {
      if (!pinAdmin) {
        return res.status(401).json({ error: 'La transacción contiene un descuento alto o precio bajo costo. Requiere PIN del Administrador.' });
      }

      const admins = await Usuario.findAll({
        where: { rol: { [Op.in]: ['admin', 'superadmin'] }, activo: true },
        transaction
      });
      let pinValido = false;

      for (const admin of admins) {
        if (await admin.compararPassword(pinAdmin)) {
          pinValido = true;
          autorizadoPorId = admin.id;
          break;
        }
      }

      if (!pinValido) {
        return res.status(401).json({ error: 'PIN de Administrador incorrecto.' });
      }
    }

    // Generar secuencia de venta
    const countVentas = await Venta.count({ transaction });
    const numeroVenta = `VT-${String(countVentas + 1).padStart(6, '0')}`;

    // Calcular abonos
    const totalPagado = pagos.reduce((acc, curr) => acc + parseFloat(curr.monto), 0);
    const saldoPendiente = parseFloat(total) - totalPagado;

    // 3. Crear Venta
    const venta = await Venta.create({
      numeroVenta,
      clienteId: clienteId || null,
      usuarioId,
      sedeId,
      subtotal: parseFloat(subtotal),
      descuentoTotal: parseFloat(descuentoTotal),
      iva: parseFloat(iva),
      total: parseFloat(total),
      esCredito: !!esCredito,
      saldoPendiente: !!esCredito ? saldoPendiente : 0,
      estado: !!esCredito ? 'credito' : 'completada',
      observaciones
    }, { transaction });

    // 4. Crear Items de Venta e impactar Inventario
    for (const item of items) {
      const producto = await Producto.findByPk(item.productoId, { transaction });
      
      // Registrar Item
      await ItemVenta.create({
        ventaId: venta.id,
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioBase: parseFloat(item.precioBase),
        precioModificado: parseFloat(item.precioModificado),
        descuentoPct: parseFloat(item.descuentoPct),
        iva: parseFloat(item.precioModificado) * 0.19, // IVA del 19%
        subtotal: parseFloat(item.precioModificado) * item.cantidad,
        autorizadoPorAdmin: requierePin
      }, { transaction });

      // Registrar AuditLog de Price Override si aplica
      if (requierePin && (parseFloat(item.descuentoPct) > maxDescuento || parseFloat(item.precioModificado) < parseFloat(producto.precioCosto))) {
        if (req.logAudit) {
          await req.logAudit({
            accion: 'PRICE_OVERRIDE',
            modulo: 'POS',
            registroId: item.productoId,
            valorAnterior: { precioBase: item.precioBase },
            valorNuevo: { precioCobrado: item.precioModificado, autorizadoPor: autorizadoPorId }
          });
        }
      }

      // Descontar Stock de Sede
      const stock = await StockSede.findOne({
        where: { productoId: item.productoId, sedeId },
        transaction
      });

      if (!stock || stock.cantidad < item.cantidad) {
        throw new Error(`Stock insuficiente para el producto: ${producto.nombre}`);
      }

      await stock.update({ cantidad: stock.cantidad - item.cantidad }, { transaction });

      // Registrar Movimiento Inventario
      await MovimientoInventario.create({
        productoId: item.productoId,
        sedeId,
        tipo: 'salida',
        cantidad: -item.cantidad,
        motivo: `Venta POS #${numeroVenta}`,
        referenciaId: venta.id,
        usuarioId
      }, { transaction });

      // Registrar Serie/IMEI si el producto lo requiere
      if (producto.tieneNumeroSerie) {
        if (!item.imei) {
          throw new Error(`El producto ${producto.nombre} requiere número de serie/IMEI.`);
        }

        const serieReg = await NumeroSerie.findOne({
          where: { serie: item.imei, productoId: item.productoId, sedeId, estado: 'en_stock' },
          transaction
        });

        if (!serieReg) {
          throw new Error(`Número de serie/IMEI ${item.imei} no está en stock o ya fue vendido.`);
        }

        await serieReg.update({
          estado: 'vendido',
          clienteId: clienteId || null,
          fechaVenta: new Date()
        }, { transaction });
      }
    }

    // 5. Crear registros de Pagos y actualizar totales de Caja Abierta
    let efectivoPagado = 0;
    let nequiPagado = 0;
    let daviplataPagado = 0;
    let tarjetaPagado = 0;
    let transferenciaPagada = 0;

    for (const pago of pagos) {
      await PagoVenta.create({
        ventaId: venta.id,
        metodo: pago.metodo,
        monto: parseFloat(pago.monto)
      }, { transaction });

      const montoNum = parseFloat(pago.monto);
      if (pago.metodo === 'efectivo') efectivoPagado += montoNum;
      else if (pago.metodo === 'nequi') nequiPagado += montoNum;
      else if (pago.metodo === 'daviplata') daviplataPagado += montoNum;
      else if (pago.metodo === 'tarjeta') tarjetaPagado += montoNum;
      else if (pago.metodo === 'transferencia') transferenciaPagada += montoNum;
      else if (pago.metodo === 'trade_in') {
        const tradeIn = await TradeIn.findOne({
          where: { clienteId, ventaId: null },
          order: [['createdAt', 'DESC']],
          transaction
        });
        if (tradeIn) {
          await tradeIn.update({ ventaId: venta.id }, { transaction });
        }
      }
    }

    // Sumar montos a la Caja abierta
    await caja.update({
      totalVentasEfectivo: parseFloat(caja.totalVentasEfectivo) + efectivoPagado,
      totalVentasNequi: parseFloat(caja.totalVentasNequi) + nequiPagado,
      totalVentasDaviplata: parseFloat(caja.totalVentasDaviplata) + daviplataPagado,
      totalVentasTarjeta: parseFloat(caja.totalVentasTarjeta) + tarjetaPagado,
      totalVentasTransferencia: parseFloat(caja.totalVentasTransferencia) + transferenciaPagada
    }, { transaction });

    // 6. Generar Factura
    const countFacturas = await Factura.count({ transaction });
    const numeroFactura = `FE-${String(countFacturas + 1).padStart(6, '0')}`;
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 30); // 30 días plazo para crédito

    const factura = await Factura.create({
      numeroFactura,
      ventaId: venta.id,
      clienteId: clienteId || null,
      sedeId,
      subtotal: parseFloat(subtotal),
      iva: parseFloat(iva),
      total: parseFloat(total),
      estado: !!esCredito ? 'abono_parcial' : 'pagada',
      fechaVencimiento
    }, { transaction });

    // 7. Si es a crédito, registrar en Cuentas Por Cobrar (Cartera)
    if (esCredito) {
      await CuentaPorCobrar.create({
        facturaId: factura.id,
        clienteId,
        totalOriginal: parseFloat(total),
        totalAbonado: totalPagado,
        saldoPendiente,
        fechaVencimiento,
        estado: 'al_dia'
      }, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Ventas',
        registroId: venta.id,
        valorNuevo: venta.toJSON()
      });
    }

    return res.status(201).json({
      message: 'Venta registrada con éxito.',
      ventaId: venta.id,
      numeroVenta,
      facturaId: factura.id,
      numeroFactura
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// --- REPORTES DE DESCUENTOS APLICADOS ---

exports.getDescuentos = async (req, res, next) => {
  try {
    const { sedeId } = req.query;
    const where = {};
    if (sedeId) {
      where.sedeId = sedeId;
    }

    const itemsConDescuento = await ItemVenta.findAll({
      where: {
        descuentoPct: { [Op.gt]: 0 }
      },
      include: [
        {
          model: Venta,
          as: 'venta',
          where,
          attributes: ['numeroVenta', 'createdAt', 'usuarioId'],
          include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] }]
        },
        { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] }
      ],
      order: [[{ model: Venta, as: 'venta' }, 'createdAt', 'DESC']]
    });

    return res.json(itemsConDescuento);
  } catch (error) {
    next(error);
  }
};

// --- COMISIONES POR VENDEDOR ---

exports.getComisiones = async (req, res, next) => {
  try {
    const { desde, hasta, usuario } = req.query;

    const where = {
      estado: { [Op.in]: ['completada', 'credito'] }
    };

    if (desde && hasta) {
      where.createdAt = { [Op.between]: [new Date(desde), new Date(hasta)] };
    }

    if (usuario) {
      where.usuarioId = usuario;
    }

    const ventas = await Venta.findAll({
      where,
      include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'rol'] }],
      order: [['createdAt', 'DESC']]
    });

    // Comisión es el 2% sobre el valor total de la venta (configurable, por ahora estático)
    const comisiones = ventas.map(v => {
      const porcentajeComision = 0.02; // 2% comision
      return {
        ventaId: v.id,
        numeroVenta: v.numeroVenta,
        fecha: v.createdAt,
        totalVenta: parseFloat(v.total),
        vendedor: v.usuario ? v.usuario.nombre : 'Desconocido',
        comision: parseFloat((v.total * porcentajeComision).toFixed(2))
      };
    });

    const totalComisiones = comisiones.reduce((acc, curr) => acc + curr.comision, 0);

    return res.json({
      totalComisiones,
      comisiones
    });
  } catch (error) {
    next(error);
  }
};

exports.getVentas = async (req, res, next) => {
  try {
    const { sede, desde, hasta, cliente, usuario, buscar } = req.query;
    const where = {};

    const querySedeId = resolveQuerySede(sede, req.usuario);
    if (querySedeId) {
      where.sedeId = querySedeId;
    }

    if (cliente) {
      where.clienteId = cliente;
    }

    if (usuario) {
      where.usuarioId = usuario;
    }

    if (desde && hasta) {
      where.createdAt = { [Op.between]: [new Date(desde), new Date(hasta)] };
    }

    if (buscar) {
      where[Op.or] = [
        { numeroVenta: { [Op.iLike]: `%${buscar}%` } },
        { '$cliente.nombre$': { [Op.iLike]: `%${buscar}%` } }
      ];
    }

    const ventas = await Venta.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: PagoVenta, as: 'pagos' },
        { model: ItemVenta, as: 'items', include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'precioCosto'] }] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(ventas);
  } catch (error) {
    next(error);
  }
};

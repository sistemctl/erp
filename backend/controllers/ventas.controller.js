const { devolverComponentesCombo } = require('../utils/venta-inventario');
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
  DevolucionVenta,
  ItemDevolucion,
  ComboComponente,
  ItemVentaComponente,
  EgresoCaja,
  CategoriaEgreso,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede, resolveActionSede } = require('../utils/sede');
const { calcularFechaVencimientoCredito, getDiasPlazoCredito } = require('../utils/credito');
const { findCajaAbierta } = require('../utils/caja-abierta');
const { ensureConsumidorFinal } = require('../utils/consumidor-final');
const emailService = require('../services/email.service');
const { calculateSale, normalizePayments, money } = require('../utils/venta-totales');
const { nextDocumentNumber } = require('../utils/document-number');
const { assertSedeAccess } = require('../utils/sede');
const { httpError } = require('../utils/http-error');

const METODOS_CAJA = {
  efectivo: 'totalVentasEfectivo',
  nequi: 'totalVentasNequi',
  daviplata: 'totalVentasDaviplata',
  tarjeta: 'totalVentasTarjeta',
  transferencia: 'totalVentasTransferencia'
};

function montoUnitarioItem(item) {
  const qty = Math.max(1, parseInt(item.cantidad, 10) || 1);
  const sub = parseFloat(item.subtotal) || 0;
  const ivaUnit = item.ivaTotal != null ? Number(item.ivaTotal) / qty : (parseFloat(item.iva) || 0);
  return (sub / qty) + ivaUnit;
}

async function ensureCategoriaDevolucion(transaction) {
  let cat = await CategoriaEgreso.findOne({
    where: { nombre: { [Op.iLike]: 'Devolución cliente' } },
    transaction
  });
  if (!cat) {
    cat = await CategoriaEgreso.create({
      nombre: 'Devolución cliente',
      descripcion: 'Reembolsos por devoluciones de venta',
      activa: true
    }, { transaction });
  }
  return cat;
}

async function descontarComponentesCombo({
  producto,
  item,
  itemVenta,
  venta,
  sedeId,
  usuarioId,
  clienteId,
  numeroVenta,
  transaction
}) {
  const componentes = await ComboComponente.findAll({
    where: { comboId: producto.id },
    include: [{ model: Producto, as: 'producto', where: { activo: true } }],
    order: [['productoId', 'ASC']],
    transaction
  });
  if (componentes.length < 2) {
    const error = new Error(`El combo ${producto.nombre} no tiene una composición válida.`);
    error.status = 400;
    throw error;
  }

  const cantidadCombos = Number.parseInt(item.cantidad, 10);
  for (const componente of componentes) {
    const cantidadPorCombo = Number.parseInt(componente.cantidad, 10);
    const cantidadTotal = cantidadPorCombo * cantidadCombos;
    const stock = await StockSede.findOne({
      where: { productoId: componente.productoId, sedeId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!stock || Number.parseInt(stock.cantidad, 10) < cantidadTotal) {
      const error = new Error(`No hay suficiente stock de ${componente.producto.nombre} para vender ${producto.nombre}.`);
      error.status = 400;
      throw error;
    }

    let seriales = [];
    if (componente.producto.tieneNumeroSerie) {
      seriales = await NumeroSerie.findAll({
        where: { productoId: componente.productoId, sedeId, estado: 'en_stock' },
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
        limit: cantidadTotal,
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (seriales.length !== cantidadTotal) {
        const error = new Error(`No hay suficientes seriales disponibles de ${componente.producto.nombre} para vender ${producto.nombre}.`);
        error.status = 400;
        throw error;
      }
    }

    await stock.update({ cantidad: Number.parseInt(stock.cantidad, 10) - cantidadTotal }, { transaction });
    await MovimientoInventario.create({
      productoId: componente.productoId,
      sedeId,
      tipo: 'salida',
      cantidad: -cantidadTotal,
      motivo: `Venta POS #${numeroVenta} · Combo ${producto.nombre}`,
      referenciaId: venta.id,
      usuarioId
    }, { transaction });

    let serialIndex = 0;
    for (let unidadCombo = 1; unidadCombo <= cantidadCombos; unidadCombo += 1) {
      if (componente.producto.tieneNumeroSerie) {
        for (let unidad = 0; unidad < cantidadPorCombo; unidad += 1) {
          const serie = seriales[serialIndex++];
          await serie.update({ estado: 'vendido', clienteId, fechaVenta: new Date() }, { transaction });
          await ItemVentaComponente.create({
            itemVentaId: itemVenta.id,
            productoId: componente.productoId,
            cantidad: 1,
            unidadCombo,
            numeroSerieId: serie.id
          }, { transaction });
        }
      } else {
        await ItemVentaComponente.create({
          itemVentaId: itemVenta.id,
          productoId: componente.productoId,
          cantidad: cantidadPorCombo,
          unidadCombo
        }, { transaction });
      }
    }
  }
}


exports.procesarVenta = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    let {
      clienteId,
      subtotal,
      descuentoTotal,
      iva,
      total,
      esCredito,
      observaciones,
      items, // array of { productoId, cantidad, precioBase, precioModificado, descuentoPct, imei }
      pagos, // array of { metodo, monto }
      pinAdmin, // opcional para price overrides
      idempotencyKey: rawIdemKey
    } = req.body;

    const idempotencyKey = rawIdemKey ? String(rawIdemKey).slice(0, 64) : null;
    if (idempotencyKey) {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))', {
        replacements: { key: `venta:${idempotencyKey}` }, transaction
      });
      const existing = await Venta.findOne({ where: { idempotencyKey }, transaction });
      if (existing) {
        assertSedeAccess(req.usuario, existing.sedeId);
        const factura = await Factura.findOne({ where: { ventaId: existing.id }, transaction });
        const recordedPayments = await PagoVenta.findAll({ where: { ventaId: existing.id }, transaction });
        const recordedItems = await ItemVenta.findAll({ where: { ventaId: existing.id }, transaction });
        const replayChange = Array.isArray(pagos) ? normalizePayments(pagos, Number(existing.total), !!existing.esCredito).change : 0;
        await transaction.commit();
        return res.status(200).json({ ventaId: existing.id, numeroVenta: existing.numeroVenta,
          facturaId: factura?.id, numeroFactura: factura?.numeroFactura,
          subtotal: Number(existing.subtotal), descuentoTotal: Number(existing.descuentoTotal),
          iva: Number(existing.iva), total: Number(existing.total), esCredito: existing.esCredito,
          cambio: replayChange,
          pagos: recordedPayments.map((p) => ({ metodo: p.metodo, monto: Number(p.monto) })),
          items: recordedItems });
      }
    }

    const { sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);

    if (!sedeId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debe especificar una sede para la venta.' });
    }

    const usuarioId = req.usuario.userId;

    if (!Array.isArray(items) || items.length === 0 || items.some((item) => !item || typeof item !== 'object') ||
      !Array.isArray(pagos) || pagos.some((pago) => !pago || typeof pago !== 'object')) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se puede procesar una venta sin artículos.' });
    }
    if (esCredito != null && typeof esCredito !== 'boolean') throw httpError(400, 'El indicador de crédito debe ser verdadero o falso.');

    // Cliente: crédito exige registrado real; resto usa Consumidor Final (créalo si no existe)
    let resolvedClienteId = clienteId || null;
    if (!resolvedClienteId) {
      const consumidor = await ensureConsumidorFinal({ sedeId, transaction });
      resolvedClienteId = consumidor.id;
    } else {
      const cli = await Cliente.findByPk(resolvedClienteId, { transaction });
      if (!cli) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Cliente no encontrado.' });
      }
    }

    // 1. Verificar Caja Abierta (compartida por sede o del usuario)
    const { caja } = await findCajaAbierta({
      sedeId,
      usuarioId: req.usuario.userId,
      transaction
    });

    if (!caja) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debe abrir caja antes de realizar ventas.' });
    }

    // 2. Cargar configuración del sistema para límites de descuento
    const config = await ConfiguracionSistema.findOne({ transaction });
    const products = new Map();
    for (const item of items) {
      const product = await Producto.findOne({ where: { id: item.productoId, activo: true }, transaction });
      if (!product) throw httpError(404, 'Uno de los productos no existe o está inactivo.');
      products.set(String(item.productoId), product);
    }
    const calculated = calculateSale(items, products, config || {});
    ({ items, subtotal, descuentoTotal, iva, total } = calculated);
    const payment = normalizePayments(pagos, total, !!esCredito);
    pagos = payment.pagos;
    const maxDescuento = config ? parseFloat(config.descuentoMaximoPct) : 15.00;
    const metodosActivos = Array.isArray(config?.mediosPago)
      ? config.mediosPago.filter((medio) => medio?.id && medio.activo !== false).map((medio) => medio.id)
      : Object.keys(METODOS_CAJA);
    const pagoInvalido = (pagos || []).find((pago) => !metodosActivos.includes(pago.metodo) && pago.metodo !== 'trade_in');
    if (pagoInvalido) {
      await transaction.rollback();
      return res.status(400).json({ error: 'El medio de pago seleccionado no está habilitado.' });
    }

    const mediosDiferidos = (Array.isArray(config?.mediosPago) ? config.mediosPago : [])
      .filter((medio) => medio?.id && (medio.recaudoDiferido === true || medio.id === 'sistecredito'));
    const montosDiferidos = (pagos || []).filter((pago) => mediosDiferidos.some((medio) => medio.id === pago.metodo));
    const montoDiferido = montosDiferidos.reduce((sum, pago) => sum + (parseFloat(pago.monto) || 0), 0);
    const medioDiferido = mediosDiferidos.find((medio) => montosDiferidos.some((pago) => pago.metodo === medio.id));
    const esRecaudoExterno = montoDiferido > 0;

    if (esCredito && !esRecaudoExterno) {
      const cliCred = await Cliente.findByPk(resolvedClienteId, { transaction });
      const esConsumidor = !cliCred ||
        cliCred.nombre === 'Consumidor Final' ||
        ['222222222', '222222222-0', '222222222222'].includes(cliCred.documento);
      if (esConsumidor) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Debe seleccionar un cliente registrado para realizar ventas a crédito.'
        });
      }
    }

    let requierePin = false;
    let autorizadoPorId = null;

    // Verificar si algún ítem requiere Price Override
    for (const item of items) {
      const cantidadItem = Number(item.cantidad);
      if (!Number.isInteger(cantidadItem) || cantidadItem <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La cantidad de cada artículo debe ser mayor que cero.' });
      }
      const producto = await Producto.findOne({ where: { id: item.productoId, activo: true }, transaction });
      if (!producto) {
        await transaction.rollback();
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
        await transaction.rollback();
        return res.status(403).json({ error: 'La transacción contiene un descuento alto o precio bajo costo. Requiere PIN del Administrador.', code: 'ADMIN_PIN_REQUIRED' });
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
        await transaction.rollback();
        return res.status(403).json({ error: 'PIN de Administrador incorrecto.', code: 'ADMIN_PIN_INVALID' });
      }
    }

    // Generar secuencia de venta
    const numeroVenta = await nextDocumentNumber(sequelize, 'VT', transaction);

    // Calcular abonos
    const totalPagado = pagos.reduce((acc, curr) => acc + parseFloat(curr.monto), 0);
    const totalRecibido = totalPagado - montoDiferido;
    const saldoPendiente = Math.max(0, parseFloat(total) - totalRecibido);
    const ventaACredito = !!esCredito || esRecaudoExterno;

    // 3. Crear Venta
    const venta = await Venta.create({
      numeroVenta,
      clienteId: resolvedClienteId,
      usuarioId,
      sedeId,
      subtotal: parseFloat(subtotal),
      descuentoTotal: parseFloat(descuentoTotal),
      iva: parseFloat(iva),
      total: parseFloat(total),
      esCredito: ventaACredito,
      saldoPendiente: ventaACredito ? saldoPendiente : 0,
      estado: ventaACredito ? 'credito' : 'completada',
      observaciones,
      idempotencyKey: idempotencyKey || null
    }, { transaction });

    // 4. Crear Items de Venta e impactar Inventario
    for (const item of items) {
      const producto = await Producto.findByPk(item.productoId, { transaction });
      
      // Registrar Item
      const itemVenta = await ItemVenta.create({
        ventaId: venta.id,
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioBase: parseFloat(item.precioBase),
        precioModificado: parseFloat(item.precioModificado),
        descuentoPct: parseFloat(item.descuentoPct),
        iva: item.iva,
        ivaTotal: money(item.iva * item.cantidad),
        subtotal: item.subtotal,
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

      if (producto.esCombo) {
        await descontarComponentesCombo({
          producto,
          item,
          itemVenta,
          venta,
          sedeId,
          usuarioId,
          clienteId: resolvedClienteId,
          numeroVenta,
          transaction
        });
      // Servicios (mano de obra / instalación): no descuentan inventario ni series
      } else if (!producto.esServicio) {
        const stock = await StockSede.findOne({
          where: { productoId: item.productoId, sedeId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!stock || stock.cantidad < item.cantidad) {
          throw httpError(400, `Stock insuficiente para el producto: ${producto.nombre}`);
        }

        await stock.update({ cantidad: stock.cantidad - item.cantidad }, { transaction });

        await MovimientoInventario.create({
          productoId: item.productoId,
          sedeId,
          tipo: 'salida',
          cantidad: -item.cantidad,
          motivo: `Venta POS #${numeroVenta}`,
          referenciaId: venta.id,
          usuarioId
        }, { transaction });

        if (producto.tieneNumeroSerie) {
          if (!item.imei) {
            throw new Error(`El producto ${producto.nombre} requiere número de serie/IMEI.`);
          }

          const serieReg = await NumeroSerie.findOne({
            where: { serie: item.imei, productoId: item.productoId, sedeId, estado: 'en_stock' },
            transaction,
            lock: transaction.LOCK.UPDATE
          });

          if (!serieReg) {
            throw new Error(`Número de serie/IMEI ${item.imei} no está en stock o ya fue vendido.`);
          }

          await serieReg.update({
            estado: 'vendido',
            clienteId: resolvedClienteId,
            fechaVenta: new Date()
          }, { transaction });
          await itemVenta.update({ numeroSerieId: serieReg.id }, { transaction });
        }
      }
    }

    // 5. Crear registros de Pagos y actualizar totales de Caja Abierta
    let efectivoPagado = 0;
    let nequiPagado = 0;
    let daviplataPagado = 0;
    let tarjetaPagado = 0;
    let transferenciaPagada = 0;
    const totalesPorMetodo = { ...(caja.totalesPorMetodo || {}) };

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
      else if (mediosDiferidos.some((medio) => medio.id === pago.metodo)) {
        // El financiador aún no ha liquidado: no es dinero disponible en Caja.
      } else if (pago.metodo !== 'trade_in') {
        totalesPorMetodo[pago.metodo] = (parseFloat(totalesPorMetodo[pago.metodo]) || 0) + montoNum;
      }
      else if (pago.metodo === 'trade_in') {
        const tradeIn = await TradeIn.findOne({
          where: { clienteId: resolvedClienteId, sedeId, ventaId: null },
          order: [['createdAt', 'DESC']],
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!tradeIn || Math.abs(Number(tradeIn.valoracion) - montoNum) > 0.01) {
          throw httpError(400, 'El pago trade-in debe corresponder a un equipo recibido y a su valoración.');
        }
        await tradeIn.update({ ventaId: venta.id }, { transaction });
      }
    }

    // Sumar montos a la Caja abierta
    await caja.update({
      totalVentasEfectivo: parseFloat(caja.totalVentasEfectivo) + efectivoPagado,
      totalVentasNequi: parseFloat(caja.totalVentasNequi) + nequiPagado,
      totalVentasDaviplata: parseFloat(caja.totalVentasDaviplata) + daviplataPagado,
      totalVentasTarjeta: parseFloat(caja.totalVentasTarjeta) + tarjetaPagado,
      totalVentasTransferencia: parseFloat(caja.totalVentasTransferencia) + transferenciaPagada,
      totalesPorMetodo
    }, { transaction });

    // 6. Generar Factura
    const numeroFactura = await nextDocumentNumber(sequelize, 'FE', transaction);
    const diasPlazo = esRecaudoExterno
      ? Math.max(1, parseInt(medioDiferido?.plazoDias, 10) || 60)
      : await getDiasPlazoCredito(ConfiguracionSistema, transaction);
    const fechaVencimiento = calcularFechaVencimientoCredito(diasPlazo);

    const factura = await Factura.create({
      numeroFactura,
      cajaId: caja.id,
      pagosCaja: pagos.filter((pago) => pago.metodo !== 'trade_in' &&
        !mediosDiferidos.some((medio) => medio.id === pago.metodo))
        .map((pago) => ({ metodo: pago.metodo, monto: Number(pago.monto) })),
      ventaId: venta.id,
      clienteId: resolvedClienteId,
      sedeId,
      subtotal: parseFloat(subtotal),
      iva: parseFloat(iva),
      total: parseFloat(total),
      estado: ventaACredito ? 'abono_parcial' : 'pagada',
      fechaVencimiento
    }, { transaction });

    // 7. Si es a crédito, registrar en Cuentas Por Cobrar (Cartera)
    if (ventaACredito) {
      await CuentaPorCobrar.create({
        facturaId: factura.id,
        clienteId: resolvedClienteId,
        totalOriginal: parseFloat(total),
        totalAbonado: totalRecibido,
        saldoPendiente,
        fechaVencimiento,
        estado: 'al_dia',
        pagadorExterno: esRecaudoExterno ? (medioDiferido?.nombre || medioDiferido?.id || 'Financiador') : null,
        esRecaudoExterno
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

    triggerFacturaEmailAuto(factura.id);

    return res.status(201).json({
      message: 'Venta registrada con éxito.',
      ventaId: venta.id,
      numeroVenta,
      facturaId: factura.id,
      numeroFactura,
      subtotal, descuentoTotal, iva, total, pagos, cambio: payment.change,
      esCredito: ventaACredito, items
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

// Envío automático de factura por correo (no bloquea la respuesta)
function triggerFacturaEmailAuto(facturaId) {
  emailService.enviarFacturaPorEmailAuto(facturaId).catch((err) => {
    if (!err.message?.includes('sin correo') && !err.message?.includes('desactivado')) {
      console.error('[Email] Auto factura POS:', err.message);
    }
  });
}

// --- REPORTES DE DESCUENTOS APLICADOS ---

exports.getDescuentos = async (req, res, next) => {
  try {
    const { sedeId } = req.query;
    const where = {};
    const scopedSedeId = resolveQuerySede(sedeId, req.usuario);
    if (scopedSedeId) {
      where.sedeId = scopedSedeId;
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
    const scopedSedeId = resolveQuerySede(req.query.sedeId || req.query.sede, req.usuario);
    if (scopedSedeId) where.sedeId = scopedSedeId;

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
        {
          model: ItemVenta,
          as: 'items',
          include: [
            { model: Producto, as: 'producto', attributes: ['nombre', 'precioCosto', 'tieneNumeroSerie', 'esServicio', 'esCombo'] },
            {
              model: ItemVentaComponente,
              as: 'componentesVendidos',
              include: [
                { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] },
                { model: NumeroSerie, as: 'numeroSerie', attributes: ['serie'] }
              ]
            }
          ]
        },
        { model: Factura, as: 'factura', attributes: ['id', 'numeroFactura', 'estado'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(ventas);
  } catch (error) {
    next(error);
  }
};

// --- DEVOLUCIONES DE VENTA (parcial / total) ---

exports.getDevolucionesVenta = async (req, res, next) => {
  try {
    const { id } = req.params;
    const venta = await Venta.findByPk(id, { attributes: ['id', 'sedeId'] });
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada.' });
    }

    const querySedeId = resolveQuerySede(null, req.usuario);
    if (querySedeId && String(venta.sedeId) !== String(querySedeId)) {
      return res.status(403).json({ error: 'No tiene acceso a esta venta.' });
    }

    const devoluciones = await DevolucionVenta.findAll({
      where: { ventaId: id },
      include: [
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        {
          model: ItemDevolucion,
          as: 'items',
          include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] }]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(devoluciones);
  } catch (error) {
    next(error);
  }
};

exports.crearDevolucionVenta = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const { items: itemsBody, motivo, metodoReembolso } = req.body;

    if (!motivo || !String(motivo).trim()) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debe indicar el motivo de la devolución.' });
    }

    if (!Array.isArray(itemsBody) || itemsBody.length === 0 || itemsBody.some((row) => !row || typeof row !== 'object')) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Seleccione al menos un ítem a devolver.' });
    }

    await Venta.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    const venta = await Venta.findByPk(id, {
      include: [
        {
          model: ItemVenta,
          as: 'items',
          include: [
            { model: Producto, as: 'producto' },
            { model: ItemVentaComponente, as: 'componentesVendidos' }
          ]
        },
        { model: PagoVenta, as: 'pagos' },
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'documento'] },
        { model: Factura, as: 'factura' },
        { model: Sede, as: 'sede', attributes: ['id', 'nombre'] }
      ],
      transaction
    });

    if (!venta) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Venta no encontrada.' });
    }

    if (venta.estado === 'anulada') {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se puede devolver una venta anulada.' });
    }

    if (venta.devolucionEstado === 'total') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Esta venta ya fue devuelta por completo.' });
    }

    const querySedeId = resolveQuerySede(null, req.usuario);
    if (querySedeId && String(venta.sedeId) !== String(querySedeId)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'No tiene acceso a esta venta.' });
    }

    const { caja } = await findCajaAbierta({
      sedeId: venta.sedeId,
      usuarioId: req.usuario.userId,
      transaction
    });

    if (!caja) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debe abrir caja en esta sede antes de registrar una devolución.' });
    }

    const itemsById = new Map(venta.items.map((i) => [i.id, i]));
    const recordedTotal = money(venta.items.reduce((sum, item) => sum + Number(item.subtotal) +
      (item.ivaTotal != null ? Number(item.ivaTotal) : Number(item.iva) * Number(item.cantidad)), 0));
    if (Math.abs(recordedTotal - Number(venta.total)) > 0.01) {
      throw httpError(409, 'Esta venta histórica tiene importes de artículos que no coinciden con su total. Debe conciliarse antes de reembolsar.');
    }
    const requestedIds = itemsBody.map((row) => String(row.itemVentaId || row.id || ''));
    if (new Set(requestedIds).size !== requestedIds.length) {
      throw httpError(400, 'No se puede repetir un artículo en la devolución.');
    }
    const lineas = [];
    let totalDev = 0;

    for (const row of itemsBody) {
      const itemVentaId = row.itemVentaId || row.id;
      const cantidad = Number(row.cantidad);
      if (!itemVentaId || !Number.isSafeInteger(cantidad) || cantidad <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Cantidad de devolución inválida.' });
      }

      const item = itemsById.get(itemVentaId);
      if (!item) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Ítem de venta no válido.' });
      }

      const yaDev = parseInt(item.cantidadDevuelta, 10) || 0;
      const disponible = item.cantidad - yaDev;
      if (cantidad > disponible) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Solo puede devolver ${disponible} ud(s) de ${item.producto?.nombre || 'producto'}.`
        });
      }

      const montoLinea = money(montoUnitarioItem(item) * (yaDev + cantidad)) - money(montoUnitarioItem(item) * yaDev);
      totalDev += montoLinea;
      lineas.push({ item, cantidad, montoLinea });
    }

    totalDev = Math.round(totalDev * 100) / 100;
    const refunded = Number(await DevolucionVenta.sum('total', { where: { ventaId: venta.id }, transaction })) || 0;
    if (money(refunded + totalDev) > money(venta.total)) {
      throw httpError(409, 'La devolución excede el importe original de la venta.');
    }

    let metodo = String(metodoReembolso || '').toLowerCase();
    if (!metodo || metodo === 'mismo') {
      if (venta.esCredito || venta.estado === 'credito') {
        metodo = 'credito';
      } else if (venta.pagos?.length === 1) {
        metodo = venta.pagos[0].metodo;
      } else {
        metodo = 'efectivo';
      }
    }

    const metodosValidos = [...Object.keys(METODOS_CAJA), 'credito'];
    if (!metodosValidos.includes(metodo)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Método de reembolso inválido.' });
    }

    const numero = await nextDocumentNumber(sequelize, 'DEV', transaction);

    const devolucion = await DevolucionVenta.create({
      numero,
      ventaId: venta.id,
      sedeId: venta.sedeId,
      usuarioId: req.usuario.userId,
      cajaId: caja.id,
      motivo: String(motivo).trim(),
      total: totalDev,
      metodoReembolso: metodo
    }, { transaction });

    for (const { item, cantidad, montoLinea } of lineas) {
      await ItemDevolucion.create({
        devolucionId: devolucion.id,
        itemVentaId: item.id,
        productoId: item.productoId,
        cantidad,
        montoLinea
      }, { transaction });

      const nuevaDevuelta = (parseInt(item.cantidadDevuelta, 10) || 0) + cantidad;
      await item.update({ cantidadDevuelta: nuevaDevuelta }, { transaction });

      const esComboVendido = Array.isArray(item.componentesVendidos) && item.componentesVendidos.length > 0;
      if (esComboVendido) {
        await devolverComponentesCombo({
          item,
          cantidad,
          yaDev: nuevaDevuelta - cantidad,
          venta,
          devolucion,
          numero,
          usuarioId: req.usuario.userId,
          transaction
        });
      // Servicios no tocaron inventario al vender: no devolver stock
      } else if (!item.producto?.esServicio) {
        if (item.producto?.esCombo) throw httpError(409, 'Esta venta antigua no conserva los componentes originales del combo. Debe regularizarse antes de devolver.');
        const stock = await StockSede.findOne({
          where: { productoId: item.productoId, sedeId: venta.sedeId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (stock) {
          await stock.update({ cantidad: stock.cantidad + cantidad }, { transaction });
        } else {
          await StockSede.create({
            productoId: item.productoId,
            sedeId: venta.sedeId,
            cantidad
          }, { transaction });
        }

        await MovimientoInventario.create({
          productoId: item.productoId,
          sedeId: venta.sedeId,
          tipo: 'entrada',
          cantidad,
          motivo: `Devolución cliente ${numero} (venta ${venta.numeroVenta})`,
          referenciaId: devolucion.id,
          usuarioId: req.usuario.userId
        }, { transaction });

        if (item.producto?.tieneNumeroSerie) {
          if (!item.numeroSerieId) throw httpError(409, 'Esta venta antigua no tiene su IMEI vinculado. Debe regularizarse antes de devolver el equipo.');
          const serie = await NumeroSerie.findByPk(item.numeroSerieId, { transaction, lock: transaction.LOCK.UPDATE });
          if (!serie || serie.estado !== 'vendido' || String(serie.productoId) !== String(item.productoId)) {
            throw httpError(409, 'El IMEI original de esta venta no está disponible para devolución.');
          }
          await serie.update({ estado: 'en_stock', clienteId: null, fechaVenta: null }, { transaction });
        }
      }
    }

    // Ajuste de caja / crédito
    if (metodo === 'credito' && venta.factura) {
      const cpc = await CuentaPorCobrar.findOne({
        where: { facturaId: venta.factura.id },
        transaction
      });
      if (cpc) {
        const nuevoSaldo = Math.max(0, parseFloat(cpc.saldoPendiente) - totalDev);
        await cpc.update({
          saldoPendiente: nuevoSaldo,
          estado: nuevoSaldo <= 0 ? 'pagada' : cpc.estado
        }, { transaction });
        const nuevoSaldoVenta = Math.max(0, parseFloat(venta.saldoPendiente || 0) - totalDev);
        await venta.update({ saldoPendiente: nuevoSaldoVenta }, { transaction });
      }
    } else if (METODOS_CAJA[metodo]) {
      if (metodo === 'efectivo') {
        const disponible = parseFloat(caja.montoApertura)
          + parseFloat(caja.totalVentasEfectivo)
          - parseFloat(caja.totalEgresos);
        if (totalDev > disponible + 0.01) {
          await transaction.rollback();
          return res.status(400).json({
            error: `No hay suficiente efectivo en caja para reembolsar (disponible: $${disponible.toLocaleString('es-CO')}).`
          });
        }
        const cat = await ensureCategoriaDevolucion(transaction);
        await EgresoCaja.create({
          cajaId: caja.id,
          usuarioId: req.usuario.userId,
          categoriaId: cat.id,
          monto: totalDev,
          motivo: `Devolución ${numero} — ${venta.numeroVenta}: ${String(motivo).trim()}`,
          requirioPin: false
        }, { transaction });
        await caja.update({
          totalEgresos: parseFloat(caja.totalEgresos) + totalDev
        }, { transaction });
      } else {
        const campo = METODOS_CAJA[metodo];
        const actual = parseFloat(caja[campo]) || 0;
        await caja.update({
          [campo]: Math.max(0, actual - totalDev)
        }, { transaction });
      }
    }

    // Recalcular estado de devolución de la venta
    await venta.reload({
      include: [{ model: ItemVenta, as: 'items' }],
      transaction
    });
    const allReturned = venta.items.every(
      (i) => (parseInt(i.cantidadDevuelta, 10) || 0) >= i.cantidad
    );
    const anyReturned = venta.items.some(
      (i) => (parseInt(i.cantidadDevuelta, 10) || 0) > 0
    );
    await venta.update({
      devolucionEstado: allReturned ? 'total' : anyReturned ? 'parcial' : 'ninguna'
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Devoluciones',
        registroId: devolucion.id,
        valorNuevo: { numero, ventaId: venta.id, total: totalDev, metodo }
      });
    }

    const completa = await DevolucionVenta.findByPk(devolucion.id, {
      include: [
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        {
          model: ItemDevolucion,
          as: 'items',
          include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] }]
        },
        {
          model: Venta,
          as: 'venta',
          attributes: ['id', 'numeroVenta', 'devolucionEstado'],
          include: [
            { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento'] },
            { model: Sede, as: 'sede', attributes: ['nombre'] }
          ]
        }
      ]
    });

    return res.status(201).json({
      message: 'Devolución registrada con éxito.',
      devolucion: completa
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

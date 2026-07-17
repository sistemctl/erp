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
  const ivaUnit = parseFloat(item.iva) || 0;
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
      pinAdmin, // opcional para price overrides
      idempotencyKey: rawIdemKey
    } = req.body;

    const idempotencyKey = rawIdemKey ? String(rawIdemKey).slice(0, 64) : null;
    if (idempotencyKey) {
      const existing = await Venta.findOne({ where: { idempotencyKey }, transaction });
      if (existing) {
        await transaction.commit();
        return res.status(200).json(existing);
      }
    }

    const { sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);

    if (!sedeId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debe especificar una sede para la venta.' });
    }

    const usuarioId = req.usuario.userId;

    if (!items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se puede procesar una venta sin artículos.' });
    }

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

    if (esCredito) {
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
      clienteId: resolvedClienteId,
      usuarioId,
      sedeId,
      subtotal: parseFloat(subtotal),
      descuentoTotal: parseFloat(descuentoTotal),
      iva: parseFloat(iva),
      total: parseFloat(total),
      esCredito: !!esCredito,
      saldoPendiente: !!esCredito ? saldoPendiente : 0,
      estado: !!esCredito ? 'credito' : 'completada',
      observaciones,
      idempotencyKey: idempotencyKey || null
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

      // Servicios (mano de obra / instalación): no descuentan inventario ni series
      if (!producto.esServicio) {
        const stock = await StockSede.findOne({
          where: { productoId: item.productoId, sedeId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!stock || stock.cantidad < item.cantidad) {
          throw new Error(`Stock insuficiente para el producto: ${producto.nombre}`);
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
            transaction
          });

          if (!serieReg) {
            throw new Error(`Número de serie/IMEI ${item.imei} no está en stock o ya fue vendido.`);
          }

          await serieReg.update({
            estado: 'vendido',
            clienteId: resolvedClienteId,
            fechaVenta: new Date()
          }, { transaction });
        }
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
          where: { clienteId: resolvedClienteId, ventaId: null },
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
    const diasPlazo = await getDiasPlazoCredito(ConfiguracionSistema);
    const fechaVencimiento = calcularFechaVencimientoCredito(diasPlazo);

    const factura = await Factura.create({
      numeroFactura,
      ventaId: venta.id,
      clienteId: resolvedClienteId,
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
        clienteId: resolvedClienteId,
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

    triggerFacturaEmailAuto(factura.id);

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
        { model: ItemVenta, as: 'items', include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'precioCosto', 'tieneNumeroSerie', 'esServicio'] }] },
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
  try {
    const { id } = req.params;
    const { items: itemsBody, motivo, metodoReembolso } = req.body;

    if (!motivo || !String(motivo).trim()) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debe indicar el motivo de la devolución.' });
    }

    if (!Array.isArray(itemsBody) || itemsBody.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Seleccione al menos un ítem a devolver.' });
    }

    const venta = await Venta.findByPk(id, {
      include: [
        { model: ItemVenta, as: 'items', include: [{ model: Producto, as: 'producto' }] },
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
    const lineas = [];
    let totalDev = 0;

    for (const row of itemsBody) {
      const itemVentaId = row.itemVentaId || row.id;
      const cantidad = parseInt(row.cantidad, 10);
      if (!itemVentaId || !cantidad || cantidad <= 0) {
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

      const montoLinea = Math.round(montoUnitarioItem(item) * cantidad * 100) / 100;
      totalDev += montoLinea;
      lineas.push({ item, cantidad, montoLinea });
    }

    totalDev = Math.round(totalDev * 100) / 100;

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

    const countDev = await DevolucionVenta.count({ transaction });
    const numero = `DEV-${String(countDev + 1).padStart(6, '0')}`;

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

      // Servicios no tocaron inventario al vender: no devolver stock
      if (!item.producto?.esServicio) {
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
          const series = await NumeroSerie.findAll({
            where: {
              productoId: item.productoId,
              sedeId: venta.sedeId,
              estado: 'vendido',
              ...(venta.clienteId ? { clienteId: venta.clienteId } : {})
            },
            order: [['updatedAt', 'DESC']],
            limit: cantidad,
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
    await transaction.rollback();
    next(error);
  }
};

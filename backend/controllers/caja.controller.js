const { Caja, EgresoCaja, CategoriaEgreso, Usuario, ConfiguracionSistema, Sede, Venta, Cliente, Factura, PagoVenta, ItemVenta, Producto, Abono, CuentaPorCobrar, PagoCompra, OrdenCompra, Proveedor, DevolucionVenta, sequelize } = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede, resolveActionSede, assertSedeAccess } = require('../utils/sede');
const { findCajaAbierta, isCajaCompartidaSede } = require('../utils/caja-abierta');
const { generarCierrePDF } = require('../utils/cierre-pdf');
const { cajaHistorica } = require('../utils/caja-cobros');
const { fechaOperativa, cierrePendiente } = require('../utils/caja-fecha');

function getLocalDateStr(date = new Date()) {
  return fechaOperativa(date);
}

// --- APERTURA DE CAJA ---

exports.aperturaCaja = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { montoApertura, sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe seleccionar la sede para abrir caja.' });
    }

    const parsedMonto = Number(montoApertura);
    if (montoApertura === undefined || montoApertura === null || montoApertura === '' || !Number.isFinite(parsedMonto) || parsedMonto < 0) {
      return res.status(400).json({ error: 'Monto de apertura inválido.' });
    }

    // Bloquear la sede también cuando todavía no hay una fila de caja para bloquear.
    await Sede.findByPk(sedeId, { transaction, lock: transaction.LOCK.UPDATE });
    const compartida = await isCajaCompartidaSede(transaction);
    const { caja: cajaAbierta } = await findCajaAbierta({
      permitirPendiente: true,
      sedeId,
      usuarioId: req.usuario.userId,
      transaction
    });

    if (cajaAbierta) {
      return res.status(400).json({
        error: compartida
          ? 'Ya existe una caja abierta para esta sede.'
          : 'Ya tienes una caja abierta en esta sede.'
      });
    }

    const hoyStr = getLocalDateStr();

    const caja = await Caja.create({
      sedeId,
      usuarioAperturaId: req.usuario.userId,
      montoApertura: parseFloat(montoApertura),
      fecha: hoyStr,
      estado: 'abierta',
      totalVentasEfectivo: 0,
      totalVentasNequi: 0,
      totalVentasDaviplata: 0,
      totalVentasTarjeta: 0,
      totalVentasTransferencia: 0,
      totalEgresos: 0,
      diferencia: 0
    }, { transaction });

    await transaction.commit();
    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Caja',
        registroId: caja.id,
        valorNuevo: caja.toJSON()
      });
    }

    return res.status(201).json(caja);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

// --- EGRESO DE CAJA ---

exports.egresoCaja = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { monto, categoriaId, motivo, pinAdmin, sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);

    const parsedMonto = parseFloat(monto);
    if (!monto || isNaN(parsedMonto) || parsedMonto <= 0 || !categoriaId || !motivo) {
      return res.status(400).json({ error: 'Parámetros de egreso incompletos o monto inválido.' });
    }

    // 1. Obtener la caja abierta (compartida por sede o solo la del usuario)
    const { caja, compartida } = await findCajaAbierta({
      sedeId,
      usuarioId: req.usuario.userId,
      transaction
    });

    if (!caja) {
      return res.status(400).json({
        error: compartida
          ? 'No hay ninguna caja abierta en esta sede para registrar egresos.'
          : 'No tienes una caja abierta en esta sede para registrar egresos.'
      });
    }

    const efectivoDisponible = parseFloat(caja.montoApertura) + parseFloat(caja.totalVentasEfectivo) - parseFloat(caja.totalEgresos);
    if (parseFloat(monto) > efectivoDisponible) {
      return res.status(400).json({
        error: `El monto supera el efectivo disponible en caja ($${efectivoDisponible.toLocaleString('es-CO')}).`
      });
    }

    // 2. Obtener configuración del sistema
    const config = await ConfiguracionSistema.findOne({ transaction });
    const limiteSinPin = config ? parseFloat(config.egresoMaximoSinPin) : 50000.00;

    let requirioPin = false;
    let autorizadoPorId = null;

    if (parseFloat(monto) > limiteSinPin) {
      if (!pinAdmin) {
        return res.status(403).json({ error: 'Este monto supera el límite permitido. Requiere PIN del Administrador.', code: 'ADMIN_PIN_REQUIRED' });
      }

      // Buscar administrador que coincida con la contraseña/PIN
      const administradores = await Usuario.findAll({
        where: { rol: { [Op.in]: ['admin', 'superadmin'] }, activo: true },
        transaction
      });
      let pinValido = false;

      for (const admin of administradores) {
        if (await admin.compararPassword(pinAdmin)) {
          pinValido = true;
          autorizadoPorId = admin.id;
          break;
        }
      }

      if (!pinValido) {
        return res.status(403).json({ error: 'PIN de Administrador inválido.', code: 'ADMIN_PIN_INVALID' });
      }
      requirioPin = true;
    }

    // 3. Crear el egreso
    const egreso = await EgresoCaja.create({
      cajaId: caja.id,
      usuarioId: req.usuario.userId,
      categoriaId,
      monto: parseFloat(monto),
      motivo,
      requirioPin,
      autorizadoPor: autorizadoPorId
    }, { transaction });

    // 4. Actualizar totalEgresos en la Caja
    await caja.update({
      totalEgresos: parseFloat(caja.totalEgresos) + parseFloat(monto)
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'EGRESO_CAJA',
        modulo: 'Caja',
        registroId: egreso.id,
        valorNuevo: egreso.toJSON()
      });
    }

    return res.status(201).json(egreso);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

// --- CIERRE DE CAJA ---

exports.cierreCaja = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const {
      totalVentasEfectivo,
      totalVentasNequi,
      totalVentasDaviplata,
      totalVentasTarjeta,
      totalVentasTransferencia,
      totalesPorMetodo,
      observaciones,
      sedeId: bodySedeId
    } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);

    const declarados = { ...(totalesPorMetodo || {}), efectivo: totalVentasEfectivo, nequi: totalVentasNequi,
      daviplata: totalVentasDaviplata, tarjeta: totalVentasTarjeta, transferencia: totalVentasTransferencia };
    if (totalVentasEfectivo === undefined || (totalesPorMetodo !== undefined &&
      (!totalesPorMetodo || typeof totalesPorMetodo !== 'object' || Array.isArray(totalesPorMetodo)))) {
      return res.status(400).json({ error: 'Indique el efectivo contado y un desglose de arqueo válido.' });
    }
    const arqueoDeclarado = {};
    for (const [medio, valor] of Object.entries(declarados)) {
      if (valor === undefined) continue;
      if (valor === null || typeof valor === 'boolean' || String(valor).trim() === '' ||
        !Number.isFinite(Number(valor)) || Number(valor) < 0) {
        return res.status(400).json({ error: 'Los importes del cierre deben ser finitos y no negativos.' });
      }
      arqueoDeclarado[medio] = Number(valor);
    }

    let caja;
    if (req.body.cajaId) {
      caja = await Caja.findByPk(req.body.cajaId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!caja || caja.estado !== 'abierta') {
        return res.status(409).json({ error: 'La caja seleccionada ya está cerrada o no existe.' });
      }
      assertSedeAccess(req.usuario, caja.sedeId);
      const compartida = await isCajaCompartidaSede(transaction);
      if (String(caja.sedeId) !== String(sedeId) || (!compartida &&
        String(caja.usuarioAperturaId) !== String(req.usuario.userId) &&
        !['admin', 'superadmin'].includes(req.usuario.rol))) {
        return res.status(403).json({ error: 'No tiene permiso para cerrar esta caja.' });
      }
    } else {
      ({ caja } = await findCajaAbierta({ sedeId, usuarioId: req.usuario.userId, transaction, permitirPendiente: true }));
    }
    if (!caja) return res.status(400).json({ error: 'No hay una caja abierta para cerrar.' });
    const administrativo = req.cierreAdministrativo === true;
    const motivo = typeof observaciones === 'string' ? observaciones.trim() : '';
    if ((administrativo || cierrePendiente(caja)) && !motivo) {
      return res.status(400).json({ error: 'Indique el motivo del cierre pendiente o administrativo.' });
    }

    // Calcular montos reales del sistema
    const efectivoTeorico = parseFloat(caja.montoApertura) + parseFloat(caja.totalVentasEfectivo) - parseFloat(caja.totalEgresos);
    const efectivoReal = Number(totalVentasEfectivo);

    const diferencia = efectivoReal - efectivoTeorico;

    await caja.update({
      estado: 'cerrada',
      usuarioCierreId: req.usuario.userId,
      horaCierre: new Date(),
      arqueoDeclarado,
      ingresosAlCierre: {
        efectivo: Number(caja.totalVentasEfectivo), nequi: Number(caja.totalVentasNequi),
        daviplata: Number(caja.totalVentasDaviplata), tarjeta: Number(caja.totalVentasTarjeta),
        transferencia: Number(caja.totalVentasTransferencia), extras: caja.totalesPorMetodo || {}
      },
      diferencia,
      observaciones: administrativo ? `Cierre administrativo: ${motivo}` : motivo
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Caja',
        registroId: caja.id,
        valorNuevo: caja.toJSON()
      });
    }

    return res.json({
      message: 'Caja cerrada exitosamente.',
      caja
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

// --- LEER REPORTES Y EGRESOS ---

const cajaReporteInclude = [
  { model: EgresoCaja, as: 'egresos', include: [{ model: CategoriaEgreso, as: 'categoria', attributes: ['nombre'] }] },
  { model: Usuario, as: 'usuarioApertura', attributes: ['id', 'nombre'] },
  { model: Sede, as: 'sede', attributes: ['id', 'nombre'] }
];

exports.getReporteCaja = async (req, res, next) => {
  try {
    const { fecha, sede } = req.query;
    const querySedeId = resolveQuerySede(sede, req.usuario) || req.usuario.sedeId;
    const queryFecha = fecha || getLocalDateStr();

    if (!querySedeId) {
      return res.status(400).json({ error: 'Debe indicar la sede para consultar la caja.' });
    }

    const hoyStr = getLocalDateStr();
    let caja = null;

    // 1) Si se consulta hoy o no se envió fecha, priorizar caja ABIERTA
    if (!fecha || queryFecha === hoyStr) {
      const resAbierta = await findCajaAbierta({
        permitirPendiente: true,
        sedeId: querySedeId,
        usuarioId: req.usuario.userId,
        include: cajaReporteInclude
      });
      caja = resAbierta.caja;
      // Un administrador puede recuperar también sesiones individuales de otros cajeros.
      if (req.query.recuperarPendiente === 'true' && ['admin', 'superadmin'].includes(req.usuario.rol)) {
        const pendiente = await Caja.findOne({
          where: { sedeId: querySedeId, estado: 'abierta', fecha: { [Op.lt]: hoyStr } },
          order: [['createdAt', 'ASC']], include: cajaReporteInclude
        });
        caja = pendiente || caja;
      }
    }

    // 2) Si no hay abierta o es consulta de fecha pasada, buscar registro en esa fecha
    if (!caja) {
      caja = await Caja.findOne({
        where: {
          sedeId: querySedeId,
          fecha: queryFecha
        },
        order: [['createdAt', 'DESC']],
        include: cajaReporteInclude
      });
    }

    if (!caja) {
      return res.json({
        estado: 'sin_registro',
        sedeId: querySedeId,
        fecha: queryFecha
      });
    }

    return res.json({ ...caja.toJSON(), cierrePendiente: cierrePendiente(caja), fechaOperativa: hoyStr });
  } catch (error) {
    next(error);
  }
};

exports.getEgresos = async (req, res, next) => {
  try {
    const { sede, fecha } = req.query;
    const querySedeId = resolveQuerySede(sede, req.usuario) || req.usuario.sedeId;
    const queryFecha = fecha || getLocalDateStr();

    if (!querySedeId) {
      return res.status(400).json({ error: 'Debe indicar la sede para consultar egresos.' });
    }

    const egresos = await EgresoCaja.findAll({
      include: [
        {
          model: Caja,
          as: 'caja',
          where: {
            sedeId: querySedeId,
            fecha: queryFecha
          },
          attributes: []
        },
        { model: CategoriaEgreso, as: 'categoria', attributes: ['nombre'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] }
      ]
    });

    return res.json(egresos);
  } catch (error) {
    next(error);
  }
};

exports.getCategoriasEgreso = async (req, res, next) => {
  try {
    const categorias = await CategoriaEgreso.findAll({ where: { activa: true } });
    return res.json(categorias);
  } catch (error) {
    next(error);
  }
};

exports.getHistorialCajas = async (req, res, next) => {
  try {
    const { sede, desde, hasta } = req.query;
    const where = {};
    
    const querySedeId = resolveQuerySede(sede, req.usuario);
    if (querySedeId) {
      where.sedeId = querySedeId;
    }
    
    if (desde && hasta) {
      where.fecha = { [Op.between]: [desde, hasta] };
    }

    const cajas = await Caja.findAll({
      where,
      include: [
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Usuario, as: 'usuarioApertura', attributes: ['nombre'] },
        { model: Usuario, as: 'usuarioCierre', attributes: ['nombre'] }
      ],
      order: [['fecha', 'DESC'], ['createdAt', 'DESC']]
    });

    return res.json(cajas);
  } catch (error) {
    next(error);
  }
};

/**
 * Bitacora financiera normalizada. Los pagos de una venta se muestran por
 * separado para no repetir el total cuando se usaron medios de pago mixtos.
 * GET /caja/movimientos?sede=&desde=&hasta=&tipo=&page=&limit=
 */
exports.getMovimientosFinancieros = async (req, res, next) => {
  try {
    const { sede, desde, hasta, tipo } = req.query;
    const querySedeId = resolveQuerySede(sede, req.usuario);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const allowedTypes = new Set(['apertura', 'venta', 'abono', 'egreso', 'pago_compra', 'devolucion', 'servicio', 'anulacion']);

    if (tipo && !allowedTypes.has(tipo)) {
      return res.status(400).json({ error: 'Tipo de movimiento no válido.' });
    }

    const createdAt = {};
    if (desde) createdAt[Op.gte] = new Date(`${desde}T00:00:00`);
    if (hasta) createdAt[Op.lte] = new Date(`${hasta}T23:59:59.999`);
    const filtrarFecha = Reflect.ownKeys(createdAt).length > 0;
    const whereFecha = filtrarFecha ? { createdAt } : {};
    const enRango = (fecha) => fecha && (!desde || new Date(fecha) >= createdAt[Op.gte]) &&
      (!hasta || new Date(fecha) <= createdAt[Op.lte]);
    const money = (value) => parseFloat(value || 0);
    const paymentLabel = {
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
      transferencia: 'Transferencia',
      trade_in: 'Trade-in',
      caja_efectivo: 'Caja en efectivo',
      efectivo_externo: 'Efectivo externo',
      transferencia_empresa: 'Transferencia empresa',
      otro: 'Otro'
    };
    const configSistema = await ConfiguracionSistema.findOne();
    const mediosDiferidos = new Set((Array.isArray(configSistema?.mediosPago) ? configSistema.mediosPago : [])
      .filter((medio) => medio?.recaudoDiferido === true || medio?.id === 'sistecredito')
      .map((medio) => medio.id));

    const [cajas, ventas, abonos, egresos, pagosCompra, devoluciones, facturas] = await Promise.all([
      Caja.findAll({
        where: { ...whereFecha, ...(querySedeId ? { sedeId: querySedeId } : {}) },
        include: [
          { model: Sede, as: 'sede', attributes: ['nombre'] },
          { model: Usuario, as: 'usuarioApertura', attributes: ['nombre'] }
        ]
      }),
      Venta.findAll({
        where: {
          ...whereFecha,
          ...(querySedeId ? { sedeId: querySedeId } : {})
        },
        include: [
          { model: Cliente, as: 'cliente', attributes: ['nombre'] },
          { model: Usuario, as: 'usuario', attributes: ['nombre'] },
          { model: PagoVenta, as: 'pagos', attributes: ['id', 'metodo', 'monto'] },
          { model: Factura, as: 'factura', attributes: ['numeroFactura', 'pagosCaja'] },
          {
            model: ItemVenta,
            as: 'items',
            attributes: ['cantidad'],
            include: [{ model: Producto, as: 'producto', attributes: ['nombre'] }]
          }
        ]
      }),
      Abono.findAll({
        where: filtrarFecha ? { [Op.or]: [{ createdAt }, { anuladoAt: createdAt }] } : {},
        include: [
          { model: Usuario, as: 'usuario', attributes: ['nombre'] },
          {
            model: CuentaPorCobrar,
            as: 'cuentaPorCobrar',
            required: true,
            include: [
              { model: Cliente, as: 'cliente', attributes: ['nombre'] },
              {
                model: Factura,
                as: 'factura',
                required: true,
                where: querySedeId ? { sedeId: querySedeId } : undefined,
                attributes: ['numeroFactura']
              }
            ]
          }
        ]
      }),
      EgresoCaja.findAll({
        where: whereFecha,
        include: [
          {
            model: Caja,
            as: 'caja',
            required: true,
            where: querySedeId ? { sedeId: querySedeId } : undefined,
            attributes: ['fecha'],
            include: [{ model: Sede, as: 'sede', attributes: ['nombre'] }]
          },
          { model: CategoriaEgreso, as: 'categoria', attributes: ['nombre'] },
          { model: Usuario, as: 'usuario', attributes: ['nombre'] },
          { model: Usuario, as: 'autorizador', attributes: ['nombre'] }
        ]
      }),
      PagoCompra.findAll({
        where: whereFecha,
        include: [
          { model: Usuario, as: 'usuario', attributes: ['nombre'] },
          {
            model: OrdenCompra,
            as: 'ordenCompra',
            required: true,
            where: querySedeId ? { sedeId: querySedeId } : undefined,
            include: [{ model: Proveedor, as: 'proveedor', attributes: ['nombre'] }]
          }
        ]
      }),
      DevolucionVenta.findAll({
        where: { ...whereFecha, ...(querySedeId ? { sedeId: querySedeId } : {}) },
        include: [
          { model: Usuario, as: 'usuario', attributes: ['nombre'] },
          {
            model: Venta,
            as: 'venta',
            attributes: ['numeroVenta'],
            include: [{ model: Cliente, as: 'cliente', attributes: ['nombre'] }]
          }
        ]
      }),
      Factura.findAll({
        where: { ...(querySedeId ? { sedeId: querySedeId } : {}),
          ...(filtrarFecha ? { [Op.or]: [{ createdAt }, { cajaRevertidaAt: createdAt }] } : {}) },
        include: [{ model: Cliente, as: 'cliente', attributes: ['nombre'] }]
      })
    ]);

    const items = [
      ...cajas.map((caja) => ({
        id: `apertura-${caja.id}`,
        tipo: 'apertura',
        direccion: 'entrada',
        fecha: caja.createdAt,
        concepto: 'Apertura de caja',
        responsable: caja.usuarioApertura?.nombre || 'Sin registro',
        referencia: `Caja ${caja.fecha}`,
        monto: money(caja.montoApertura),
        medioPago: 'Efectivo',
        detalle: `Base inicial de caja${caja.sede ? ` · ${caja.sede.nombre}` : ''}`,
        origen: {
          modulo: 'Caja',
          documento: `Caja ${caja.fecha}`,
          sede: caja.sede?.nombre || 'Sin sede',
          ruta: '#/caja'
        }
      })),
      ...ventas.flatMap((venta) => (venta.factura?.pagosCaja ?? venta.pagos ?? [])
        .filter((pago) => money(pago.monto) > 0 && pago.metodo !== 'trade_in' &&
          (venta.factura?.pagosCaja != null || !mediosDiferidos.has(pago.metodo)))
        .map((pago, indice) => ({
          id: `venta-${venta.id}-${indice}`,
          tipo: 'venta',
          direccion: 'entrada',
          fecha: venta.createdAt,
          concepto: `Venta ${venta.numeroVenta}`,
          responsable: venta.usuario?.nombre || 'Sin registro',
          referencia: venta.numeroVenta,
          monto: money(pago.monto),
          medioPago: paymentLabel[pago.metodo] || pago.metodo,
          detalle: `Cliente: ${venta.cliente?.nombre || 'Consumidor final'}`,
          origen: {
            modulo: 'Ventas',
            documento: venta.factura?.numeroFactura || venta.numeroVenta,
            tercero: venta.cliente?.nombre || 'Consumidor final',
            totalOperacion: money(venta.total),
            pagos: (venta.pagos || []).map((item) => ({
              medio: paymentLabel[item.metodo] || item.metodo,
              monto: money(item.monto)
            })),
            items: (venta.items || []).map((item) => ({
              nombre: item.producto?.nombre || 'Producto',
              cantidad: parseInt(item.cantidad, 10) || 0
            })),
            ruta: '#/ventas'
          }
        }))),
      ...abonos.filter((abono) => enRango(abono.createdAt)).map((abono) => ({
        id: `abono-${abono.id}`,
        tipo: 'abono',
        direccion: 'entrada',
        fecha: abono.createdAt,
        concepto: 'Abono de cartera',
        responsable: abono.usuario?.nombre || 'Sin registro',
        referencia: abono.cuentaPorCobrar?.factura?.numeroFactura || 'Cuenta por cobrar',
        monto: money(abono.monto),
        medioPago: paymentLabel[abono.metodo] || abono.metodo,
        detalle: `Cliente: ${abono.cuentaPorCobrar?.cliente?.nombre || 'Sin registro'}${abono.observaciones ? ` · ${abono.observaciones}` : ''}`,
        origen: {
          modulo: 'Cartera',
          documento: abono.cuentaPorCobrar?.factura?.numeroFactura || 'Cuenta por cobrar',
          tercero: abono.cuentaPorCobrar?.cliente?.nombre || 'Sin registro',
          ruta: '#/cartera'
        }
      })),
      ...facturas.filter((factura) => !factura.ventaId && enRango(factura.createdAt))
        .flatMap((factura) => (factura.pagosCaja || []).map((pago, indice) => ({
          id: `servicio-${factura.id}-${indice}`, tipo: 'servicio', direccion: 'entrada', fecha: factura.createdAt,
          concepto: factura.ordenReparacionId ? 'Cobro de reparación' : 'Cobro de instalación',
          responsable: 'Sin registro', referencia: factura.numeroFactura, monto: money(pago.monto),
          medioPago: paymentLabel[pago.metodo] || pago.metodo,
          detalle: `Cliente: ${factura.cliente?.nombre || 'Cliente'}`,
          origen: { modulo: 'Facturas', documento: factura.numeroFactura, ruta: '#/facturacion' }
        }))),
      ...facturas.filter((factura) => enRango(factura.cajaRevertidaAt))
        .flatMap((factura) => (factura.pagosCaja || []).map((pago, indice) => ({
          id: `anulacion-${factura.id}-${indice}`, tipo: 'anulacion', direccion: 'salida', fecha: factura.cajaRevertidaAt,
          concepto: 'Reverso de cobro por anulación', responsable: 'Sin registro', referencia: factura.numeroFactura,
          monto: money(pago.monto), medioPago: paymentLabel[pago.metodo] || pago.metodo,
          detalle: 'Reverso aplicado a la sesión original de caja.',
          origen: { modulo: 'Facturas', documento: factura.numeroFactura, ruta: '#/facturacion' }
        }))),
      ...abonos.filter((abono) => enRango(abono.anuladoAt)).map((abono) => ({
        id: `anulacion-abono-${abono.id}`, tipo: 'anulacion', direccion: 'salida', fecha: abono.anuladoAt,
        concepto: 'Reverso de abono por anulación', responsable: 'Sin registro',
        referencia: abono.cuentaPorCobrar?.factura?.numeroFactura, monto: money(abono.monto),
        medioPago: paymentLabel[abono.metodo] || abono.metodo, detalle: 'Reverso aplicado a la sesión original de caja.',
        origen: { modulo: 'Cartera', documento: abono.cuentaPorCobrar?.factura?.numeroFactura, ruta: '#/cartera' }
      })),
      ...egresos
        .filter((egreso) => !egreso.pagoCompraId && !String(egreso.motivo || '').startsWith('Devolución '))
        .map((egreso) => ({
          id: `egreso-${egreso.id}`,
          tipo: 'egreso',
          direccion: 'salida',
          fecha: egreso.createdAt,
          concepto: egreso.categoria?.nombre || 'Egreso de caja',
          responsable: egreso.usuario?.nombre || 'Sin registro',
          referencia: 'Caja',
          monto: money(egreso.monto),
          medioPago: 'Efectivo',
          detalle: `${egreso.motivo || 'Sin motivo'}${egreso.requirioPin ? ` · Autorizó: ${egreso.autorizador?.nombre || 'Administrador'}` : ''}`,
          origen: {
            modulo: 'Caja',
            documento: `Caja ${egreso.caja?.fecha || ''}`.trim(),
            tercero: egreso.categoria?.nombre || 'Egreso general',
            sede: egreso.caja?.sede?.nombre || 'Sin sede',
            autorizador: egreso.requirioPin ? (egreso.autorizador?.nombre || 'Administrador') : null,
            ruta: '#/caja'
          }
        })),
      ...pagosCompra.map((pago) => ({
        id: `pago-compra-${pago.id}`,
        tipo: 'pago_compra',
        direccion: 'salida',
        fecha: pago.createdAt,
        concepto: `Pago a ${pago.ordenCompra?.proveedor?.nombre || 'proveedor'}`,
        responsable: pago.usuario?.nombre || pago.pagadoPor || 'Sin registro',
        referencia: `OC ${String(pago.ordenCompraId || '').slice(0, 8).toUpperCase()}`,
        monto: money(pago.monto),
        medioPago: paymentLabel[pago.fuenteFondos] || pago.fuenteFondos,
        detalle: pago.referencia || 'Pago registrado en compras',
        origen: {
          modulo: 'Compras',
          documento: `OC ${String(pago.ordenCompraId || '').slice(0, 8).toUpperCase()}`,
          tercero: pago.ordenCompra?.proveedor?.nombre || 'Proveedor',
          ruta: '#/compras'
        }
      })),
      ...devoluciones.map((devolucion) => ({
        id: `devolucion-${devolucion.id}`,
        tipo: 'devolucion',
        direccion: 'salida',
        fecha: devolucion.createdAt,
        concepto: `Devolución ${devolucion.numero}`,
        responsable: devolucion.usuario?.nombre || 'Sin registro',
        referencia: devolucion.venta?.numeroVenta || devolucion.numero,
        monto: money(devolucion.total),
        medioPago: paymentLabel[devolucion.metodoReembolso] || devolucion.metodoReembolso,
        detalle: devolucion.motivo || 'Devolución de venta',
        origen: {
          modulo: 'Ventas',
          documento: devolucion.venta?.numeroVenta || devolucion.numero,
          tercero: devolucion.venta?.cliente?.nombre || 'Cliente',
          ruta: '#/ventas'
        }
      }))
    ]
      .filter((item) => !tipo || item.tipo === tipo)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const total = items.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const currentPage = Math.min(page, totalPages);
    return res.json({
      items: items.slice((currentPage - 1) * limit, currentPage * limit),
      pagination: { page: currentPage, limit, total, totalPages }
    });
  } catch (error) {
    next(error);
  }
};

// Conserva la ruta administrativa, pero exige arqueo real y motivo.
exports.liberarCaja = async (req, res, next) => {
  if (!['admin', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Solo un administrador puede realizar este cierre.' });
  }
  req.cierreAdministrativo = true;
  return exports.cierreCaja(req, res, next);
};

// --- OBTENER DETALLE CONSOLIDADO DEL CIERRE Z ---

async function fetchCierreZData(cajaId, usuario) {
  const caja = await Caja.findByPk(cajaId, {
    include: [
      { model: Sede, as: 'sede', attributes: ['id', 'nombre'] },
      { model: Usuario, as: 'usuarioApertura', attributes: ['id', 'nombre'] },
      { model: Usuario, as: 'usuarioCierre', attributes: ['id', 'nombre'] },
      {
        model: EgresoCaja,
        as: 'egresos',
        include: [
          { model: CategoriaEgreso, as: 'categoria', attributes: ['nombre'] },
          { model: Usuario, as: 'usuario', attributes: ['nombre'] }
        ]
      }
    ]
  });

  if (!caja) return null;
  assertSedeAccess(usuario, caja.sedeId);

  // Rango de fechas de la sesión de caja
  const desde = caja.createdAt;
  const hasta = caja.horaCierre || new Date();

  // Los registros nuevos se vinculan por sesión, también con cajas individuales.
  const facturas = await Factura.findAll({
    where: {
      sedeId: caja.sedeId,
      [Op.or]: [{ cajaId: caja.id }, { cajaId: null, pagosCaja: null,
        createdAt: { [Op.between]: [desde, hasta] } }]
    },
    include: [
      { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento'] },
      { model: Venta, as: 'venta', include: [{ model: PagoVenta, as: 'pagos' }] }
    ],
    order: [['createdAt', 'ASC']]
  });
  const advertencias = [];
  async function pertenece(registro, fecha) {
    if (registro.cajaId) return registro.cajaId === caja.id;
    try { return await cajaHistorica(caja.sedeId, fecha) === caja.id; }
    catch (error) {
      if (error.status !== 409) throw error;
      advertencias.push(`El cobro histórico ${registro.id} no tiene una sesión inequívoca.`);
      return false;
    }
  }
  const detalleVentas = [], servicios = [], reversos = [];
  for (const factura of facturas) {
    if (!await pertenece(factura, factura.venta?.createdAt || factura.createdAt)) continue;
    const pagos = factura.pagosCaja ?? (factura.venta?.pagos || []).map((p) => ({ metodo: p.metodo, monto: Number(p.monto) }));
    if (factura.pagosCaja === null && !factura.venta) {
      advertencias.push(`La factura histórica ${factura.numeroFactura} no conserva su desglose de cobro.`);
    }
    const fila = {
      id: factura.ventaId || factura.id, numeroFactura: factura.numeroFactura,
      cliente: factura.cliente?.nombre || 'Cliente General',
      medioPago: [...new Set(pagos.filter((p) => Number(p.monto) > 0).map((p) => p.metodo))].join(' + ') || 'Crédito sin pago inicial',
      pagos, total: Number(factura.total), totalCobrado: pagos.reduce((sum, p) => sum + Number(p.monto), 0),
      estado: factura.estado, createdAt: factura.createdAt
    };
    if (factura.ventaId) detalleVentas.push(fila);
    else servicios.push({ ...fila, tipo: factura.ordenReparacionId ? 'reparacion' : 'instalacion' });
    if (factura.cajaRevertidaAt) for (const pago of pagos) reversos.push({ facturaId: factura.id,
      numeroFactura: factura.numeroFactura, metodo: pago.metodo, monto: Number(pago.monto), createdAt: factura.cajaRevertidaAt });
  }
  const abonos = await Abono.findAll({ where: { [Op.or]: [{ cajaId: caja.id },
    { cajaId: null, createdAt: { [Op.between]: [desde, hasta] } }] },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] },
      { model: CuentaPorCobrar, as: 'cuentaPorCobrar', required: true, include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre'] },
        { model: Factura, as: 'factura', required: true, where: { sedeId: caja.sedeId } }
      ] }], order: [['createdAt', 'ASC']] });
  const detalleAbonos = [];
  for (const abono of abonos) {
    if (!await pertenece(abono, abono.createdAt)) continue;
    const factura = abono.cuentaPorCobrar.factura;
    detalleAbonos.push({ id: abono.id, numeroFactura: factura.numeroFactura,
      cliente: abono.cuentaPorCobrar.cliente?.nombre || 'Cliente General', usuario: abono.usuario?.nombre,
      monto: Number(abono.monto), medioPago: abono.metodo, createdAt: abono.createdAt, anuladoAt: abono.anuladoAt });
    if (abono.anuladoAt) reversos.push({ abonoId: abono.id, facturaId: factura.id,
      numeroFactura: factura.numeroFactura, metodo: abono.metodo, monto: Number(abono.monto), createdAt: abono.anuladoAt });
  }

  const detalleEgresos = (caja.egresos || []).map(eg => ({
    id: eg.id,
    categoria: eg.categoria ? eg.categoria.nombre : 'General',
    motivo: eg.motivo,
    monto: parseFloat(eg.monto || 0),
    usuario: eg.usuario ? eg.usuario.nombre : 'N/A',
    createdAt: eg.createdAt
  }));

  return {
    caja,
    detalle: {
      ventas: detalleVentas,
      egresos: detalleEgresos,
      abonos: detalleAbonos,
      servicios,
      reversos,
      advertencias
    }
  };
}

exports.getDetalleCierreZ = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await fetchCierreZData(id, req.usuario);
    if (!data) {
      return res.status(404).json({ error: 'Registro de caja no encontrado.' });
    }
    return res.json(data);
  } catch (error) {
    next(error);
  }
};

// --- DESCARGAR REPORTE Z EN PDF ---

exports.descargarReporteZCajaPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await fetchCierreZData(id, req.usuario);

    if (!data) {
      return res.status(404).json({ error: 'Registro de caja no encontrado.' });
    }

    const config = await ConfiguracionSistema.findOne() || {};

    const pdfBuffer = await generarCierrePDF(data.caja, config, data.detalle);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Reporte_Z_Caja_${id}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

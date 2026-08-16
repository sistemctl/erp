const { Caja, EgresoCaja, CategoriaEgreso, Usuario, ConfiguracionSistema, Sede, Venta, Cliente, Factura, PagoVenta, ItemVenta, Producto, Abono, CuentaPorCobrar, PagoCompra, OrdenCompra, Proveedor, DevolucionVenta, sequelize } = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede, resolveActionSede } = require('../utils/sede');
const { findCajaAbierta, isCajaCompartidaSede } = require('../utils/caja-abierta');
const { generarCierrePDF } = require('../utils/cierre-pdf');

function getLocalDateStr(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- APERTURA DE CAJA ---

exports.aperturaCaja = async (req, res, next) => {
  try {
    const { montoApertura, sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede);

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe seleccionar la sede para abrir caja.' });
    }

    const parsedMonto = parseFloat(montoApertura);
    if (montoApertura === undefined || isNaN(parsedMonto) || parsedMonto < 0) {
      return res.status(400).json({ error: 'Monto de apertura inválido.' });
    }

    const compartida = await isCajaCompartidaSede();
    const { caja: cajaAbierta } = await findCajaAbierta({
      sedeId,
      usuarioId: req.usuario.userId
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
    });

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
    next(error);
  }
};

// --- EGRESO DE CAJA ---

exports.egresoCaja = async (req, res, next) => {
  const transaction = await sequelize.transaction();
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
        return res.status(401).json({ error: 'Este monto supera el límite permitido. Requiere PIN del Administrador.' });
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
        return res.status(401).json({ error: 'PIN de Administrador inválido.' });
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
    await transaction.rollback();
    next(error);
  }
};

// --- CIERRE DE CAJA ---

exports.cierreCaja = async (req, res, next) => {
  const transaction = await sequelize.transaction();
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

    const { caja, compartida } = await findCajaAbierta({
      sedeId,
      usuarioId: req.usuario.userId,
      transaction
    });

    if (!caja) {
      return res.status(400).json({
        error: compartida
          ? 'No hay ninguna caja abierta en esta sede para cerrar.'
          : 'No tienes una caja abierta en esta sede para cerrar.'
      });
    }

    // Calcular montos reales del sistema
    const efectivoTeorico = parseFloat(caja.montoApertura) + parseFloat(caja.totalVentasEfectivo) - parseFloat(caja.totalEgresos);
    const efectivoReal = parseFloat(totalVentasEfectivo || 0);

    const diferencia = efectivoReal - efectivoTeorico;

    await caja.update({
      estado: 'cerrada',
      usuarioCierreId: req.usuario.userId,
      horaCierre: new Date(),
      // Preservar totalVentasEfectivo acumulado por ingresos de ventas reales
      totalVentasNequi: totalVentasNequi !== undefined ? parseFloat(totalVentasNequi || 0) : parseFloat(caja.totalVentasNequi),
      totalVentasDaviplata: totalVentasDaviplata !== undefined ? parseFloat(totalVentasDaviplata || 0) : parseFloat(caja.totalVentasDaviplata),
      totalVentasTarjeta: totalVentasTarjeta !== undefined ? parseFloat(totalVentasTarjeta || 0) : parseFloat(caja.totalVentasTarjeta),
      totalVentasTransferencia: totalVentasTransferencia !== undefined ? parseFloat(totalVentasTransferencia || 0) : parseFloat(caja.totalVentasTransferencia),
      totalesPorMetodo: totalesPorMetodo && typeof totalesPorMetodo === 'object'
        ? { ...(caja.totalesPorMetodo || {}), ...totalesPorMetodo }
        : (caja.totalesPorMetodo || {}),
      diferencia,
      observaciones: observaciones || ''
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
    await transaction.rollback();
    next(error);
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
        sedeId: querySedeId,
        usuarioId: req.usuario.userId,
        include: cajaReporteInclude
      });
      caja = resAbierta.caja;
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

    return res.json(caja);
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
    const allowedTypes = new Set(['apertura', 'venta', 'abono', 'egreso', 'pago_compra', 'devolucion']);

    if (tipo && !allowedTypes.has(tipo)) {
      return res.status(400).json({ error: 'Tipo de movimiento no válido.' });
    }

    const createdAt = {};
    if (desde) createdAt[Op.gte] = new Date(`${desde}T00:00:00`);
    if (hasta) createdAt[Op.lte] = new Date(`${hasta}T23:59:59.999`);
    const whereFecha = Object.keys(createdAt).length ? { createdAt } : {};
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

    const [cajas, ventas, abonos, egresos, pagosCompra, devoluciones] = await Promise.all([
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
          estado: { [Op.in]: ['completada', 'credito'] },
          ...(querySedeId ? { sedeId: querySedeId } : {})
        },
        include: [
          { model: Cliente, as: 'cliente', attributes: ['nombre'] },
          { model: Usuario, as: 'usuario', attributes: ['nombre'] },
          { model: PagoVenta, as: 'pagos', attributes: ['id', 'metodo', 'monto'] },
          { model: Factura, as: 'factura', attributes: ['numeroFactura'] },
          {
            model: ItemVenta,
            as: 'items',
            attributes: ['cantidad'],
            include: [{ model: Producto, as: 'producto', attributes: ['nombre'] }]
          }
        ]
      }),
      Abono.findAll({
        where: whereFecha,
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
      ...ventas.flatMap((venta) => (venta.pagos || [])
        .filter((pago) => money(pago.monto) > 0 && !mediosDiferidos.has(pago.metodo))
        .map((pago) => ({
          id: `venta-${pago.id}`,
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
      ...abonos.map((abono) => ({
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

exports.liberarCaja = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);

    if (!sedeId) {
      return res.status(400).json({ error: 'El usuario debe pertenecer a una sede para liberar caja.' });
    }

    const caja = await Caja.findOne({
      where: { sedeId, estado: 'abierta' },
      transaction
    });

    if (!caja) {
      return res.status(400).json({ error: 'No hay ninguna caja abierta en esta sede para liberar.' });
    }

    await caja.update({
      estado: 'cerrada',
      usuarioCierreId: req.usuario.userId,
      horaCierre: new Date(),
      diferencia: 0,
      observaciones: 'Liberación forzada / Cierre administrativo por Administrador.'
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
      message: 'Caja liberada y cerrada administrativamente de forma exitosa.',
      caja
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
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

  // Rango de fechas de la sesión de caja
  const desde = caja.createdAt;
  const hasta = caja.horaCierre || caja.updatedAt || new Date();

  // Consultar Ventas de la sede dentro del rango de tiempo
  const ventas = await Venta.findAll({
    where: {
      sedeId: caja.sedeId,
      createdAt: { [Op.between]: [desde, hasta] }
    },
    include: [
      { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento'] },
      { model: Factura, as: 'factura', attributes: ['numeroFactura'] }
    ],
    order: [['createdAt', 'ASC']]
  });

  const detalleVentas = ventas.map(v => ({
    id: v.id,
    numeroFactura: v.factura ? v.factura.numeroFactura : `Venta #${v.id}`,
    cliente: v.cliente ? v.cliente.nombre : 'Cliente General',
    medioPago: v.metodoPago || 'Efectivo',
    total: parseFloat(v.total || 0),
    createdAt: v.createdAt
  }));

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
      abonos: []
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

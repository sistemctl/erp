const {
  Venta,
  ItemVenta,
  OrdenReparacion,
  Caja,
  Producto,
  StockSede,
  CuentaPorCobrar,
  Factura,
  Cliente,
  EgresoCaja,
  CategoriaEgreso,
  OrdenCompra,
  PagoCompra,
  Proveedor,
  Sede,
  Usuario,
  MovimientoInventario,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede } = require('../utils/sede');

const FUENTE_LABELS = {
  caja_efectivo: 'Caja (efectivo del turno)',
  efectivo_externo: 'Dinero externo / tercero',
  transferencia_empresa: 'Transferencia empresa',
  otro: 'Otro'
};

const resolveSedeFilter = (sede, usuario) => resolveQuerySede(sede, usuario);

/** Clave YYYY-MM-DD en calendario local (evita desfase UTC en gráficos). */
const localDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Zona horaria de negocio: alinear DATE() del gráfico con el día local del KPI. */
const APP_TZ = process.env.APP_TZ || 'America/Bogota';

/** Expresión SQL: día/mes civil en zona de la tienda (PG suele estar en UTC). */
const sqlLocalDay = (qualifiedCol) =>
  sequelize.literal(`(timezone('${APP_TZ}', ${qualifiedCol}))::date`);

const sqlLocalMonth = (qualifiedCol) =>
  sequelize.literal(`to_char(timezone('${APP_TZ}', ${qualifiedCol}), 'YYYY-MM')`);

/** Normaliza DATE/TO_CHAR de Postgres a clave de etiqueta del gráfico. */
const graficaFechaKey = (raw, bucket) => {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    return bucket === 'month' ? raw.slice(0, 7) : raw.slice(0, 10);
  }
  if (raw instanceof Date) {
    // DATE tipado por PG llega como medianoche UTC del día ya localizado
    if (bucket === 'month') {
      return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, '0')}-${String(raw.getUTCDate()).padStart(2, '0')}`;
  }
  return String(raw).slice(0, bucket === 'month' ? 7 : 10);
};

/** Rango de fechas y granularidad del gráfico según período */
const resolvePeriodoRange = (periodo) => {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  let bucket = 'day';
  const labels = [];

  if (periodo === 'semana') {
    startDate.setDate(startDate.getDate() - 6);
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      labels.push(localDateKey(d));
    }
  } else if (periodo === 'mes') {
    startDate.setDate(startDate.getDate() - 29);
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      labels.push(localDateKey(d));
    }
  } else if (periodo === 'año') {
    bucket = 'month';
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1);
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setHours(12, 0, 0, 0);
      d.setMonth(d.getMonth() - i);
      labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  } else {
    labels.push(localDateKey(startDate));
  }

  return { startDate, endDate, bucket, labels };
};

const cajaIncludeForSede = (querySedeId) => ({
  model: Caja,
  as: 'caja',
  attributes: [],
  required: true,
  ...(querySedeId ? { where: { sedeId: querySedeId } } : {})
});

const ordenIncludeForSede = (querySedeId) => ({
  model: OrdenCompra,
  as: 'ordenCompra',
  attributes: [],
  required: true,
  ...(querySedeId ? { where: { sedeId: querySedeId } } : {})
});

/** Gastos del período sin doble conteo: operativos de caja + pagos de compra */
const computeGastosEmpresa = async (startDate, endDate, querySedeId) => {
  const whereFecha = { createdAt: { [Op.between]: [startDate, endDate] } };

  const totalGastosOperativos = await EgresoCaja.sum('monto', {
    where: { ...whereFecha, pagoCompraId: null },
    include: [cajaIncludeForSede(querySedeId)]
  }) || 0;

  const pagosCompra = await PagoCompra.findAll({
    where: whereFecha,
    include: [
      {
        model: OrdenCompra,
        as: 'ordenCompra',
        required: true,
        ...(querySedeId ? { where: { sedeId: querySedeId } } : {}),
        attributes: ['id', 'total', 'estado', 'estadoPago', 'saldoPendiente'],
        include: [
          { model: Proveedor, as: 'proveedor', attributes: ['nombre'] },
          { model: Sede, as: 'sede', attributes: ['nombre'] }
        ]
      },
      { model: Usuario, as: 'usuario', attributes: ['nombre'] }
    ],
    order: [['createdAt', 'DESC']]
  });

  const porOrigen = {
    caja_efectivo: parseFloat(totalGastosOperativos),
    efectivo_externo: 0,
    transferencia_empresa: 0,
    otro: 0
  };

  let totalComprasPagadas = 0;
  const pagosDetalle = pagosCompra.map((p) => {
    const monto = parseFloat(p.monto);
    totalComprasPagadas += monto;
    if (porOrigen[p.fuenteFondos] !== undefined) {
      porOrigen[p.fuenteFondos] += monto;
    }
    const oc = p.ordenCompra;
    return {
      id: p.id,
      fecha: p.createdAt,
      monto,
      fuenteFondos: p.fuenteFondos,
      fuenteLabel: FUENTE_LABELS[p.fuenteFondos] || p.fuenteFondos,
      pagadoPor: p.pagadoPor,
      referencia: p.referencia,
      usuario: p.usuario ? p.usuario.nombre : 'N/A',
      ordenId: oc?.id,
      ordenRef: oc ? oc.id.slice(0, 8).toUpperCase() : 'N/A',
      proveedor: oc?.proveedor?.nombre || 'N/A',
      sede: oc?.sede?.nombre || 'N/A',
      ordenTotal: oc ? parseFloat(oc.total) : 0,
      ordenEstado: oc?.estado,
      ordenEstadoPago: oc?.estadoPago
    };
  });

  const totalGastoEmpresa = Object.values(porOrigen).reduce((s, v) => s + v, 0);

  const gastosPorOrigen = Object.entries(porOrigen).map(([clave, total]) => ({
    clave,
    nombre: FUENTE_LABELS[clave] || clave,
    total,
    porcentaje: totalGastoEmpresa > 0 ? Math.round((total / totalGastoEmpresa) * 1000) / 10 : 0
  }));

  return {
    totalGastosOperativos: parseFloat(totalGastosOperativos),
    totalComprasPagadas,
    totalGastoEmpresa,
    porOrigen,
    gastosPorOrigen,
    pagosDetalle
  };
};

exports.getKPIs = async (req, res, next) => {
  try {
    const { sede, periodo } = req.query;
    const querySedeId = resolveSedeFilter(sede, req.usuario);
    const { startDate, endDate } = resolvePeriodoRange(periodo || 'hoy');

    const whereVentas = {
      estado: { [Op.in]: ['completada', 'credito'] },
      createdAt: { [Op.between]: [startDate, endDate] }
    };
    const whereReparaciones = {
      estado: { [Op.notIn]: ['entregado', 'cancelado'] }
    };
    const whereClientes = {
      createdAt: { [Op.between]: [startDate, endDate] }
    };
    const whereCajas = {
      estado: 'abierta'
    };

    if (querySedeId) {
      whereVentas.sedeId = querySedeId;
      whereReparaciones.sedeId = querySedeId;
      whereClientes.sedeId = querySedeId;
      whereCajas.sedeId = querySedeId;
    }

    // 1. Total Ventas (COP)
    const ventasTotal = await Venta.sum('total', { where: whereVentas }) || 0;

    // 2. Unidades Vendidas
    const itemVentas = await ItemVenta.sum('cantidad', {
      include: [{
        model: Venta,
        as: 'venta',
        where: whereVentas,
        attributes: []
      }]
    }) || 0;

    // 3. Reparaciones Activas
    const reparacionesActivas = await OrdenReparacion.count({ where: whereReparaciones });

    // 4. Tiempo promedio de reparación (Simulado si no hay registros completados)
    const reparacionesEntregadas = await OrdenReparacion.findAll({
      where: {
        estado: 'entregado',
        ...(querySedeId ? { sedeId: querySedeId } : {})
      },
      attributes: ['createdAt', 'updatedAt']
    });
    let tiempoPromedio = 1.5; // por defecto 1.5 días
    if (reparacionesEntregadas.length > 0) {
      const diffs = reparacionesEntregadas.map(r => (new Date(r.updatedAt) - new Date(r.createdAt)) / (1000 * 60 * 60 * 24)); // en días
      tiempoPromedio = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1);
    }

    // 5. Dinero en Caja (Efectivo de Cajas Abiertas)
    const cajaAbierta = await Caja.findAll({ where: whereCajas });
    let dineroEnCaja = 0;
    cajaAbierta.forEach(c => {
      dineroEnCaja += parseFloat(c.montoApertura) + parseFloat(c.totalVentasEfectivo) - parseFloat(c.totalEgresos);
    });

    // 6. Productos en Stock Bajo (Stock de Sede menor que el stock mínimo)
    let stockBajoCount = 0;
    if (querySedeId) {
      stockBajoCount = await StockSede.count({
        where: {
          sedeId: querySedeId,
          cantidad: { [Op.lt]: sequelize.col('producto.stockMinimo') }
        },
        include: [{ model: Producto, as: 'producto', where: { activo: true } }]
      });
    } else {
      // Sumar stock de todas las sedes y comparar con el stockMinimo del producto
      const productosBajos = await Producto.findAll({
        where: { activo: true },
        include: [{ model: StockSede, as: 'stocks', attributes: ['cantidad'] }]
      });
      productosBajos.forEach(p => {
        const totalStock = p.stocks.reduce((acc, curr) => acc + curr.cantidad, 0);
        if (totalStock < p.stockMinimo) {
          stockBajoCount++;
        }
      });
    }

    // 7. Cuentas Por Cobrar (Cartera pendiente)
    const totalCartera = await CuentaPorCobrar.sum('saldoPendiente', {
      where: { estado: { [Op.ne]: 'pagada' } },
      include: [{
        model: Cliente,
        as: 'cliente',
        ...(querySedeId ? { where: { sedeId: querySedeId } } : {}),
        attributes: []
      }]
    }) || 0;

    const totalCarteraVencida = await CuentaPorCobrar.sum('saldoPendiente', {
      where: {
        estado: 'vencida',
        saldoPendiente: { [Op.gt]: 0 }
      },
      include: [{
        model: Factura,
        as: 'factura',
        attributes: [],
        required: true,
        ...(querySedeId ? { where: { sedeId: querySedeId } } : {})
      }]
    }) || 0;

    // 8. Clientes Nuevos
    const clientesNuevos = await Cliente.count({ where: whereClientes });

    // 9–11. Gastos, compras pagadas y deuda proveedores
    const gastosEmpresa = await computeGastosEmpresa(startDate, endDate, querySedeId);

    const whereCompras = {
      createdAt: { [Op.between]: [startDate, endDate] },
      estado: { [Op.ne]: 'cancelada' }
    };
    if (querySedeId) whereCompras.sedeId = querySedeId;
    const totalOrdenesCompra = await OrdenCompra.sum('total', { where: whereCompras }) || 0;

    const whereCuentasPorPagar = {
      estadoPago: { [Op.ne]: 'pagado' },
      estado: { [Op.ne]: 'cancelada' }
    };
    if (querySedeId) whereCuentasPorPagar.sedeId = querySedeId;
    const cuentasPorPagar = await OrdenCompra.sum('saldoPendiente', { where: whereCuentasPorPagar }) || 0;

    const ventasNum = parseFloat(ventasTotal);
    const resultadoNeto = ventasNum - gastosEmpresa.totalGastoEmpresa;

    return res.json({
      ventasTotal: ventasNum,
      unidadesVendidas: parseInt(itemVentas),
      reparacionesActivas: parseInt(reparacionesActivas),
      tiempoPromedio: parseFloat(tiempoPromedio),
      dineroEnCaja: parseFloat(dineroEnCaja),
      stockBajoCount: parseInt(stockBajoCount),
      totalCartera: parseFloat(totalCartera),
      totalCarteraVencida: parseFloat(totalCarteraVencida),
      clientesNuevos: parseInt(clientesNuevos),
      totalGastos: gastosEmpresa.totalGastosOperativos,
      totalGastosOperativos: gastosEmpresa.totalGastosOperativos,
      totalComprasPagadas: gastosEmpresa.totalComprasPagadas,
      totalGastoEmpresa: gastosEmpresa.totalGastoEmpresa,
      gastosPorOrigen: gastosEmpresa.gastosPorOrigen,
      pagosComprasDetalle: gastosEmpresa.pagosDetalle,
      totalCompras: parseFloat(totalOrdenesCompra),
      totalOrdenesCompra: parseFloat(totalOrdenesCompra),
      totalEgresos: gastosEmpresa.totalGastoEmpresa,
      cuentasPorPagar: parseFloat(cuentasPorPagar),
      resultadoNeto
    });
  } catch (error) {
    next(error);
  }
};

exports.getGraficaVentas = async (req, res, next) => {
  try {
    const { sede, periodo } = req.query;
    const querySedeId = resolveSedeFilter(sede, req.usuario);
    const { startDate, endDate, bucket, labels } = resolvePeriodoRange(periodo || 'semana');

    const whereVentas = {
      estado: { [Op.in]: ['completada', 'credito'] },
      createdAt: { [Op.between]: [startDate, endDate] }
    };
    if (querySedeId) whereVentas.sedeId = querySedeId;

    const ventaFechaExpr = bucket === 'month'
      ? sqlLocalMonth('"Venta"."createdAt"')
      : sqlLocalDay('"Venta"."createdAt"');
    const ventas = await Venta.findAll({
      where: whereVentas,
      attributes: [
        [ventaFechaExpr, 'fecha'],
        [sequelize.fn('SUM', sequelize.col('total')), 'total']
      ],
      group: [ventaFechaExpr],
      order: [[ventaFechaExpr, 'ASC']]
    });

    const egresoFechaExpr = bucket === 'month'
      ? sqlLocalMonth('"EgresoCaja"."createdAt"')
      : sqlLocalDay('"EgresoCaja"."createdAt"');
    const egresosOperativos = await EgresoCaja.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        pagoCompraId: null
      },
      include: [cajaIncludeForSede(querySedeId)],
      attributes: [
        [egresoFechaExpr, 'fecha'],
        [sequelize.fn('SUM', sequelize.col('monto')), 'total']
      ],
      group: [egresoFechaExpr],
      order: [[egresoFechaExpr, 'ASC']]
    });

    const pagoFechaExpr = bucket === 'month'
      ? sqlLocalMonth('"PagoCompra"."createdAt"')
      : sqlLocalDay('"PagoCompra"."createdAt"');
    const pagosCompra = await PagoCompra.findAll({
      where: { createdAt: { [Op.between]: [startDate, endDate] } },
      include: [ordenIncludeForSede(querySedeId)],
      attributes: [
        [pagoFechaExpr, 'fecha'],
        [sequelize.fn('SUM', sequelize.col('monto')), 'total']
      ],
      group: [pagoFechaExpr],
      order: [[pagoFechaExpr, 'ASC']]
    });

    const ventasMap = {};
    ventas.forEach(v => {
      const key = graficaFechaKey(v.getDataValue('fecha'), bucket);
      ventasMap[key] = parseFloat(v.getDataValue('total'));
    });

    const egresosMap = {};
    egresosOperativos.forEach(e => {
      const key = graficaFechaKey(e.getDataValue('fecha'), bucket);
      egresosMap[key] = parseFloat(e.getDataValue('total'));
    });

    const pagosMap = {};
    pagosCompra.forEach(p => {
      const key = graficaFechaKey(p.getDataValue('fecha'), bucket);
      pagosMap[key] = parseFloat(p.getDataValue('total'));
    });

    const dataGrafica = labels.map(d => {
      const gastoOperativo = egresosMap[d] || 0;
      const comprasPagadas = pagosMap[d] || 0;
      return {
        fecha: d,
        ventas: ventasMap[d] || 0,
        egresos: gastoOperativo + comprasPagadas,
        gastoOperativo,
        comprasPagadas,
        gastoTotal: gastoOperativo + comprasPagadas,
        total: ventasMap[d] || 0
      };
    });

    return res.json({ periodo: periodo || 'semana', bucket, data: dataGrafica });
  } catch (error) {
    next(error);
  }
};

exports.getGastosPorCategoria = async (req, res, next) => {
  try {
    const { sede, periodo, desde, hasta } = req.query;
    const querySedeId = resolveSedeFilter(sede, req.usuario);

    let startDate;
    let endDate;
    if (desde && hasta) {
      startDate = new Date(desde);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(hasta);
      endDate.setHours(23, 59, 59, 999);
    } else {
      ({ startDate, endDate } = resolvePeriodoRange(periodo || 'mes'));
    }

    const porCategoria = await EgresoCaja.findAll({
      where: { createdAt: { [Op.between]: [startDate, endDate] } },
      include: [
        cajaIncludeForSede(querySedeId),
        { model: CategoriaEgreso, as: 'categoria', attributes: ['id', 'nombre'] }
      ],
      attributes: [
        'categoriaId',
        [sequelize.fn('SUM', sequelize.col('EgresoCaja.monto')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('EgresoCaja.id')), 'cantidad']
      ],
      group: ['categoriaId', 'categoria.id', 'categoria.nombre'],
      order: [[sequelize.fn('SUM', sequelize.col('EgresoCaja.monto')), 'DESC']]
    });

    const detalle = await EgresoCaja.findAll({
      where: { createdAt: { [Op.between]: [startDate, endDate] } },
      include: [
        cajaIncludeForSede(querySedeId),
        { model: CategoriaEgreso, as: 'categoria', attributes: ['nombre'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    const items = porCategoria.map(row => ({
      categoriaId: row.categoriaId,
      nombre: row.categoria ? row.categoria.nombre : 'Sin categoría',
      total: parseFloat(row.getDataValue('total') || 0),
      cantidad: parseInt(row.getDataValue('cantidad') || 0, 10)
    }));

    const totalGeneral = items.reduce((sum, i) => sum + i.total, 0);

    return res.json({
      desde: startDate.toISOString().split('T')[0],
      hasta: endDate.toISOString().split('T')[0],
      totalGeneral,
      porCategoria: items,
      detalle: detalle.map(e => ({
        id: e.id,
        fecha: e.createdAt,
        monto: parseFloat(e.monto),
        motivo: e.motivo,
        categoria: e.categoria ? e.categoria.nombre : 'N/A',
        usuario: e.usuario ? e.usuario.nombre : 'N/A'
      }))
    });
  } catch (error) {
    next(error);
  }
};

exports.getGastoResumen = async (req, res, next) => {
  try {
    const { sede, periodo, desde, hasta } = req.query;
    const querySedeId = resolveSedeFilter(sede, req.usuario);

    let startDate;
    let endDate;
    if (desde && hasta) {
      startDate = new Date(desde);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(hasta);
      endDate.setHours(23, 59, 59, 999);
    } else {
      ({ startDate, endDate } = resolvePeriodoRange(periodo || 'mes'));
    }

    const gastos = await computeGastosEmpresa(startDate, endDate, querySedeId);

    return res.json({
      desde: startDate.toISOString().split('T')[0],
      hasta: endDate.toISOString().split('T')[0],
      ...gastos
    });
  } catch (error) {
    next(error);
  }
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-CO') : '—');

/**
 * Bitácora operativa del período (compras, ventas, egresos, pagos + alertas).
 * GET /dashboard/actividad?sede=&periodo=
 */
exports.getActividad = async (req, res, next) => {
  try {
    const { sede, periodo } = req.query;
    const querySedeId = resolveSedeFilter(sede, req.usuario);
    const { startDate, endDate } = resolvePeriodoRange(periodo || 'hoy');
    const whereFecha = { createdAt: { [Op.between]: [startDate, endDate] } };
    const perSource = 10;
    const maxEventos = 12;

    const whereVentas = {
      estado: { [Op.in]: ['completada', 'credito'] },
      createdAt: { [Op.between]: [startDate, endDate] },
      ...(querySedeId ? { sedeId: querySedeId } : {})
    };

    const [
      movimientos,
      itemsVenta,
      egresos,
      pagosCompra,
      reparacionesActivas,
      stockBajoCount
    ] = await Promise.all([
      MovimientoInventario.findAll({
        where: {
          ...whereFecha,
          tipo: 'entrada',
          motivo: { [Op.iLike]: 'Recepción de Orden de Compra%' },
          ...(querySedeId ? { sedeId: querySedeId } : {})
        },
        include: [{ model: Producto, as: 'producto', attributes: ['nombre'] }],
        order: [['createdAt', 'DESC']],
        limit: perSource
      }),
      ItemVenta.findAll({
        include: [
          {
            model: Venta,
            as: 'venta',
            required: true,
            where: whereVentas,
            attributes: ['id', 'numeroVenta', 'createdAt', 'total'],
            include: [{ model: Cliente, as: 'cliente', attributes: ['nombre'] }]
          },
          { model: Producto, as: 'producto', attributes: ['nombre'] }
        ],
        order: [[{ model: Venta, as: 'venta' }, 'createdAt', 'DESC']],
        limit: perSource
      }),
      EgresoCaja.findAll({
        where: { ...whereFecha, pagoCompraId: null },
        include: [
          cajaIncludeForSede(querySedeId),
          { model: CategoriaEgreso, as: 'categoria', attributes: ['nombre'] }
        ],
        order: [['createdAt', 'DESC']],
        limit: perSource
      }),
      PagoCompra.findAll({
        where: whereFecha,
        include: [
          {
            model: OrdenCompra,
            as: 'ordenCompra',
            required: true,
            ...(querySedeId ? { where: { sedeId: querySedeId } } : {}),
            attributes: ['id'],
            include: [{ model: Proveedor, as: 'proveedor', attributes: ['nombre'] }]
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: perSource
      }),
      OrdenReparacion.count({
        where: {
          estado: { [Op.notIn]: ['entregado', 'cancelado'] },
          ...(querySedeId ? { sedeId: querySedeId } : {})
        }
      }),
      (async () => {
        if (querySedeId) {
          return StockSede.count({
            where: {
              sedeId: querySedeId,
              cantidad: { [Op.lt]: sequelize.col('producto.stockMinimo') }
            },
            include: [{ model: Producto, as: 'producto', where: { activo: true } }]
          });
        }
        const productosBajos = await Producto.findAll({
          where: { activo: true },
          include: [{ model: StockSede, as: 'stocks', attributes: ['cantidad'] }]
        });
        return productosBajos.reduce((n, p) => {
          const totalStock = p.stocks.reduce((acc, curr) => acc + curr.cantidad, 0);
          return totalStock < p.stockMinimo ? n + 1 : n;
        }, 0);
      })()
    ]);

    const ocIds = [...new Set(movimientos.map((m) => m.referenciaId).filter(Boolean))];
    const ordenes = ocIds.length
      ? await OrdenCompra.findAll({
          where: { id: { [Op.in]: ocIds } },
          attributes: ['id'],
          include: [{ model: Proveedor, as: 'proveedor', attributes: ['nombre'] }]
        })
      : [];
    const ocMap = new Map(ordenes.map((o) => [o.id, o]));

    const eventos = [];

    for (const m of movimientos) {
      const qty = Math.abs(parseInt(m.cantidad, 10) || 0);
      const nombre = m.producto?.nombre || 'Producto';
      const oc = m.referenciaId ? ocMap.get(m.referenciaId) : null;
      const proveedor = oc?.proveedor?.nombre || 'Proveedor';
      const ocRef = m.referenciaId ? String(m.referenciaId).slice(0, 8).toUpperCase() : '—';
      eventos.push({
        id: `compra-${m.id}`,
        tipo: 'compra',
        clave: 'CMP',
        cuando: m.createdAt,
        titulo: `Recibió ${qty} ${nombre}`,
        detalle: `${proveedor} · OC ${ocRef}`,
        monto: null,
        href: '#/compras'
      });
    }

    for (const item of itemsVenta) {
      const qty = Math.abs(parseInt(item.cantidad, 10) || 0);
      const nombre = item.producto?.nombre || 'Producto';
      const cliente = item.venta?.cliente?.nombre || 'Cliente';
      const ticket = item.venta?.numeroVenta || String(item.venta?.id || '').slice(0, 8).toUpperCase();
      eventos.push({
        id: `venta-${item.id}`,
        tipo: 'venta',
        clave: 'POS',
        cuando: item.venta?.createdAt || item.createdAt,
        titulo: `Vendió ${qty} ${nombre}`,
        detalle: `${cliente} · ${ticket}`,
        monto: item.subtotal != null ? parseFloat(item.subtotal) : null,
        href: '#/ventas'
      });
    }

    for (const e of egresos) {
      const cat = e.categoria?.nombre || 'Sin categoría';
      const motivo = (e.motivo || '').trim() || 'Sin motivo';
      eventos.push({
        id: `egreso-${e.id}`,
        tipo: 'egreso',
        clave: 'CJA',
        cuando: e.createdAt,
        titulo: `Egreso ${cat}: ${motivo}`,
        detalle: 'Salida de caja',
        monto: parseFloat(e.monto),
        href: '#/caja?accion=egreso'
      });
    }

    for (const p of pagosCompra) {
      const proveedor = p.ordenCompra?.proveedor?.nombre || 'Proveedor';
      const ocRef = p.ordenCompra?.id
        ? String(p.ordenCompra.id).slice(0, 8).toUpperCase()
        : '—';
      eventos.push({
        id: `pago-${p.id}`,
        tipo: 'pago_compra',
        clave: 'PAG',
        cuando: p.createdAt,
        titulo: `Pagó a ${proveedor}`,
        detalle: `OC ${ocRef}`,
        monto: parseFloat(p.monto),
        href: '#/compras'
      });
    }

    eventos.sort((a, b) => new Date(b.cuando) - new Date(a.cuando));
    const eventosLimitados = eventos.slice(0, maxEventos);

    const alertas = [];
    const stk = parseInt(stockBajoCount, 10) || 0;
    const tlr = parseInt(reparacionesActivas, 10) || 0;
    if (stk > 0) {
      alertas.push({
        tipo: 'stock_bajo',
        clave: 'STK',
        count: stk,
        label: stk === 1 ? '1 producto bajo mínimo' : `${stk} productos bajo mínimo`,
        detalleTipo: 'stock_bajo'
      });
    }
    if (tlr > 0) {
      alertas.push({
        tipo: 'taller',
        clave: 'TLR',
        count: tlr,
        label: tlr === 1 ? '1 orden abierta' : `${tlr} órdenes abiertas`,
        detalleTipo: 'reparaciones_activas'
      });
    }

    return res.json({
      desde: startDate.toISOString().split('T')[0],
      hasta: endDate.toISOString().split('T')[0],
      alertas,
      eventos: eventosLimitados
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Detalle corto para ventanas del dashboard.
 * GET /dashboard/detalle/:tipo?sede=&periodo=
 */
exports.getDetalle = async (req, res, next) => {
  try {
    const tipo = String(req.params.tipo || '').toLowerCase();
    const { sede, periodo } = req.query;
    const querySedeId = resolveSedeFilter(sede, req.usuario);
    const { startDate, endDate } = resolvePeriodoRange(periodo || 'hoy');
    const limit = 8;

    const whereVentas = {
      estado: { [Op.in]: ['completada', 'credito'] },
      createdAt: { [Op.between]: [startDate, endDate] },
      ...(querySedeId ? { sedeId: querySedeId } : {})
    };

    const payload = {
      tipo,
      titulo: '',
      valor: null,
      valorLabel: '',
      filas: [],
      vacio: 'Sin datos en este período.',
      link: '#/dashboard',
      linkLabel: 'Abrir módulo'
    };

    switch (tipo) {
      case 'ingresos':
      case 'ventas': {
        const ventas = await Venta.findAll({
          where: whereVentas,
          include: [
            { model: Cliente, as: 'cliente', attributes: ['nombre'] },
            { model: Sede, as: 'sede', attributes: ['nombre'] }
          ],
          order: [['createdAt', 'DESC']],
          limit
        });
        const total = await Venta.sum('total', { where: whereVentas }) || 0;
        payload.titulo = 'Ventas del período';
        payload.valor = parseFloat(total);
        payload.valorLabel = 'Total vendido';
        payload.link = '#/ventas';
        payload.linkLabel = 'Abrir ventas';
        payload.vacio = 'No hay ventas en este período.';
        payload.filas = ventas.map((v) => ({
          primaria: v.numeroVenta || v.id.slice(0, 8),
          secundaria: `${v.cliente?.nombre || 'Cliente'} · ${fmtDate(v.createdAt)}`,
          monto: parseFloat(v.total)
        }));
        break;
      }
      case 'unidades': {
        const ventasConItems = await Venta.findAll({
          where: whereVentas,
          include: [{
            model: ItemVenta,
            as: 'items',
            include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigoBarras'] }]
          }],
          order: [['createdAt', 'DESC']],
          limit: 80
        });
        const byProd = new Map();
        for (const v of ventasConItems) {
          for (const item of v.items || []) {
            const cant = parseInt(item.cantidad, 10) || 0;
            const pid = item.productoId || item.producto?.id || 'x';
            const prev = byProd.get(pid) || {
              nombre: item.producto?.nombre || 'Producto',
              codigo: item.producto?.codigoBarras || '—',
              cantidad: 0
            };
            prev.cantidad += cant;
            byProd.set(pid, prev);
          }
        }
        const unidadesTotal = await ItemVenta.sum('cantidad', {
          include: [{ model: Venta, as: 'venta', where: whereVentas, attributes: [] }]
        }) || 0;
        const top = [...byProd.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, limit);
        payload.titulo = 'Unidades vendidas';
        payload.valor = parseInt(unidadesTotal, 10) || 0;
        payload.valorLabel = 'Unidades';
        payload.link = '#/ventas';
        payload.linkLabel = 'Abrir ventas';
        payload.vacio = 'No hay unidades vendidas en este período.';
        payload.filas = top.map((row) => ({
          primaria: row.nombre,
          secundaria: row.codigo,
          monto: row.cantidad,
          montoEsCantidad: true
        }));
        break;
      }
      case 'reparaciones_activas': {
        const where = {
          estado: { [Op.notIn]: ['entregado', 'cancelado'] },
          ...(querySedeId ? { sedeId: querySedeId } : {})
        };
        const ordenes = await OrdenReparacion.findAll({
          where,
          include: [{ model: Cliente, as: 'cliente', attributes: ['nombre'] }],
          order: [['updatedAt', 'DESC']],
          limit
        });
        const count = await OrdenReparacion.count({ where });
        payload.titulo = 'Reparaciones activas';
        payload.valor = count;
        payload.valorLabel = 'Órdenes abiertas';
        payload.link = '#/reparaciones';
        payload.linkLabel = 'Abrir taller';
        payload.vacio = 'No hay reparaciones activas.';
        payload.filas = ordenes.map((o) => ({
          primaria: o.numeroOrden || o.id.slice(0, 8),
          secundaria: `${o.cliente?.nombre || 'Cliente'} · ${o.estado} · ${[o.tipoEquipo, o.marca].filter(Boolean).join(' ')}`,
          monto: null
        }));
        break;
      }
      case 'tiempo_promedio': {
        const where = {
          estado: 'entregado',
          ...(querySedeId ? { sedeId: querySedeId } : {})
        };
        const ordenes = await OrdenReparacion.findAll({
          where,
          include: [{ model: Cliente, as: 'cliente', attributes: ['nombre'] }],
          order: [['updatedAt', 'DESC']],
          limit
        });
        let avg = 0;
        if (ordenes.length) {
          const diffs = ordenes.map((r) => (new Date(r.updatedAt) - new Date(r.createdAt)) / (1000 * 60 * 60 * 24));
          avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        }
        payload.titulo = 'Tiempo de reparación';
        payload.valor = Math.round(avg * 10) / 10;
        payload.valorLabel = 'Días promedio (muestra)';
        payload.link = '#/reparaciones';
        payload.linkLabel = 'Abrir taller';
        payload.vacio = 'No hay reparaciones entregadas para medir.';
        payload.filas = ordenes.map((o) => {
          const dias = ((new Date(o.updatedAt) - new Date(o.createdAt)) / (1000 * 60 * 60 * 24));
          return {
            primaria: o.numeroOrden || o.id.slice(0, 8),
            secundaria: `${o.cliente?.nombre || 'Cliente'} · entregada ${fmtDate(o.updatedAt)}`,
            monto: Math.round(dias * 10) / 10,
            montoEsCantidad: true,
            montoSufijo: ' d'
          };
        });
        break;
      }
      case 'stock_bajo': {
        let filas = [];
        let count = 0;
        if (querySedeId) {
          const rows = await StockSede.findAll({
            where: {
              sedeId: querySedeId,
              cantidad: { [Op.lt]: sequelize.col('producto.stockMinimo') }
            },
            include: [{ model: Producto, as: 'producto', where: { activo: true }, attributes: ['nombre', 'codigoBarras', 'stockMinimo'] }],
            order: [['cantidad', 'ASC']],
            limit
          });
          count = await StockSede.count({
            where: {
              sedeId: querySedeId,
              cantidad: { [Op.lt]: sequelize.col('producto.stockMinimo') }
            },
            include: [{ model: Producto, as: 'producto', where: { activo: true } }]
          });
          filas = rows.map((s) => ({
            primaria: s.producto?.nombre || 'Producto',
            secundaria: `Stock ${s.cantidad} · mín. ${s.producto?.stockMinimo ?? '—'}`,
            monto: s.cantidad,
            montoEsCantidad: true
          }));
        } else {
          const productos = await Producto.findAll({
            where: { activo: true },
            include: [{ model: StockSede, as: 'stocks', attributes: ['cantidad'] }]
          });
          const bajos = productos
            .map((p) => {
              const totalStock = (p.stocks || []).reduce((acc, c) => acc + c.cantidad, 0);
              return { p, totalStock };
            })
            .filter(({ p, totalStock }) => totalStock < p.stockMinimo)
            .sort((a, b) => a.totalStock - b.totalStock);
          count = bajos.length;
          filas = bajos.slice(0, limit).map(({ p, totalStock }) => ({
            primaria: p.nombre,
            secundaria: `Stock ${totalStock} · mín. ${p.stockMinimo}`,
            monto: totalStock,
            montoEsCantidad: true
          }));
        }
        payload.titulo = 'Stock bajo';
        payload.valor = count;
        payload.valorLabel = 'Productos';
        payload.link = '#/inventario?alerta=bajo';
        payload.linkLabel = 'Abrir inventario';
        payload.vacio = 'Ningún producto está bajo el mínimo.';
        payload.filas = filas;
        break;
      }
      case 'clientes_nuevos': {
        const where = {
          createdAt: { [Op.between]: [startDate, endDate] },
          ...(querySedeId ? { sedeId: querySedeId } : {})
        };
        const clientes = await Cliente.findAll({
          where,
          order: [['createdAt', 'DESC']],
          limit,
          attributes: ['id', 'nombre', 'telefono', 'documento', 'createdAt']
        });
        const count = await Cliente.count({ where });
        payload.titulo = 'Clientes nuevos';
        payload.valor = count;
        payload.valorLabel = 'Altas en el período';
        payload.link = '#/clientes';
        payload.linkLabel = 'Abrir clientes';
        payload.vacio = 'No hay clientes nuevos en este período.';
        payload.filas = clientes.map((c) => ({
          primaria: c.nombre,
          secundaria: `${c.documento || 'Sin doc.'} · ${fmtDate(c.createdAt)}`,
          monto: null
        }));
        break;
      }
      case 'caja': {
        const whereCajas = {
          estado: 'abierta',
          ...(querySedeId ? { sedeId: querySedeId } : {})
        };
        const cajas = await Caja.findAll({
          where: whereCajas,
          include: [
            { model: Sede, as: 'sede', attributes: ['nombre'] },
            { model: Usuario, as: 'usuarioApertura', attributes: ['nombre'], required: false }
          ],
          order: [['createdAt', 'DESC']],
          limit
        });
        let dinero = 0;
        const filas = cajas.map((c) => {
          const saldo = parseFloat(c.montoApertura) + parseFloat(c.totalVentasEfectivo) - parseFloat(c.totalEgresos);
          dinero += saldo;
          return {
            primaria: c.sede?.nombre || 'Sede',
            secundaria: `Apertura ${fmtDate(c.createdAt)} · ${c.usuarioApertura?.nombre || 'Cajero'}`,
            monto: saldo
          };
        });
        payload.titulo = 'Efectivo en caja';
        payload.valor = dinero;
        payload.valorLabel = 'Saldo registros abiertos';
        payload.link = '#/caja';
        payload.linkLabel = 'Abrir caja';
        payload.vacio = 'No hay cajas abiertas.';
        payload.filas = filas;
        break;
      }
      case 'cartera':
      case 'cartera_vencida': {
        const vencida = tipo === 'cartera_vencida';
        const where = vencida
          ? { estado: 'vencida', saldoPendiente: { [Op.gt]: 0 } }
          : { estado: { [Op.ne]: 'pagada' }, saldoPendiente: { [Op.gt]: 0 } };
        const rows = await CuentaPorCobrar.findAll({
          where,
          include: [
            { model: Cliente, as: 'cliente', attributes: ['nombre'], ...(querySedeId ? { where: { sedeId: querySedeId } } : {}) },
            {
              model: Factura,
              as: 'factura',
              attributes: ['numeroFactura', 'sedeId'],
              required: vencida,
              ...(querySedeId && vencida ? { where: { sedeId: querySedeId } } : {})
            }
          ],
          order: [['saldoPendiente', 'DESC']],
          limit
        });
        const sumWhere = vencida
          ? { estado: 'vencida', saldoPendiente: { [Op.gt]: 0 } }
          : { estado: { [Op.ne]: 'pagada' } };
        const totalAll = await CuentaPorCobrar.sum('saldoPendiente', {
          where: sumWhere,
          include: vencida
            ? [{
                model: Factura,
                as: 'factura',
                attributes: [],
                required: true,
                ...(querySedeId ? { where: { sedeId: querySedeId } } : {})
              }]
            : [{
                model: Cliente,
                as: 'cliente',
                attributes: [],
                ...(querySedeId ? { where: { sedeId: querySedeId } } : {})
              }]
        }) || 0;
        payload.titulo = vencida ? 'Cartera vencida' : 'Cartera pendiente';
        payload.valor = parseFloat(totalAll);
        payload.valorLabel = 'Saldo pendiente';
        payload.link = vencida ? '#/cartera?estado=vencida' : '#/cartera';
        payload.linkLabel = 'Abrir cartera';
        payload.vacio = vencida ? 'No hay cartera vencida.' : 'No hay saldos pendientes.';
        payload.filas = rows.map((r) => ({
          primaria: r.cliente?.nombre || 'Cliente',
          secundaria: r.factura?.numeroFactura || `CxC · ${r.estado}`,
          monto: parseFloat(r.saldoPendiente)
        }));
        break;
      }
      case 'cuentas_por_pagar': {
        const where = {
          estadoPago: { [Op.ne]: 'pagado' },
          estado: { [Op.ne]: 'cancelada' },
          ...(querySedeId ? { sedeId: querySedeId } : {})
        };
        const ordenes = await OrdenCompra.findAll({
          where,
          include: [{ model: Proveedor, as: 'proveedor', attributes: ['nombre'] }],
          order: [['saldoPendiente', 'DESC']],
          limit
        });
        const total = await OrdenCompra.sum('saldoPendiente', { where }) || 0;
        payload.titulo = 'Cuentas por pagar';
        payload.valor = parseFloat(total);
        payload.valorLabel = 'Saldo a proveedores';
        payload.link = '#/compras?tab=cpp';
        payload.linkLabel = 'Abrir compras';
        payload.vacio = 'No hay saldos por pagar.';
        payload.filas = ordenes.map((o) => ({
          primaria: o.proveedor?.nombre || 'Proveedor',
          secundaria: `OC ${String(o.id).slice(0, 8).toUpperCase()} · ${o.estadoPago}`,
          monto: parseFloat(o.saldoPendiente)
        }));
        break;
      }
      case 'compras_pagadas': {
        const gastos = await computeGastosEmpresa(startDate, endDate, querySedeId);
        payload.titulo = 'Compras pagadas';
        payload.valor = gastos.totalComprasPagadas;
        payload.valorLabel = 'Pagado en el período';
        payload.link = '#/compras';
        payload.linkLabel = 'Abrir compras';
        payload.vacio = 'Sin pagos a proveedores en este período.';
        payload.filas = (gastos.pagosDetalle || []).slice(0, limit).map((p) => ({
          primaria: p.proveedor,
          secundaria: `${p.ordenRef} · ${p.fuenteLabel} · ${fmtDate(p.fecha)}`,
          monto: p.monto
        }));
        break;
      }
      case 'gastos':
      case 'gasto_total': {
        const gastos = await computeGastosEmpresa(startDate, endDate, querySedeId);
        payload.titulo = tipo === 'gastos' ? 'Gastos de caja' : 'Gasto total empresa';
        payload.valor = tipo === 'gastos' ? gastos.totalGastosOperativos : gastos.totalGastoEmpresa;
        payload.valorLabel = tipo === 'gastos' ? 'Egresos operativos' : 'Caja + compras (sin doble conteo)';
        payload.link = tipo === 'gastos' ? '#/caja?accion=egreso' : '#/dashboard';
        payload.linkLabel = tipo === 'gastos' ? 'Abrir caja' : 'Ver desglose abajo';
        payload.vacio = 'Sin gastos en este período.';
        payload.filas = (gastos.gastosPorOrigen || [])
          .filter((o) => o.total > 0)
          .slice(0, limit)
          .map((o) => ({
            primaria: o.nombre,
            secundaria: `${o.porcentaje}% del gasto`,
            monto: o.total
          }));
        if (tipo === 'gasto_total' && (gastos.pagosDetalle || []).length) {
          payload.filas = [
            ...payload.filas.slice(0, 3),
            ...(gastos.pagosDetalle || []).slice(0, 5).map((p) => ({
              primaria: p.proveedor,
              secundaria: `Pago OC ${p.ordenRef} · ${fmtDate(p.fecha)}`,
              monto: p.monto
            }))
          ].slice(0, limit);
        }
        break;
      }
      case 'utilidad': {
        const ventasTotal = await Venta.sum('total', { where: whereVentas }) || 0;
        const gastos = await computeGastosEmpresa(startDate, endDate, querySedeId);
        const resultado = parseFloat(ventasTotal) - gastos.totalGastoEmpresa;
        payload.titulo = 'Utilidad neta';
        payload.valor = resultado;
        payload.valorLabel = 'Ingresos − gasto total';
        payload.link = '#/dashboard';
        payload.linkLabel = 'Ver gráfica';
        payload.scrollTarget = 'dashboard-chart';
        payload.vacio = 'Sin movimiento en el período.';
        payload.filas = [
          { primaria: 'Ingresos (ventas)', secundaria: 'Período seleccionado', monto: parseFloat(ventasTotal) },
          { primaria: 'Gasto total', secundaria: 'Caja + compras pagadas', monto: gastos.totalGastoEmpresa },
          { primaria: 'Resultado', secundaria: resultado >= 0 ? 'Positivo' : 'Negativo', monto: resultado }
        ];
        break;
      }
      default:
        return res.status(400).json({ error: `Tipo de detalle no válido: ${tipo}` });
    }

    return res.json(payload);
  } catch (error) {
    next(error);
  }
};

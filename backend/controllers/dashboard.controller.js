const {
  Venta,
  ItemVenta,
  OrdenReparacion,
  Caja,
  Producto,
  StockSede,
  CuentaPorCobrar,
  Cliente,
  EgresoCaja,
  CategoriaEgreso,
  OrdenCompra,
  PagoCompra,
  Proveedor,
  Sede,
  Usuario,
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
      d.setDate(d.getDate() - i);
      labels.push(d.toISOString().split('T')[0]);
    }
  } else if (periodo === 'mes') {
    startDate.setDate(startDate.getDate() - 29);
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toISOString().split('T')[0]);
    }
  } else if (periodo === 'año') {
    bucket = 'month';
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1);
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  } else {
    labels.push(startDate.toISOString().split('T')[0]);
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

    const ventaDateCol = sequelize.fn('DATE', sequelize.col('Venta.createdAt'));
    const ventas = await Venta.findAll({
      where: whereVentas,
      attributes: [
        [bucket === 'month'
          ? sequelize.fn('TO_CHAR', sequelize.col('Venta.createdAt'), 'YYYY-MM')
          : ventaDateCol,
        'fecha'],
        [sequelize.fn('SUM', sequelize.col('total')), 'total']
      ],
      group: [bucket === 'month'
        ? sequelize.fn('TO_CHAR', sequelize.col('Venta.createdAt'), 'YYYY-MM')
        : ventaDateCol],
      order: [[bucket === 'month'
        ? sequelize.fn('TO_CHAR', sequelize.col('Venta.createdAt'), 'YYYY-MM')
        : ventaDateCol, 'ASC']]
    });

    const egresoDateCol = sequelize.fn('DATE', sequelize.col('EgresoCaja.createdAt'));
    const egresosOperativos = await EgresoCaja.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        pagoCompraId: null
      },
      include: [cajaIncludeForSede(querySedeId)],
      attributes: [
        [bucket === 'month'
          ? sequelize.fn('TO_CHAR', sequelize.col('EgresoCaja.createdAt'), 'YYYY-MM')
          : egresoDateCol,
        'fecha'],
        [sequelize.fn('SUM', sequelize.col('monto')), 'total']
      ],
      group: [bucket === 'month'
        ? sequelize.fn('TO_CHAR', sequelize.col('EgresoCaja.createdAt'), 'YYYY-MM')
        : egresoDateCol],
      order: [[bucket === 'month'
        ? sequelize.fn('TO_CHAR', sequelize.col('EgresoCaja.createdAt'), 'YYYY-MM')
        : egresoDateCol, 'ASC']]
    });

    const pagoDateCol = sequelize.fn('DATE', sequelize.col('PagoCompra.createdAt'));
    const pagosCompra = await PagoCompra.findAll({
      where: { createdAt: { [Op.between]: [startDate, endDate] } },
      include: [ordenIncludeForSede(querySedeId)],
      attributes: [
        [bucket === 'month'
          ? sequelize.fn('TO_CHAR', sequelize.col('PagoCompra.createdAt'), 'YYYY-MM')
          : pagoDateCol,
        'fecha'],
        [sequelize.fn('SUM', sequelize.col('monto')), 'total']
      ],
      group: [bucket === 'month'
        ? sequelize.fn('TO_CHAR', sequelize.col('PagoCompra.createdAt'), 'YYYY-MM')
        : pagoDateCol],
      order: [[bucket === 'month'
        ? sequelize.fn('TO_CHAR', sequelize.col('PagoCompra.createdAt'), 'YYYY-MM')
        : pagoDateCol, 'ASC']]
    });

    const ventasMap = {};
    ventas.forEach(v => {
      const raw = v.getDataValue('fecha');
      const key = bucket === 'month' ? raw : new Date(raw).toISOString().split('T')[0];
      ventasMap[key] = parseFloat(v.getDataValue('total'));
    });

    const egresosMap = {};
    egresosOperativos.forEach(e => {
      const raw = e.getDataValue('fecha');
      const key = bucket === 'month' ? raw : new Date(raw).toISOString().split('T')[0];
      egresosMap[key] = parseFloat(e.getDataValue('total'));
    });

    const pagosMap = {};
    pagosCompra.forEach(p => {
      const raw = p.getDataValue('fecha');
      const key = bucket === 'month' ? raw : new Date(raw).toISOString().split('T')[0];
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

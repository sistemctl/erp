const {
  Venta,
  ItemVenta,
  OrdenReparacion,
  Caja,
  Producto,
  StockSede,
  CuentaPorCobrar,
  Cliente,
  sequelize
} = require('../models');
const { Op } = require('sequelize');

exports.getKPIs = async (req, res, next) => {
  try {
    const { sede, periodo } = req.query; // sede = sedeId, periodo = 'hoy', 'semana', 'mes', 'año'
    const querySedeId = sede || req.usuario.sedeId;

    // Rango de fechas según periodo
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (periodo === 'semana') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (periodo === 'mes') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (periodo === 'año') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      // Default 'hoy'
      startDate.setHours(0, 0, 0, 0);
    }

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

    return res.json({
      ventasTotal: parseFloat(ventasTotal),
      unidadesVendidas: parseInt(itemVentas),
      reparacionesActivas: parseInt(reparacionesActivas),
      tiempoPromedio: parseFloat(tiempoPromedio),
      dineroEnCaja: parseFloat(dineroEnCaja),
      stockBajoCount: parseInt(stockBajoCount),
      totalCartera: parseFloat(totalCartera),
      clientesNuevos: parseInt(clientesNuevos)
    });
  } catch (error) {
    next(error);
  }
};

exports.getGraficaVentas = async (req, res, next) => {
  try {
    const { sede } = req.query;
    const querySedeId = sede || req.usuario.sedeId;

    // Últimos 7 días
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const where = {
      estado: { [Op.in]: ['completada', 'credito'] },
      createdAt: {
        [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 7))
      }
    };

    if (querySedeId) {
      where.sedeId = querySedeId;
    }

    const ventas = await Venta.findAll({
      where,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'fecha'],
        [sequelize.fn('SUM', sequelize.col('total')), 'total']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
    });

    // Mapear ventas a los 7 días (llenando con 0 los días sin ventas)
    const ventasMap = {};
    ventas.forEach(v => {
      // Sequelize sqlite/postgres pueden retornar fechas en distintos formatos, extraemos solo YYYY-MM-DD
      const dateStr = new Date(v.getDataValue('fecha')).toISOString().split('T')[0];
      ventasMap[dateStr] = parseFloat(v.getDataValue('total'));
    });

    const dataGrafica = dates.map(d => ({
      fecha: d,
      total: ventasMap[d] || 0
    }));

    return res.json(dataGrafica);
  } catch (error) {
    next(error);
  }
};

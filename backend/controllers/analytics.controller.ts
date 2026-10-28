import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import { transactionFinished } from '../utils/transaction-state';
import type { AggregateOptions, Attributes, FindOptions, Model, ModelStatic, WhereOptions } from 'sequelize';
import type CompraModel = require('../models/OrdenCompra');
import type VentaModel = require('../models/Venta');
type Body = Record<string, never>;
interface CsvRow { cliente?: { nombre?: string; documento?: string | null }; factura?: { numeroFactura?: string }; proveedor?: { nombre?: string }; fechaVencimiento?: string | Date | null; fechaVencimientoPago?: string | Date | null; saldoPendiente?: string | number; estado?: string; diasVencido?: number; numeroOrden?: string; total?: string | number; estadoPago?: string }
interface CsvPayload { items?: CsvRow[] }
// Sequelize admite includes al agregar; sus declaraciones de AggregateOptions los omiten.
function sumIncluding<M extends Model>(model: ModelStatic<M>, field: keyof Attributes<M>, options: AggregateOptions<number, Attributes<M>> & Pick<FindOptions<Attributes<M>>, 'include'>) {
  return model.sum(field, options);
}

import models = require('../models');
const {
  CuentaPorCobrar,
  Factura,
  Cliente,
  OrdenCompra,
  Proveedor,
  Venta,
  PagoVenta,
  ItemVenta,
  Producto,
  StockSede,
  Sede,
  EgresoCaja,
  PagoCompra,
  Caja,
  CategoriaEgreso,
  sequelize
} = models;
import { Op } from 'sequelize';
import { resolveQuerySede } from '../utils/sede';
import { rowsToCsv, sendCsv } from '../utils/export-csv';

function resolveDateRange(desde: string | undefined, hasta: string | undefined, defaultDays = 30) {
  const endDate = hasta ? new Date(hasta) : new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = desde ? new Date(desde) : new Date(endDate);
  if (!desde) startDate.setDate(startDate.getDate() - defaultDays);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

function clasificarMora(fechaVencimiento: Date, saldo: string | number, estado: string): { bucket: "al_dia" | "0-30" | "30-60" | "60-90" | "+90"; diasVencido: number } {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fechaVencimiento);
  const diffDays = Math.ceil((hoy.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24));
  if (parseFloat(String(saldo)) <= 0 || estado === 'pagada') {
    return { bucket: 'al_dia', diasVencido: 0 };
  }
  if (diffDays <= 0) return { bucket: 'al_dia', diasVencido: 0 };
  if (diffDays <= 30) return { bucket: '0-30', diasVencido: diffDays };
  if (diffDays <= 60) return { bucket: '30-60', diasVencido: diffDays };
  if (diffDays <= 90) return { bucket: '60-90', diasVencido: diffDays };
  return { bucket: '+90', diasVencido: diffDays };
}

export const getCarteraResumen: Handler<Body> = async (req, res, next) => {
  try {
    const querySedeId = resolveQuerySede(req.query.sede, requireUser(req));
    const includeFacturaWhere = querySedeId ? { sedeId: querySedeId } : {};

    const cuentas = await CuentaPorCobrar.findAll({
      where: { estado: { [Op.ne]: 'pagada' } },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento'] },
        { model: Factura, as: 'factura', where: includeFacturaWhere, required: !!querySedeId }
      ]
    });

    const buckets = { al_dia: 0, vencida: 0, '0-30': 0, '30-60': 0, '60-90': 0, '+90': 0 };
    let totalPendiente = 0;
    let totalVencida = 0;

    const items = cuentas.map(c => {
      const plain = c.get({ plain: true });
      const saldo = parseFloat(String(plain.saldoPendiente)) || 0;
      if (saldo <= 0) return null;
      totalPendiente += saldo;
      const { bucket, diasVencido } = clasificarMora(plain.fechaVencimiento, saldo, plain.estado);
      if (plain.estado === 'vencida' || diasVencido > 0) {
        totalVencida += saldo;
        buckets.vencida += saldo;
      } else {
        buckets.al_dia += saldo;
      }
      if (bucket !== 'al_dia') buckets[bucket] = (buckets[bucket] || 0) + saldo;
      return { ...plain, diasVencido, bucket };
    }).filter(Boolean);

    return res.json({
      totalPendiente,
      totalVencida,
      totalAlDia: totalPendiente - totalVencida,
      buckets,
      cantidad: items.length,
      items
    });
  } catch (error) {
    next(error);
  }
};

export const getCuentasPorPagar: Handler<Body> = async (req, res, next) => {
  try {
    const querySedeId = resolveQuerySede(req.query.sede, requireUser(req));
    const where: WhereOptions<Attributes<CompraModel>> = {
      estadoPago: { [Op.ne]: 'pagado' },
      estado: { [Op.ne]: 'cancelada' },
      saldoPendiente: { [Op.gt]: 0 }
    };
    if (querySedeId) where.sedeId = querySedeId;

    const ordenes = await OrdenCompra.findAll({
      where,
      include: [{ model: Proveedor, as: 'proveedor', attributes: ['nombre', 'nit'] }],
      order: [['fechaVencimientoPago', 'ASC']]
    });

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const items = ordenes.map(o => {
      const plain = o.get({ plain: true });
      const vence = new Date(plain.fechaVencimientoPago ?? 0);
      const diffDays = Math.ceil((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      let semaforo = 'green';
      let clasificacion = 'al_dia';
      if (diffDays < 0) {
        semaforo = 'red';
        const mora = Math.abs(diffDays);
        if (mora > 90) clasificacion = '+90';
        else if (mora > 60) clasificacion = '60-90';
        else if (mora > 30) clasificacion = '30-60';
        else clasificacion = '0-30';
      }
      return {
        ...plain,
        diasHastaVencimiento: diffDays,
        diasVencido: diffDays < 0 ? Math.abs(diffDays) : 0,
        semaforo,
        clasificacion
      };
    });

    const totalSaldo = items.reduce((s, i) => s + parseFloat(String(i.saldoPendiente || 0)), 0);

    return res.json({ totalSaldo, cantidad: items.length, items });
  } catch (error) {
    next(error);
  }
};

export const getFlujoCaja: Handler<Body> = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const querySedeId = resolveQuerySede(req.query.sede, requireUser(req));
    const { startDate, endDate } = resolveDateRange(desde, hasta);

    const whereVentas: WhereOptions<Attributes<VentaModel>> = { createdAt: { [Op.between]: [startDate, endDate] }, estado: { [Op.in]: ['completada', 'credito'] } };
    if (querySedeId) whereVentas.sedeId = querySedeId;

    const ingresos = await Venta.sum('total', { where: whereVentas }) || 0;

    // Usar .sum() (no findAll+SUM): Postgres rechaza SELECT id + SUM sin GROUP BY
    const totalEgresos = parseFloat(String(await sumIncluding(EgresoCaja, 'monto', {
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        pagoCompraId: null // evita doble conteo con pagos de compra
      },
      include: [{
        model: Caja,
        as: 'caja',
        attributes: [],
        required: true,
        ...(querySedeId ? { where: { sedeId: querySedeId } } : {})
      }]
    }) || 0));

    const pagosCompra = await sumIncluding(PagoCompra, 'monto', {
      where: { createdAt: { [Op.between]: [startDate, endDate] } },
      include: querySedeId ? [{
        model: OrdenCompra,
        as: 'ordenCompra',
        attributes: [],
        where: { sedeId: querySedeId },
        required: true
      }] : []
    }) || 0;

    const ventasPorDia = await Venta.findAll<VentaModel & { fecha?: Date | string }>({
      where: whereVentas,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('Venta.createdAt')), 'fecha'],
        [sequelize.fn('SUM', sequelize.col('Venta.total')), 'total']
      ],
      group: [sequelize.fn('DATE', sequelize.col('Venta.createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('Venta.createdAt')), 'ASC']],
      raw: true
    });

    return res.json({
      desde: startDate.toISOString().split('T')[0],
      hasta: endDate.toISOString().split('T')[0],
      ingresos: parseFloat(String(ingresos)),
      egresosOperativos: totalEgresos,
      comprasPagadas: parseFloat(String(pagosCompra)),
      egresosTotal: totalEgresos + parseFloat(String(pagosCompra)),
      neto: parseFloat(String(ingresos)) - totalEgresos - parseFloat(String(pagosCompra)),
      serie: ventasPorDia.map(r => ({
        fecha: r.fecha,
        ingresos: parseFloat(String(r.total || 0))
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const getVentasPorMetodoPago: Handler<Body> = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const querySedeId = resolveQuerySede(req.query.sede, requireUser(req));
    const { startDate, endDate } = resolveDateRange(desde, hasta);

    const pagos = await PagoVenta.findAll<InstanceType<typeof PagoVenta> & { total?: string | number; cantidad?: string | number }>({
      where: { createdAt: { [Op.between]: [startDate, endDate] } },
      include: [{
        model: Venta,
        as: 'venta',
        attributes: [],
        required: true,
        where: {
          ...(querySedeId ? { sedeId: querySedeId } : {}),
          estado: { [Op.in]: ['completada', 'credito'] }
        }
      }],
      attributes: [
        'metodo',
        [sequelize.fn('SUM', sequelize.col('PagoVenta.monto')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('PagoVenta.id')), 'cantidad']
      ],
      group: ['metodo'],
      raw: true
    });

    return res.json(pagos.map(p => ({
      metodo: p.metodo,
      total: parseFloat(String(p.total || 0)),
      cantidad: parseInt(String(p.cantidad || 0), 10)
    })));
  } catch (error) {
    next(error);
  }
};

export const getTopProductos: Handler<Body> = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 15, 50);
    const querySedeId = resolveQuerySede(req.query.sede, requireUser(req));
    const { startDate, endDate } = resolveDateRange(desde, hasta);

    const items = await ItemVenta.findAll({
      include: [{
        model: Venta,
        as: 'venta',
        attributes: [],
        required: true,
        where: {
          createdAt: { [Op.between]: [startDate, endDate] },
          ...(querySedeId ? { sedeId: querySedeId } : {}),
          estado: { [Op.in]: ['completada', 'credito'] }
        }
      }, {
        model: Producto,
        as: 'producto',
        attributes: ['nombre', 'codigoBarras']
      }],
      attributes: [
        'productoId',
        [sequelize.fn('SUM', sequelize.col('ItemVenta.cantidad')), 'unidades'],
        [sequelize.fn('SUM', sequelize.col('ItemVenta.subtotal')), 'ingresos']
      ],
      group: ['productoId', 'producto.id', 'producto.nombre', 'producto.codigoBarras'],
      order: [[sequelize.fn('SUM', sequelize.col('ItemVenta.subtotal')), 'DESC']],
      limit
    });

    return res.json(items.map(row => ({
      productoId: row.productoId,
      nombre: row.producto?.nombre || '—',
      codigoBarras: row.producto?.codigoBarras || '',
      unidades: parseInt(String(row.get('unidades') || 0), 10),
      ingresos: parseFloat(String(row.get('ingresos') || 0))
    })));
  } catch (error) {
    next(error);
  }
};

export const getInventarioValorizado: Handler<Body> = async (req, res, next) => {
  try {
    const querySedeId = resolveQuerySede(req.query.sede, requireUser(req));
    const whereStock = querySedeId ? { sedeId: querySedeId } : {};

    const stocks = await StockSede.findAll({
      where: whereStock,
      include: [
        { model: Producto, as: 'producto', where: { activo: true } },
        { model: Sede, as: 'sede', attributes: ['nombre'] }
      ]
    });

    let valorCosto = 0;
    let valorVenta = 0;
    let unidades = 0;

    const items = stocks.map(s => {
      if (!s.producto) throw new Error('El stock no conserva su producto.');
      const cant = parseInt(String(s.cantidad), 10) || 0;
      const costo = parseFloat(String(s.producto.precioCosto)) || 0;
      const venta = parseFloat(String(s.producto.precioVenta)) || 0;
      const subCosto = cant * costo;
      const subVenta = cant * venta;
      valorCosto += subCosto;
      valorVenta += subVenta;
      unidades += cant;
      return {
        productoId: s.productoId,
        nombre: s.producto.nombre,
        codigoBarras: s.producto.codigoBarras,
        sede: s.sede?.nombre || '—',
        cantidad: cant,
        valorCosto: subCosto,
        valorVenta: subVenta
      };
    });

    return res.json({
      valorCosto,
      valorVenta,
      margenPotencial: valorVenta - valorCosto,
      unidades,
      items
    });
  } catch (error) {
    next(error);
  }
};

export const exportCsv: Handler<Body> = async (req, res, next) => {
  try {
    const { reporte } = req.query;
    if (!reporte) {
      return res.status(400).json({ error: 'Indique el parámetro reporte.' });
    }

    const fecha = new Date().toISOString().split('T')[0];
    let payload: CsvPayload = {};
    // Intercepta solo JSON sobre una Response real para reutilizar el reporte en CSV.
    const captureResponse = (receive: (data: CsvPayload) => void) => new Proxy(res, {
      get(target, key, receiver) {
        if (key === 'json') return (data: CsvPayload) => { receive(data); return receiver; };
        return Reflect.get(target, key, receiver);
      }
    });

    if (reporte === 'cartera') {
      await new Promise<void>((resolve, reject) => {
        getCarteraResumen(req, captureResponse(data => { payload = data; resolve(); }), reject);
      });
      const content = rowsToCsv(payload.items || [], [
        { label: 'Cliente', value: r => r.cliente?.nombre },
        { label: 'Documento', value: r => r.cliente?.documento },
        { label: 'Factura', value: r => r.factura?.numeroFactura },
        { label: 'Vencimiento', value: r => (r.fechaVencimiento || '').toString().split('T')[0] },
        { label: 'Saldo', key: 'saldoPendiente' },
        { label: 'Estado', key: 'estado' },
        { label: 'Días mora', key: 'diasVencido' }
      ]);
      return sendCsv(res, `cartera_${fecha}.csv`, content);
    }

    if (reporte === 'cuentas-por-pagar') {
      await new Promise<void>((resolve, reject) => {
        getCuentasPorPagar(req, captureResponse(data => { payload = data; resolve(); }), reject);
      });
      const content = rowsToCsv(payload.items || [], [
        { label: 'OC', key: 'numeroOrden' },
        { label: 'Proveedor', value: r => r.proveedor?.nombre },
        { label: 'Vencimiento', value: r => (r.fechaVencimientoPago || '').toString().split('T')[0] },
        { label: 'Total', key: 'total' },
        { label: 'Saldo', key: 'saldoPendiente' },
        { label: 'Estado pago', key: 'estadoPago' },
        { label: 'Días vencido', key: 'diasVencido' }
      ]);
      return sendCsv(res, `cuentas_por_pagar_${fecha}.csv`, content);
    }

    return res.status(400).json({ error: 'Reporte no soportado para exportación.' });
  } catch (error) {
    next(error);
  }
};

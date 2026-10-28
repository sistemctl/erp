const fs = require('node:fs');
const path = require('node:path');
const { controller } = require('./ts-backend-tools.cjs');
controller('analytics', `import type { Attributes, WhereOptions } from 'sequelize';
import type { Response } from 'express';
import type CompraModel = require('../models/OrdenCompra');
import type VentaModel = require('../models/Venta');
type Body = Record<string, never>;
interface CsvRow { cliente?: { nombre?: string; documento?: string | null }; factura?: { numeroFactura?: string }; proveedor?: { nombre?: string }; fechaVencimiento?: string | Date | null; fechaVencimientoPago?: string | Date | null; saldoPendiente?: string | number; estado?: string; diasVencido?: number; numeroOrden?: string; total?: string | number; estadoPago?: string }
interface CsvPayload { items?: CsvRow[] }
`, [
  ['function resolveDateRange(desde, hasta, defaultDays = 30)', 'function resolveDateRange(desde: string | undefined, hasta: string | undefined, defaultDays = 30)'],
  ['function clasificarMora(fechaVencimiento, saldo, estado)', 'function clasificarMora(fechaVencimiento: Date, saldo: string | number, estado: string): { bucket: "al_dia" | "0-30" | "30-60" | "60-90" | "+90"; diasVencido: number }'],
  ['(hoy - vence)', '(hoy.getTime() - vence.getTime())'],
  ['(vence - hoy)', '(vence.getTime() - hoy.getTime())'],
  ['new Date(plain.fechaVencimientoPago)', 'new Date(plain.fechaVencimientoPago ?? 0)'],
  ['const where = {', 'const where: WhereOptions<Attributes<CompraModel>> = {'],
  ['const whereVentas = {', 'const whereVentas: WhereOptions<Attributes<VentaModel>> = {'],
  ['const ventasPorDia = await Venta.findAll({', "const ventasPorDia = await Venta.findAll<VentaModel & { fecha: Date | string }>({"],
  ['const pagos = await PagoVenta.findAll({', "const pagos = await PagoVenta.findAll<InstanceType<typeof PagoVenta> & { total: string | number; cantidad: string | number }>({"],
  ["row.getDataValue('unidades')", "row.get('unidades')"],
  ["row.getDataValue('ingresos')", "row.get('ingresos')"],
  ['const cant = parseInt(s.cantidad, 10) || 0;', "if (!s.producto) throw new Error('El stock no conserva su producto.');\n      const cant = parseInt(s.cantidad, 10) || 0;"],
  ['let payload;', 'let payload: CsvPayload = {};'],
  ['await new Promise((resolve, reject)', 'await new Promise<void>((resolve, reject)'],
  ['exports.getCarteraResumen(req, {', 'getCarteraResumen(req, {'],
  ['exports.getCuentasPorPagar(req, {', 'getCuentasPorPagar(req, {'],
  ['json: (data) => { payload = data; resolve(); }', 'json: (data: CsvPayload) => { payload = data; resolve(); }'],
  ['}, reject);', '} as Response, reject);']
]);
const route = path.resolve(__dirname, '../../backend/routes/analytics.routes.ts');
fs.writeFileSync(route, fs.readFileSync(route, 'utf8').replace("'contador'];", "'contador'] as const;"));

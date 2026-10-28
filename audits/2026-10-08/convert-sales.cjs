const fs = require('node:fs');
const path = require('node:path');
const { controller, root } = require('./ts-backend-tools.cjs');
controller('ventas', `import type { Attributes, Transaction, WhereOptions, WhereAttributeHash } from 'sequelize';
import type ProductModel = require('../models/Producto');
import type ItemModel = require('../models/ItemVenta');
import type VentaModel = require('../models/Venta');
import type CajaModel = require('../models/Caja');
import type SerieModel = require('../models/NumeroSerie');
interface SaleInput { productoId: string; cantidad: unknown; precioModificado?: unknown; imei?: string | null; }
interface Body { clienteId?: string | null; sedeId?: string | null; subtotal?: number; descuentoTotal?: number; iva?: number; total?: number; esCredito?: boolean; observaciones?: string; items?: SaleInput[]; pagos?: { metodo: string; monto: number | string }[]; pinAdmin?: string; idempotencyKey?: string; }
interface ReturnBody { items?: { itemVentaId?: string; id?: string; cantidad: unknown }[]; motivo?: string; metodoReembolso?: string; }
interface ComboDeduction { producto: ProductModel; item: { cantidad: number }; itemVenta: ItemModel; venta: VentaModel; sedeId: string; usuarioId: string; clienteId: string; numeroVenta: string; transaction: Transaction; }`, [
  ['const METODOS_CAJA = {', 'const METODOS_CAJA: Record<string, keyof Pick<CajaModel, "totalVentasEfectivo" | "totalVentasNequi" | "totalVentasDaviplata" | "totalVentasTarjeta" | "totalVentasTransferencia">> = {'],
  ['function montoUnitarioItem(item)', 'function montoUnitarioItem(item: ItemModel)'],
  ['async function ensureCategoriaDevolucion(transaction)', 'async function ensureCategoriaDevolucion(transaction: Transaction)'],
  ['  transaction\n}) {', '  transaction\n}: ComboDeduction) {'],
  ['const error = new Error(', 'const error = httpError(400, '],
  ['error.status = 400;', ''],
  ['let seriales = [];', 'let seriales: SerieModel[] = [];'],
  ['  for (const componente of componentes) {', "  for (const componente of componentes) {\n    if (!componente.producto) throw httpError(400, 'Componente no encontrado.');"],
  ['      items, // array of', '      items: itemsInput, // array of'],
  ['Array.isArray(items)', 'Array.isArray(itemsInput)'],
  ["items.length === 0 || items.some", "itemsInput.length === 0 || itemsInput.some"],
  ['const products = new Map();', 'const products = new Map<string, ProductModel>();'],
  ['    for (const item of items) {\n      const product =', '    for (const item of itemsInput) {\n      const product ='],
  ['calculateSale(items, products', 'calculateSale(itemsInput, products'],
  ['({ items, subtotal, descuentoTotal, iva, total } = calculated);', 'const items = calculated.items;\n    ({ subtotal, descuentoTotal, iva, total } = calculated);'],
  ['const producto = await Producto.findByPk(item.productoId, { transaction });', "const producto = await Producto.findByPk(item.productoId, { transaction });\n      if (!producto) throw httpError(404, 'Producto no encontrado.');"],
  ['.includes(cliCred.documento)', ".includes(cliCred.documento || '')"],
  ['function triggerFacturaEmailAuto(facturaId)', 'function triggerFacturaEmailAuto(facturaId: string)'],
  ['.catch((err) => {', '.catch((err: Error) => {'],
  ['const where = {};', 'const where: WhereAttributeHash<Attributes<VentaModel>> & { [Op.or]?: WhereOptions<Attributes<VentaModel>>[] } = {};'],
  ['const where = {\n      estado:', 'const where: WhereOptions<Attributes<VentaModel>> = {\n      estado:'],
  ['v.total * porcentajeComision', 'Number(v.total) * porcentajeComision'],
  ['export const crearDevolucionVenta: Handler<Body>', 'export const crearDevolucionVenta: Handler<ReturnBody>'],
  ['const itemsById = new Map(venta.items.map', "if (!venta.items) throw httpError(409, 'La venta no conserva sus artículos.');\n    const itemsById = new Map(venta.items.map"],
  ['const allReturned = venta.items.every', "if (!venta.items) throw httpError(409, 'La venta no conserva sus artículos.');\n    const allReturned = venta.items.every"]
]);

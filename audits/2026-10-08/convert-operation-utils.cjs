const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../backend/node_modules/typescript');
const root = path.resolve(__dirname, '../../backend/utils');
function numerical(text) {
  const source = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (ts.isCallExpression(node) && /^(Number\.)?parse(Float|Int)$/.test(node.expression.getText(source)) && node.arguments.length) {
      const arg = node.arguments[0];
      edits.push([arg.getStart(source), arg.end, `String(${arg.getText(source)})`]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const [start, end, value] of edits.sort((a,b)=>b[0]-a[0])) text = text.slice(0,start) + value + text.slice(end);
  return text;
}
for (const name of ['combo', 'venta-inventario', 'caja-cobros', 'public-url']) {
  const file = path.join(root, name + '.js');
  let text = fs.readFileSync(file, 'utf8');
  let header = '';
  text = text.replace(/const \{([\s\S]*?)\} = require\('\.\.\/models'\);/, "import models = require('../models');\nconst {$1} = models;");
  text = text.replace(/const \{ ([^}]+) \} = require\('([^']+)'\);/g, "import { $1 } from '$2';");
  text = text.replaceAll('const error = new Error(', 'const error = httpError(400, ').replaceAll('    error.status = 400;\n', '');
  if (name === 'combo') {
    header = "import type { Transaction } from 'sequelize';\nimport { httpError } from './http-error';\ninterface Componente { productoId: string; cantidad: number; }\n";
    text = text.replace('function normalizeComponentes(componentes)', 'export function normalizeComponentes(componentes: unknown): Componente[]')
      .replace('componentes.map((row) => ({', "componentes.map((value: unknown) => {\n    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};\n    return {")
      .replace('  }));', '  }; });'); // Only the normalizer uses this exact indentation.
    text = text.replace('async function validateComboComponents({ comboId, componentes, transaction })', 'export async function validateComboComponents({ comboId, componentes, transaction }: { comboId?: string; componentes: unknown; transaction?: Transaction })')
      .replace('const producto = byId.get(row.productoId);', "const producto = byId.get(row.productoId);\n    if (!producto) throw httpError(400, 'Componente no encontrado.');")
      .replace('async function replaceComboComponents(comboId, componentes, transaction)', 'export async function replaceComboComponents(comboId: string, componentes: readonly Componente[], transaction?: Transaction)')
      .replace('async function recalculateParentComboCosts(productoId, transaction)', 'export async function recalculateParentComboCosts(productoId: string, transaction?: Transaction)')
      .replace('async function getComboAvailability(comboId, sedeId, { transaction, lock = false } = {})', 'export async function getComboAvailability(comboId: string, sedeId: string, { transaction, lock = false }: { transaction?: Transaction; lock?: boolean } = {})')
      .replace('  for (const componente of componentes) {', "  for (const componente of componentes) {\n    if (!componente.producto) throw httpError(400, 'Componente no encontrado.');");
  } else if (name === 'venta-inventario') {
    header = "import type { Transaction } from 'sequelize';\nimport type ItemVenta = require('../models/ItemVenta');\nimport type Venta = require('../models/Venta');\nimport type Devolucion = require('../models/DevolucionVenta');\nimport { httpError } from './http-error';\ninterface DevolverCombo { item: ItemVenta; cantidad: number; yaDev: number; venta: Venta; devolucion: Devolucion; numero: string; usuarioId: string; transaction: Transaction; }\n";
    text = text.replace('async function devolverComponentesCombo({ item, cantidad, yaDev, venta, devolucion, numero, usuarioId, transaction })', 'export async function devolverComponentesCombo({ item, cantidad, yaDev, venta, devolucion, numero, usuarioId, transaction }: DevolverCombo)')
      .replace('const porProducto = new Map();', 'const porProducto = new Map<string, { cantidad: number; seriales: string[] }>();')
      .replace('const group = porProducto.get(key);', 'const group = porProducto.get(key);\n    if (!group) throw new Error("Grupo de devolución ausente.");')
      .replace('defaults: { cantidad: 0 }', 'defaults: { productoId, sedeId: venta.sedeId, cantidad: 0 }');
  } else if (name === 'caja-cobros') {
    header = "import type { Attributes, Transaction } from 'sequelize';\nimport type CajaModel = require('../models/Caja');\nimport type FacturaModel = require('../models/Factura');\nimport type { PagoCaja } from '../types/model-json';\n";
    text = text.replace('const campos = {', 'export const campos: Record<string, keyof Pick<CajaModel, "totalVentasEfectivo" | "totalVentasNequi" | "totalVentasDaviplata" | "totalVentasTarjeta" | "totalVentasTransferencia">> = {')
      .replace('const redondear = (monto)', 'const redondear = (monto: unknown)')
      .replace("function pagosServicio(total, pagos, metodo = 'efectivo', credito = false)", "export function pagosServicio(total: unknown, pagos: Record<string, unknown> | null | undefined, metodo = 'efectivo', credito = false): PagoCaja[]")
      .replace('async function cajaHistorica(sedeId, fecha, transaction)', 'export async function cajaHistorica(sedeId: string, fecha: Date, transaction: Transaction)')
      .replace('async function revertirCobrosFactura(factura, transaction)', 'export async function revertirCobrosFactura(factura: FacturaModel, transaction: Transaction)')
      .replace('const porCaja = new Map();', 'const porCaja = new Map<string, Record<string, number>>();')
      .replace('function agregar(id, metodo, monto)', 'function agregar(id: string | null, metodo: string, monto: unknown)')
      .replace('venta.createdAt', 'venta?.createdAt || factura.createdAt')
      .replace('const cambios = {}, extras', 'const cambios: Partial<Attributes<CajaModel>> = {}, extras')
      .replace('Object.entries(porCaja.get(id))', 'Object.entries(porCaja.get(id) || {})');
  } else if (name === 'public-url') {
    header = "import type { Request } from 'express';\ntype PublicRequest = Pick<Request, 'get' | 'protocol' | 'app'>;\n";
    for (const fn of ['isLocalOrigin', 'isPrivateLanOrigin']) text = text.replace(`function ${fn}(origin)`, `function ${fn}(origin: string)`);
    text = text.replace('function isTunnelHostname(hostname)', 'export function isTunnelHostname(hostname: string | null | undefined)')
      .replace('function isAllowedCorsOrigin(origin)', 'export function isAllowedCorsOrigin(origin: string | null | undefined)')
      .replace('function getPublicOrigin(req)', 'export function getPublicOrigin(req?: PublicRequest | null)')
      .replace("function buildPublicAppUrl(req, path = '')", "export function buildPublicAppUrl(req?: PublicRequest | null, path = '')");
  }
  text = text.replace(/module\.exports = \{[\s\S]*?\};\s*$/, '');
  text = numerical(text);
  fs.writeFileSync(file.replace(/\.js$/, '.ts'), header + text);
  fs.unlinkSync(file);
}
module.exports = { numerical };

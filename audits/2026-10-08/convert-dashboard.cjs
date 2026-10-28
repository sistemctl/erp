const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../backend/node_modules/typescript');
const { controller } = require('./ts-backend-tools.cjs');
controller('dashboard', `import type { Attributes, WhereOptions } from 'sequelize';
import type { RequestUser } from '../../shared/contracts';
import { sumIncluding } from '../utils/sequelize-aggregate';
type Body = Record<string, never>;
interface DetailRow { primaria: string; secundaria: string; monto: number | null; montoEsCantidad?: boolean; montoSufijo?: string }
interface DetailPayload { tipo: string; titulo: string; valor: number | null; valorLabel: string; filas: DetailRow[]; vacio: string; link: string; linkLabel: string; scrollTarget?: string }
interface Activity { id: string; tipo: string; clave: string; cuando: Date; titulo: string; detalle: string; monto: number | null; href: string }
`, [
  ['const FUENTE_LABELS = {', 'const FUENTE_LABELS: Record<string, string> = {'],
  ['(sede, usuario) =>', '(sede: string | undefined, usuario: RequestUser) =>'],
  ['(date) => {', '(date: string | Date) => {'],
  ['(qualifiedCol) =>', '(qualifiedCol: string) =>'],
  ['(raw, bucket) =>', '(raw: unknown, bucket: string) =>'],
  ['(periodo) => {', '(periodo: string) => {'],
  ['(querySedeId) => ({', '(querySedeId: string | null) => ({'],
  ['async (startDate, endDate, querySedeId) =>', 'async (startDate: Date, endDate: Date, querySedeId: string | null) =>'],
  ['const labels = [];', 'const labels: string[] = [];'],
  ['let tiempoPromedio = 1.5;', 'let tiempoPromedio: string | number = 1.5;'],
  ['p.stocks.reduce', '(p.stocks || []).reduce'],
  ['acc + curr.cantidad', 'acc + Number(curr.cantidad)'],
  ['acc + c.cantidad', 'acc + Number(c.cantidad)'],
  ['totalStock < p.stockMinimo', 'totalStock < Number(p.stockMinimo)'],
  ['const ventasMap = {};', 'const ventasMap: Record<string, number> = {};'],
  ['const egresosMap = {};', 'const egresosMap: Record<string, number> = {};'],
  ['const pagosMap = {};', 'const pagosMap: Record<string, number> = {};'],
  ['const fmtDate = (d) =>', 'const fmtDate = (d: string | Date | null | undefined) =>'],
  ['const eventos = [];', 'const eventos: Activity[] = [];'],
  ['new Date(b.cuando) - new Date(a.cuando)', 'new Date(b.cuando).getTime() - new Date(a.cuando).getTime()'],
  ['new Date(r.updatedAt) - new Date(r.createdAt)', 'new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()'],
  ['new Date(o.updatedAt) - new Date(o.createdAt)', 'new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime()'],
  ['.filter(Boolean))];', '.filter((id): id is string => !!id))];'],
  ['const payload = {', 'const payload: DetailPayload = {'],
  ['const byProd = new Map();', 'const byProd = new Map<string, { nombre: string; codigo: string; cantidad: number }>();'],
  ['let filas = [];', 'let filas: DetailRow[] = [];']
]);
const file = path.resolve(__dirname, '../../backend/controllers/dashboard.controller.ts');
let text = fs.readFileSync(file,'utf8').replace(/(\w+)\.sum\(/g, 'sumIncluding($1, ').replace(/\.getDataValue\(/g, '.get(');
const source = ts.createSourceFile('dashboard.ts', text, ts.ScriptTarget.Latest, true);
const edits = [];
const known = {whereVentas:'Venta',whereReparaciones:'OrdenReparacion',whereClientes:'Cliente',whereCajas:'Caja',whereCompras:'OrdenCompra',whereCuentasPorPagar:'OrdenCompra',sumWhere:'CuentaPorCobrar'};
function visit(node) {
 if(ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
  const name = node.name.text;
  let model = known[name];
  if(name==='where') {
   const body = node.initializer.getText(source);
   model = /vencida|pagada/.test(body) ? 'CuentaPorCobrar' : /cancelada|estadoPago/.test(body) ? 'OrdenCompra' : /entregado/.test(body) ? 'OrdenReparacion' : 'Cliente';
  }
  if(model && !node.type) edits.push([node.name.end, `: WhereOptions<Attributes<InstanceType<typeof ${model}>>>`]);
 }
 ts.forEachChild(node,visit);
}
visit(source);
for(const [position, insert] of edits.sort((a,b)=>b[0]-a[0])) text = text.slice(0,position)+insert+text.slice(position);
fs.writeFileSync(file,text);

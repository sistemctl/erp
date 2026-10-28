const fs = require('node:fs');
const path = require('node:path');
const { imports, numerical, controller } = require('./ts-backend-tools.cjs');
const root = path.resolve(__dirname, '../../backend');
function convert(file, header, edits) {
  const source = path.join(root, 'utils', file + '.js');
  if (!fs.existsSync(source)) return;
  let text = imports(fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n'));
  text = text.replace('module.exports = {', 'export {');
  text = text.replace("import { resolveLogoPath } from './runtime-paths';", "import runtimePaths = require('./runtime-paths');\nconst { resolveLogoPath } = runtimePaths;");
  for (const [from, to] of edits) {
    if (!text.includes(from)) throw new Error(file + ': missing ' + from);
    text = text.replaceAll(from, to);
  }
  fs.writeFileSync(source.replace(/\.js$/, '.ts'), header + '\n' + numerical(text));
  fs.unlinkSync(source);
}
const doc = 'PDFKit.PDFDocument';
const shared = `export interface PdfItem { codigo: string; descripcion: string; unidad: string; cantidad: number; precioUnitario: string | number | null; subtotal: string | number | null }
export interface PdfColumn { label: string; w: number; align?: PDFKit.Mixins.TextOptions['align'] }
`;
convert('pdf-siigo-helpers', shared, [
  ['function fmtDate(d)', 'function fmtDate(d: string | number | Date | null | undefined)'],
  ['function fmtDateIso(d)', 'function fmtDateIso(d: string | number | Date | null | undefined)'],
  ['function fmtMoney(n)', 'function fmtMoney(n: unknown)'],
  ['function fmtMoneyDecimal(n)', 'function fmtMoneyDecimal(n: unknown)'],
  ['function labelValue(doc, x, y, label, value, width)', `function labelValue(doc: ${doc}, x: number, y: number, label: string, value: string | null | undefined, width: number)`],
  ['async function loadLogoForPdf(logoUrl)', 'async function loadLogoForPdf(logoUrl: unknown)'],
  ['if (fs.existsSync(filePath))', 'if (filePath && fs.existsSync(filePath))'],
  ['function drawItemsTable(doc, innerX, innerW, y, items, { minRows = 6, useDecimals = true } = {})', `function drawItemsTable(doc: ${doc}, innerX: number, innerW: number, y: number, items: PdfItem[], { minRows = 6, useDecimals = true } = {})`],
  ['const cols = [', 'const cols: PdfColumn[] = ['],
  ['function drawTotalsBlock(doc, tx, ty, totalsW, rows)', `function drawTotalsBlock(doc: ${doc}, tx: number, ty: number, totalsW: number, rows: [string, string][])`],
  ['function drawPageFooter(doc, empresa, innerX, innerW)', `function drawPageFooter(doc: ${doc}, empresa: string, innerX: number, innerW: number)`]
]);
const config = "import type { Attributes } from 'sequelize';\nimport type Configuracion = require('../models/ConfiguracionSistema');\ntype PdfConfig = Partial<Attributes<Configuracion>>;";
convert('factura-pdf', config + "\nimport type Factura = require('../models/Factura');\nimport type { PdfItem, PdfColumn } from './pdf-siigo-helpers';", [
  ['function getFacturaItems(factura)', 'function getFacturaItems(factura: Factura): PdfItem[]'],
  ['function getCondicionPago(factura)', 'function getCondicionPago(factura: Factura)'],
  ['async function generarFacturaPDF(doc, factura, config = {})', `async function generarFacturaPDF(doc: ${doc}, factura: Factura, config: PdfConfig = {})`],
  ['orden.precioCerrado === 1', 'Number(orden.precioCerrado) === 1'],
  ['const items = [{', 'const items: PdfItem[] = [{'],
  ['const items = [];', 'const items: PdfItem[] = [];'],
  ['function buildFacturaPdfBuffer(factura, config = {})', 'function buildFacturaPdfBuffer(factura: Factura, config: PdfConfig = {}): Promise<Buffer>'],
  ['return new Promise((resolve, reject)', 'return new Promise<Buffer>((resolve, reject)'],
  ['const chunks = [];', 'const chunks: Buffer[] = [];'],
  ['(chunk) => chunks.push(chunk)', '(chunk: Buffer) => chunks.push(chunk)'],
  ['let qrBuffer = null;', 'let qrBuffer: Buffer | null = null;']
]);
convert('cotizacion-pdf', config + "\nimport type Cotizacion = require('../models/Cotizacion');\nimport type { PdfColumn } from './pdf-siigo-helpers';", [
  ['function fmtDate(d)', 'function fmtDate(d: string | number | Date | null | undefined)'],
  ['function fmtMoney(n)', 'function fmtMoney(n: unknown)'],
  ['function labelValue(doc, x, y, label, value, width)', `function labelValue(doc: ${doc}, x: number, y: number, label: string, value: string | null | undefined, width: number)`],
  ['function calcIva(items, ivaPct)', "function calcIva(items: Parameters<typeof calcCotIvaItems>[0], ivaPct: Parameters<typeof calcCotIvaItems>[1])"],
  ['async function loadLogoForPdf(logoUrl)', 'async function loadLogoForPdf(logoUrl: unknown)'],
  ['if (fs.existsSync(filePath))', 'if (filePath && fs.existsSync(filePath))'],
  ['async function generarCotizacionPDF(doc, cotizacion, config = {})', `async function generarCotizacionPDF(doc: ${doc}, cotizacion: Cotizacion, config: PdfConfig = {})`],
  ['calcIva(cotizacion.items, ivaPct)', 'calcIva(cotizacion.items || [], ivaPct)'],
  ['const cols = [', 'const cols: PdfColumn[] = ['],
  ['let qrBuffer = null;', 'let qrBuffer: Buffer | null = null;']
]);
convert('cierre-pdf', `import type Caja = require('../models/Caja');
import type { PdfColumn } from './pdf-siigo-helpers';
interface CierreLinea { id?: string; numeroFactura: string; cliente?: string; medioPago?: string; metodo?: string; total?: number; monto?: number; totalCobrado?: number; createdAt?: Date; anuladoAt?: Date | null; estado?: string }
interface DetalleCierre { ventas: CierreLinea[]; egresos: { categoria: string; motivo: string | null; monto: number }[]; abonos: CierreLinea[]; servicios?: CierreLinea[]; reversos?: CierreLinea[]; advertencias?: string[] }
interface CierreConfig { nombreEmpresa?: string; logoUrl?: string | null }
`, [
  ['async function generarCierrePDF(caja, config = {}, detalle = { ventas: [], egresos: [], abonos: [] })', 'async function generarCierrePDF(caja: Caja, config: CierreConfig = {}, detalle: DetalleCierre = { ventas: [], egresos: [], abonos: [] }): Promise<Buffer>'],
  ['return new Promise(async (resolve, reject)', 'return new Promise<Buffer>(async (resolve, reject)'],
  ['const buffers = [];', 'const buffers: Buffer[] = [];'],
  ['(chunk) => buffers.push(chunk)', '(chunk: Buffer) => buffers.push(chunk)'],
  ["const vCols = [", 'const vCols: PdfColumn[] = ['],
  ["const eCols = [", 'const eCols: PdfColumn[] = ['],
  ["for (const [titulo, filas] of [", "for (const [titulo, filas] of ["],
  ["['Reversos por anulación', detalle.reversos || []]\n        ])", "['Reversos por anulación', detalle.reversos || []]\n        ] as [string, CierreLinea[]][])"]
]);
controller('nomina', `import type { Attributes, WhereOptions } from 'sequelize';
import type NominaModel = require('../models/Nomina');
interface Body { empleadoId?: string; periodo?: string; tipoPeriodo?: 'quincenal' | 'mensual'; horasExtra?: string | number; recargosNocturnos?: string | number; dominicales?: string | number; bonos?: string | number; deduccionPrestamos?: string | number; estado?: 'borrador' | 'aprobada' | 'pagada' }
`, [
  ['const where = {};', 'const where: WhereOptions<Attributes<NominaModel>> = {};'],
  ["if (!['borrador', 'aprobada', 'pagada'].includes(estado))", "if (!estado || !['borrador', 'aprobada', 'pagada'].includes(estado))"],
  ['const config = await ConfiguracionSistema.findOne();\n    const empresa', "if (!nomina.empleado || !nomina.empleado.sede) throw new Error('La nómina no conserva su empleado o sede.');\n    const config = await ConfiguracionSistema.findOne();\n    const empresa"],
  [", bold: true", ''],
  [", color: '#2563eb'", ''],
  ['{ bold: true }', '{}']
]);
const payroll = path.join(root, 'controllers/nomina.controller.ts');
fs.writeFileSync(payroll, fs.readFileSync(payroll, 'utf8').replace(/formatter\.format\((nomina\.\w+)\)/g, 'formatter.format(Number($1))'));
const period = path.join(root, 'utils/nomina-periodo.ts');
fs.writeFileSync(period, fs.readFileSync(period, 'utf8').replace(/tipoPeriodo: '(mensual|quincenal)',/g, "tipoPeriodo: '$1' as const,"));
const cash = path.join(root, 'models/Caja.ts');
fs.writeFileSync(cash, fs.readFileSync(cash, 'utf8').replace('ingresosAlCierre: unknown;', 'ingresosAlCierre: Record<string, number> | null;').replace('arqueoDeclarado: unknown;', 'arqueoDeclarado: Record<string, number> | null;'));

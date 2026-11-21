const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../backend/node_modules/typescript');
const { imports, numerical } = require('./ts-backend-tools.cjs');
const root = path.resolve(__dirname, '../../backend');
for (const name of ['migrate-caja-facturas', 'smoke-caja-facturas', 'test-smtp-once', 'migrate-odoo']) {
 const source = path.join(root,'scripts',name+'.js');
 let text=imports(fs.readFileSync(source,'utf8').replace(/\r\n/g,'\n'));
 text=text.replaceAll("import { PROJECT_ROOT } from '../utils/runtime-paths';", "import runtimePaths = require('../utils/runtime-paths');\nconst { PROJECT_ROOT } = runtimePaths;");
 text=text.replace(/(\w+)\.message/g,(all,name)=>['error','err','e'].includes(name)?`(${name} instanceof Error ? ${name}.message : String(${name}))`:all);
 text=text.replaceAll('node scripts/', 'node dist/scripts/');
 let header='';
 if(name==='smoke-caja-facturas') {
  text=text.replace('const token = jwt.sign(', "if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no configurada.');\n    const token = jwt.sign(");
  text=text.replace('const body = await response.json();', "const body: unknown = await response.json();\n      assert.ok(body && typeof body === 'object');");
  text=text.replace("assert.ok(Object.hasOwn(body.caja, 'arqueoDeclarado'))", "assert.ok('caja' in body && body.caja && typeof body.caja === 'object' && Object.hasOwn(body.caja, 'arqueoDeclarado'))");
 }
 if(name==='test-smtp-once') {
  header="import type { Attributes } from 'sequelize';\nimport type Configuracion = require('../models/ConfiguracionSistema');\n";
  text=text.replace('async function trySmtp(baseConfig, smtpSecure, smtpPort, destino)', 'async function trySmtp(baseConfig: Attributes<Configuracion>, smtpSecure: boolean, smtpPort: number, destino: string)');
  text=text.replace('const base = { ...(await ConfiguracionSistema.findOne()).toJSON(), ...SMTP_CONFIG };', "const persisted = await ConfiguracionSistema.findOne();\n  if (!persisted) throw new Error('Configuración SMTP no encontrada.');\n  const base = { ...persisted.toJSON(), ...SMTP_CONFIG };");
  text=text.replace('await ConfiguracionSistema.update({ ...merged, emailActivo: true, notificacionesActivas: true });', 'await ConfiguracionSistema.update({ ...merged, emailActivo: true, notificacionesActivas: true }, { where: {} });');
 }
 if(name==='migrate-odoo') {
  header=`import type { Transaction } from 'sequelize';
type IdMap = Map<string | number | null, string>;
type Present = Record<string, boolean>;
type Counts = Record<string, number>;
type Decimal = number | string | null;
interface WarehouseRow { id: number; name: unknown; direccion: string | null; telefono: string | null }
interface CategoryRow { id: number; name: unknown; complete_name: unknown }
interface ProductRow { product_id: number; template_id: number; name_raw: unknown; default_code: string | null; barcode: string | null; list_price: unknown; standard_price: unknown; categ_id: number | null; active: boolean | null; description_sale: unknown }
interface PartnerRow { id: number; name: string | null; phone: string | null; mobile: string | null; email: string | null; vat: string | null; street: string | null; city: string | null; customer_rank: number | null; supplier_rank: number | null; customer: boolean | null; supplier: boolean | null }
interface StockRow { product_id: number; warehouse_id: number | null; qty: Decimal }
interface SaleRow { id: number; name: string | null; partner_id: number | null; warehouse_id: number | null; amount_total: Decimal; amount_untaxed: Decimal; amount_tax: Decimal; note: string | null; date_order: string | Date | null }
interface SaleLine { id: number; product_id: number; product_uom_qty: Decimal; price_unit: Decimal; price_subtotal: Decimal; discount: Decimal }
interface InvoiceRow { id: number; name: string | null; partner_id: number | null; amount_total: Decimal; amount_untaxed: Decimal; amount_tax: Decimal; payment_state: string | null; invoice_origin: string | null; invoice_date_due: string | Date | null; invoice_date: string | Date | null }
interface PurchaseRow { id: number; name: string | null; partner_id: number | null; amount_total: Decimal; state: string; date_order: string | Date | null; notes: string | null; date_planned: string | Date | null }
interface PurchaseLine { id: number; product_id: number; product_qty: Decimal; qty_received: Decimal; price_unit: Decimal }
`;
  text=text.replace('warnings: []', 'warnings: [] as string[]')
   .replace('function warn(msg)', 'function warn(msg: string)')
   .replace('async function tableExists(db, tableName)', 'async function tableExists(db: Sequelize, tableName: string)')
   .replace('async function columnExists(db, tableName, columnName)', 'async function columnExists(db: Sequelize, tableName: string, columnName: string)')
   .replace('async function probeOdoo(odoo)', 'async function probeOdoo(odoo: Sequelize)')
   .replace('async function countOdoo(odoo, present)', 'async function countOdoo(odoo: Sequelize, present: Present)')
   .replace('async function cleanErp(transaction)', 'async function cleanErp(transaction: Transaction | null)')
   .replace('function localizeText(raw, fallback', 'function localizeText(raw: unknown, fallback')
   .replace("  if (typeof raw === 'object') {\n    return String(", "  if (typeof raw === 'object') {\n    const localized = raw as Record<string, unknown>;\n    return String(")
   .replace('raw.es_CO || raw.es_ES || raw.en_US', 'localized.es_CO || localized.es_ES || localized.en_US')
   .replace('function parseMoney(raw)', 'function parseMoney(raw: unknown): number')
   .replace("function uniqueBarcode(raw, odooId, used)", 'function uniqueBarcode(raw: unknown, odooId: number, used: Set<string>)')
   .replace('async function migrateSedesExisting(transaction)', 'async function migrateSedesExisting(transaction: Transaction | null)')
   .replace('const present = {};', 'const present: Present = {};')
   .replace('const counts = {};', 'const counts: Counts = {};')
   .replaceAll('const map = new Map();', 'const map: IdMap = new Map();')
   .replace('const usedBarcodes = new Set();', 'const usedBarcodes = new Set<string>();')
   .replace('const clienteMap = new Map();', 'const clienteMap: IdMap = new Map();')
   .replace('const proveedorMap = new Map();', 'const proveedorMap: IdMap = new Map();')
   .replace('const orderMap = new Map();', 'const orderMap: IdMap = new Map();')
   .replace('return new Map();', 'return new Map<string | number | null, string>();')
   .replace('const ventaByName = new Map();', 'const ventaByName = new Map<string | null, string | undefined>();')
   .replace('const aggregated = new Map();', 'const aggregated = new Map<string, number>();')
   .replace('const allSedeIds = [];', 'const allSedeIds: string[] = [];')
   .replaceAll("map.set('default', map.values().next().value);", "map.set('default', map.values().next().value || '');")
   .replace('map.set(\'default\', firstId);', "map.set('default', firstId || '');")
   .replace('function partnerIsCustomer(r)', 'function partnerIsCustomer(r: PartnerRow)')
   .replace('function partnerIsSupplier(r)', 'function partnerIsSupplier(r: PartnerRow)')
   .replace('function printReport(odooCounts)', 'function printReport(odooCounts: Counts)')
   .replace("if (k === 'warnings') continue;", "if (k === 'warnings' || Array.isArray(v)) continue;")
   .replace('await transaction.commit();', 'if (transaction) await transaction.commit();')
   .replace('{ transaction, individualHooks: true }', '{ transaction }');
  const signatures={
   migrateSedes:'odoo: Sequelize, present: Present, transaction: Transaction | null',
   migrateCategorias:'odoo: Sequelize, present: Present, transaction: Transaction | null',
   migrateProductos:'odoo: Sequelize, present: Present, catMap: IdMap, transaction: Transaction | null',
   migratePartners:'odoo: Sequelize, sedeMap: IdMap, transaction: Transaction | null',
   migrateStock:'odoo: Sequelize, present: Present, productMap: IdMap, sedeMap: IdMap, transaction: Transaction | null',
   getDefaultUsuarioId:'sedeMap: IdMap, transaction: Transaction | null',
   migrateVentas:'odoo: Sequelize, present: Present, productMap: IdMap, clienteMap: IdMap, sedeMap: IdMap, usuarioId: string, transaction: Transaction | null',
   migrateFacturas:'odoo: Sequelize, present: Present, clienteMap: IdMap, sedeMap: IdMap, orderMap: IdMap, transaction: Transaction | null',
   migrateCompras:'odoo: Sequelize, present: Present, productMap: IdMap, proveedorMap: IdMap, sedeMap: IdMap, usuarioId: string, transaction: Transaction | null',
   rebindUsuarios:'sedeMap: IdMap, transaction: Transaction | null'
  };
  for(const [fn,args] of Object.entries(signatures)) text=text.replace(new RegExp('async function '+fn+'\\([^)]*\\)'), 'async function '+fn+'('+args+')');
  const ast=ts.createSourceFile('odoo.ts',text,ts.ScriptTarget.Latest,true), edits=[];
  const types={migrateSedes:'WarehouseRow',migrateCategorias:'CategoryRow',migrateProductos:'ProductRow',migratePartners:'PartnerRow',migrateStock:'StockRow',migrateVentas:'SaleRow',migrateFacturas:'InvoiceRow',migrateCompras:'PurchaseRow',countOdoo:'{ c: number }'};
  function visit(node, fn='') {
   if(ts.isFunctionDeclaration(node)&&node.name)fn=node.name.text;
   if(ts.isCallExpression(node)&&node.expression.getText(ast)==='odoo.query') {
    let type=types[fn]; const sql=node.arguments[0].getText(ast);
    if(/FROM sale_order_line/.test(sql))type='SaleLine';
    if(/FROM purchase_order_line/.test(sql))type='PurchaseLine';
    if(fn==='migrateFacturas' && /FROM sale_order /.test(sql))type='{ id: number; name: string | null }';
    if(type)edits.push([node.expression.end, '<'+type+'>']);
   }
   if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='rows'&&!node.type&&types[fn])edits.push([node.name.end, ': '+types[fn]+'[]']);
   ts.forEachChild(node,n=>visit(n,fn));
  }
  visit(ast);
  for(const [at,insert]of edits.sort((a,b)=>b[0]-a[0]))text=text.slice(0,at)+insert+text.slice(at);
 }
 fs.writeFileSync(source.replace(/\.js$/, '.ts'),header+numerical(text));fs.unlinkSync(source);
}

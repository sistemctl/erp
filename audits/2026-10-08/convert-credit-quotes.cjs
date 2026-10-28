const { controller } = require('./ts-backend-tools.cjs');
controller('cartera', `import type { Attributes, WhereOptions } from 'sequelize';
import type CuentaModel = require('../models/CuentaPorCobrar');
import type FacturaModel = require('../models/Factura');
type Body = { monto?: number | string; metodo?: string; observaciones?: string; sedeId?: string };`, [
  ['const where = { anuladaAt: null };', 'const where: WhereOptions<Attributes<CuentaModel>> = { anuladaAt: null };'],
  ["const includeFacturaWhere = { estado: { [Op.ne]: 'anulada' } };", "const includeFacturaWhere: WhereOptions<Attributes<FacturaModel>> = { estado: { [Op.ne]: 'anulada' } };"],
  ['where.estado = estado;', "where.estado = estado as Attributes<CuentaModel>['estado'];"],
  ['const plain = cpc.get({ plain: true });', 'const plain = cpc.get({ plain: true }) as Attributes<CuentaModel> & { diasVencido?: number; semaforo?: string; clasificacion?: string };'],
  ['const diffTime = hoy - fechaVence;', 'const diffTime = hoy.getTime() - fechaVence.getTime();']
]);
controller('cotizaciones', `import type { Attributes, CreationAttributes, WhereOptions, WhereAttributeHash } from 'sequelize';
import type CotModel = require('../models/Cotizacion');
interface CotItem { descripcion: string; cantidad: number; precioUnitario: number | string; productoId?: string | null; }
type Body = { clienteId?: string; sedeId?: string; items?: CotItem[]; fechaVencimiento?: string; notas?: string; ventaId?: string; ordenReparacionId?: string };`, [
  ['const where = {};', 'const where: WhereAttributeHash<Attributes<CotModel>> & { [Op.or]?: WhereOptions<Attributes<CotModel>>[] } = {};'],
  ['where.estado = estado;', "where.estado = estado as Attributes<CotModel>['estado'];"],
  ["import { generarCotizacionPDF } from '../utils/cotizacion-pdf';", "import { generarCotizacionPDF as renderCotizacionPDF } from '../utils/cotizacion-pdf';"],
  ['const itemsACrear = [];', 'const itemsACrear: (CotItem & { subtotal: number })[] = [];'],
  ['item.cotizacionId = cotizacion.id;\n      await ItemCotizacion.create(item, { transaction });', 'await ItemCotizacion.create({ ...item, cotizacionId: cotizacion.id }, { transaction });'],
  ['await generarCotizacionPDF(doc, cotizacion, config || {});', 'await renderCotizacionPDF(doc, cotizacion, config || {});']
]);

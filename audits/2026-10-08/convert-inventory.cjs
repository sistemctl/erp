const { controller } = require('./ts-backend-tools.cjs');
controller('productos', `import type { Attributes, CreationAttributes, WhereOptions, WhereAttributeHash, IncludeOptions } from 'sequelize';
import type ProductModel = require('../models/Producto');
import type SerieModel = require('../models/NumeroSerie');
import type CategoriaModel = require('../models/Categoria');
type Body = CreationAttributes<ProductModel> & { componentes?: unknown; ajusteStock?: number | string | null; sedeId?: string; reasignarA?: string };`, [
  ['const comboInclude = {', 'const comboInclude: IncludeOptions = {'],
  ['const where = { activo: true };', 'const where: WhereAttributeHash<Attributes<ProductModel>> & { [Op.or]?: WhereOptions<Attributes<ProductModel>>[] } = { activo: true };'],
  ['combo ? comboData.precioCosto', 'comboData ? comboData.precioCosto'],
  ['if (combo) {', 'if (combo && comboData) {'],
  ["productData.esServicio === 'false'", "String(productData.esServicio) === 'false'"],
  ['defaults: { cantidad: 0 }', 'defaults: { productoId: id, sedeId, cantidad: 0 }'],
  ['usadoEnCombo.combo.nombre', "usadoEnCombo.combo?.nombre || 'activo'"],
  ['const include = [', 'const include: IncludeOptions[] = ['],
  ["const serieWhere = { serie: codigo, estado: 'en_stock' };", "const serieWhere: WhereOptions<Attributes<SerieModel>> = { serie: codigo, estado: 'en_stock' };"],
  ['const responseData = producto.toJSON();', 'const responseData = producto.toJSON<Attributes<ProductModel> & { stocks?: { cantidad: number }[]; disponibilidadCombo?: number; autoDetectedImei?: string }>();'],
  ['const row = {};', 'const row: Record<string, string | undefined> = {};'],
  ['const json = c.toJSON();', 'const json = c.toJSON<Attributes<CategoriaModel> & { productCount: number | string }>();'],
  ['const patch = {};', 'const patch: Partial<Attributes<CategoriaModel>> = {};']
]);
controller('inventario', `import type { Attributes, WhereOptions } from 'sequelize';
import type StockModel = require('../models/StockSede');
import type ProductModel = require('../models/Producto');
import type SerieModel = require('../models/NumeroSerie');
import type MovimientoModel = require('../models/MovimientoInventario');
type Body = { productoId?: string; sedeOrigenId?: string; sedeDestinoId?: string; cantidad?: number | string; motivo?: string; series?: string[] };`, [
  ['const json = row.toJSON();', "const json = row.toJSON<Attributes<StockModel> & { producto?: Attributes<ProductModel> & { componentes?: Awaited<ReturnType<typeof getComboAvailability>>['componentes']; disponibilidadCombo?: number } }>();"],
  ['const createdAt = {};', 'const createdAt: { [Op.gte]?: Date; [Op.lte]?: Date } = {};'],
  ['...(tipo ? { tipo } : {})', "...(tipo ? { tipo: tipo as Attributes<MovimientoModel>['tipo'] } : {})"],
  ['let seriales = [];', 'let seriales: SerieModel[] = [];']
]);

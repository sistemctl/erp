const { controller } = require('./ts-backend-tools.cjs');
controller('facturas', `import type { Attributes, WhereOptions, WhereAttributeHash } from 'sequelize';
import type FacturaModel = require('../models/Factura');
type Body = Record<string, never>;`, [
  ['const where = {};', 'const where: WhereAttributeHash<Attributes<FacturaModel>> & { [Op.or]?: WhereOptions<Attributes<FacturaModel>>[] } = {};'],
  ['where.estado = estado;', "where.estado = estado as Attributes<FacturaModel>['estado'];"],
  ['for (const item of venta.items)', 'for (const item of venta.items || [])'],
  ['for (const rep of orden.repuestos)', 'for (const rep of orden.repuestos || [])']
]);

const { controller } = require('./ts-backend-tools.cjs');
controller('tradein', `import type { Attributes, CreationAttributes, WhereOptions } from 'sequelize';
import type TradeModel = require('../models/TradeIn');
type Body = CreationAttributes<TradeModel> & { precioVenta?: number | string };`, [
  ['const where = {};', 'const where: WhereOptions<Attributes<TradeModel>> = {};'],
  ["defaults: { descripcion: 'Dispositivos de clientes recibidos como parte de pago' }", "defaults: { nombre: 'Equipos Reacondicionados', descripcion: 'Dispositivos de clientes recibidos como parte de pago' }"]
]);
controller('rma', `import type { Attributes, CreationAttributes, WhereAttributeHash, WhereOptions } from 'sequelize';
import type ReclamoModel = require('../models/ReclamoGarantia');
import type VentaModel = require('../models/Venta');
type Body = Partial<CreationAttributes<ReclamoModel>>;`, [
  ['let venta = null;', 'let venta: VentaModel | null = null;'],
  ['ordenRep?.diasGarantia > 0', '(ordenRep?.diasGarantia || 0) > 0'],
  ['? ordenRep.diasGarantia', '? ordenRep!.diasGarantia || DEFAULT_DIAS_GARANTIA'],
  ['const where = {};', 'const where: WhereAttributeHash<Attributes<ReclamoModel>> & { [Op.or]?: WhereOptions<Attributes<ReclamoModel>>[] } = {};'],
  ['where.estado = estado;', "where.estado = estado as Attributes<ReclamoModel>['estado'];"],
  ['allowed.includes(estado)', "allowed.includes(estado || '')"]
]);

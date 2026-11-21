const { controller } = require('./ts-backend-tools.cjs');
controller('instalaciones', `import type { Attributes, CreationAttributes, WhereOptions, WhereAttributeHash, IncludeOptions } from 'sequelize';
import type OrdenModel = require('../models/OrdenInstalacion');
import type MaterialModel = require('../models/MaterialInstalacion');
import { campos } from '../utils/caja-cobros';
type Body = Omit<Partial<CreationAttributes<OrdenModel>>, 'fechaProgramada' | 'precioCerrado'> & { fechaProgramada?: string | null; precioCerrado?: boolean | string | number | null; productoId?: string; cantidad?: number | string; series?: string[]; precioUnitario?: number | string; modoCobro?: string; metodoPago?: string; pagos?: Record<string, number | string> };`, [
  ['const includeDetalle = [', 'const includeDetalle: IncludeOptions[] = ['],
  ["    }],\n    required: false\n  }", "    }]\n  }"],
  ['function recalcTotales(orden, materiales)', "function recalcTotales(orden: { valorServicio?: number | string | null; precioCerrado?: boolean | string | number | null }, materiales: readonly MaterialModel[] = [])"],
  ['const where = {};', 'const where: WhereAttributeHash<Attributes<OrdenModel>> & { [Op.or]?: WhereOptions<Attributes<OrdenModel>>[] } = {};'],
  ['where.estado = estado;', "where.estado = estado as Attributes<OrdenModel>['estado'];"],
  ['where.createdAt = {};', 'const dates: { [Op.gte]?: Date; [Op.lte]?: Date } = {};\n      where.createdAt = dates;'],
  ['where.createdAt[', 'dates['],
  ['const patch = {};', 'const patch: Partial<Attributes<OrdenModel>> = {};'],
  ["const patch = { estado: 'en_proceso' };", "const patch: Partial<Attributes<OrdenModel>> = { estado: 'en_proceso' };"],
  ['fechaProgramada: fechaProgramada || null,', 'fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null,'],
  ['patch.fechaProgramada = fechaProgramada || null;', 'patch.fechaProgramada = fechaProgramada ? new Date(fechaProgramada) : null;'],
  ['seriesList = null;', 'seriesList = [];'],
  ['series: seriesList', 'series: producto.tieneNumeroSerie ? seriesList : null'],
  ['if (totalBloqueado) {', 'if (totalBloqueado && factura) {'],
  ['const message = totalBloqueado', 'const message = totalBloqueado && factura'],
  ["const campo = {\n              efectivo: 'totalVentasEfectivo',\n              nequi: 'totalVentasNequi',\n              daviplata: 'totalVentasDaviplata',\n              tarjeta: 'totalVentasTarjeta',\n              transferencia: 'totalVentasTransferencia'\n            }[metodo];", 'const campo = campos[metodo];']
]);

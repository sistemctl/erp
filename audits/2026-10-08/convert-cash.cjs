const { controller } = require('./ts-backend-tools.cjs');
controller('caja', `import type { Attributes, CreationAttributes, WhereOptions } from 'sequelize';
import type CajaModel = require('../models/Caja');
import type { RequestUser } from '../../shared/contracts';
type Body = Omit<Partial<CreationAttributes<CajaModel>>, 'totalesPorMetodo'> & { cajaId?: string; monto?: number | string; categoriaId?: string; motivo?: string; pinAdmin?: string; totalesPorMetodo?: Record<string, unknown> | null };`, [
  ["import { fechaOperativa, cierrePendiente } from '../utils/caja-fecha';", "import cajaFecha = require('../utils/caja-fecha');\nconst { fechaOperativa, cierrePendiente } = cajaFecha;"],
  ['const arqueoDeclarado = {};', 'const arqueoDeclarado: Record<string, number> = {};'],
  ['let caja;', 'let caja: CajaModel | null;'],
  ['const where = {};', 'const where: WhereOptions<Attributes<CajaModel>> = {};'],
  ['const createdAt = {};', 'const createdAt: { [Op.gte]?: Date; [Op.lte]?: Date } = {};'],
  ['const enRango = (fecha) => fecha && (!desde || new Date(fecha) >= createdAt[Op.gte]) &&\n      (!hasta || new Date(fecha) <= createdAt[Op.lte]);', 'const enRango = (fecha: Date | null) => !!fecha && (!createdAt[Op.gte] || fecha >= createdAt[Op.gte]) &&\n      (!createdAt[Op.lte] || fecha <= createdAt[Op.lte]);'],
  ['const money = (value)', 'const money = (value: unknown)'],
  ['const paymentLabel = {', 'const paymentLabel: Record<string, string> = {'],
  ['new Date(b.fecha) - new Date(a.fecha)', 'Number(b.fecha) - Number(a.fecha)'],
  ['return exports.cierreCaja(req, res, next);', 'return cierreCaja(req, res, next);'],
  ['async function fetchCierreZData(cajaId, usuario)', 'async function fetchCierreZData(cajaId: string, usuario: RequestUser)'],
  ['const advertencias = [];', 'const advertencias: string[] = [];'],
  ['async function pertenece(registro, fecha)', 'async function pertenece(registro: { id: string; cajaId: string | null }, fecha: Date)'],
  ['if (error.status !== 409)', "if (!error || typeof error !== 'object' || !('status' in error) || error.status !== 409)"],
  ['const factura = abono.cuentaPorCobrar.factura;', "const cuenta = abono.cuentaPorCobrar;\n    const factura = cuenta?.factura;\n    if (!cuenta || !factura) throw new Error('El abono no conserva su cuenta o factura.');"],
  ['abono.cuentaPorCobrar.cliente?.nombre', 'cuenta.cliente?.nombre']
]);

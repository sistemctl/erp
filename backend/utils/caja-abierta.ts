import models = require('../models');
const { Caja, ConfiguracionSistema } = models;
import cajaFecha = require('./caja-fecha');
const { assertCajaVigente } = cajaFecha;
import type { Includeable, Transaction, WhereOptions, Attributes } from 'sequelize';
import type CajaModel = require('../models/Caja');
interface CajaSearch { sedeId?: string | null; usuarioId?: string | null; transaction?: Transaction | null; include?: Includeable | Includeable[]; permitirPendiente?: boolean; }

/**
 * Caja compartida por sede (default true): una sesión abierta sirve a todos los usuarios.
 * Si está desactivada, cada usuario solo opera su propia caja abierta.
 */
export async function isCajaCompartidaSede(transaction?: Transaction | null) {
  const config = await ConfiguracionSistema.findOne({
    attributes: ['cajaCompartidaSede'],
    transaction: transaction || undefined
  });
  // default true si el campo aún no existe o es null
  return config?.cajaCompartidaSede !== false;
}

export function buildCajaAbiertaWhere(sedeId: string, usuarioId: string | null | undefined, compartida: boolean) {
  const where: WhereOptions<Attributes<CajaModel>> = { sedeId, estado: 'abierta' };
  if (!compartida && usuarioId) {
    where.usuarioAperturaId = usuarioId;
  }
  return where;
}

export async function findCajaAbierta({ sedeId, usuarioId, transaction, include, permitirPendiente = false }: CajaSearch = {}) {
  if (!sedeId) return { caja: null, compartida: true };

  const compartida = await isCajaCompartidaSede(transaction);
  const where = buildCajaAbiertaWhere(sedeId, usuarioId, compartida);

  const caja = await Caja.findOne({
    where,
    order: [['createdAt', 'DESC']],
    include: include || undefined,
    transaction: transaction || undefined,
    ...(transaction ? { lock: { level: transaction.LOCK.UPDATE, of: Caja } } : {})
  });

  if (!permitirPendiente) assertCajaVigente(caja);
  return { caja, compartida };
}


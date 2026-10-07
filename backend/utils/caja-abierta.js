const { Caja, ConfiguracionSistema } = require('../models');
const { assertCajaVigente } = require('./caja-fecha');

/**
 * Caja compartida por sede (default true): una sesión abierta sirve a todos los usuarios.
 * Si está desactivada, cada usuario solo opera su propia caja abierta.
 */
async function isCajaCompartidaSede(transaction) {
  const config = await ConfiguracionSistema.findOne({
    attributes: ['cajaCompartidaSede'],
    transaction: transaction || undefined
  });
  // default true si el campo aún no existe o es null
  return config?.cajaCompartidaSede !== false;
}

function buildCajaAbiertaWhere(sedeId, usuarioId, compartida) {
  const where = { sedeId, estado: 'abierta' };
  if (!compartida && usuarioId) {
    where.usuarioAperturaId = usuarioId;
  }
  return where;
}

async function findCajaAbierta({ sedeId, usuarioId, transaction, include, permitirPendiente = false } = {}) {
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

module.exports = {
  isCajaCompartidaSede,
  buildCajaAbiertaWhere,
  findCajaAbierta
};

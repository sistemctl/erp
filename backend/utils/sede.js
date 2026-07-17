const GLOBAL_ROLES = ['admin', 'superadmin'];

const isGlobalRole = (rol) => GLOBAL_ROLES.includes(rol);

const isValidSedeParam = (sede) => {
  if (!sede || sede === 'undefined' || sede === 'null') return false;
  return true;
};

/** Filtro de listados: null = todas las sedes (admin/superadmin) */
const resolveQuerySede = (sedeParam, usuario) => {
  if (!isGlobalRole(usuario.rol)) {
    return usuario.sedeId || null;
  }
  return isValidSedeParam(sedeParam) ? sedeParam : null;
};

/**
 * Sede para crear/actualizar registros.
 * Roles no globales: siempre la sede del usuario (se ignora bodySedeId).
 * Admin/superadmin: body → usuario → primera sede.
 */
const resolveActionSede = async (bodySedeId, usuario, Sede, transaction = null) => {
  if (!isGlobalRole(usuario.rol)) {
    return usuario.sedeId || null;
  }

  let sedeId = (isValidSedeParam(bodySedeId) ? bodySedeId : null)
    || usuario.sedeId
    || null;

  if (!sedeId && Sede) {
    const firstSede = await Sede.findOne({ transaction: transaction || undefined });
    if (firstSede) sedeId = firstSede.id;
  }
  return sedeId;
};

/** Texto de sede en plantillas SMS/correo: dirección física, con fallback al nombre */
const textoSedeNotificacion = (sede) => {
  if (!sede) return '';
  return String(sede.direccion || sede.nombre || '').trim();
};

module.exports = {
  GLOBAL_ROLES,
  isGlobalRole,
  resolveQuerySede,
  resolveActionSede,
  textoSedeNotificacion
};

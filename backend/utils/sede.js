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

/** Sede para crear registros: body → usuario → primera sede (roles globales) */
const resolveActionSede = async (bodySedeId, usuario, Sede, transaction = null) => {
  let sedeId = bodySedeId || usuario.sedeId || null;
  if (!sedeId && isGlobalRole(usuario.rol) && Sede) {
    const firstSede = await Sede.findOne({ transaction: transaction || undefined });
    if (firstSede) sedeId = firstSede.id;
  }
  return sedeId;
};

module.exports = {
  GLOBAL_ROLES,
  isGlobalRole,
  resolveQuerySede,
  resolveActionSede
};

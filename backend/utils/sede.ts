import type { ModelStatic, Transaction } from 'sequelize';
import type SedeModel = require('../models/Sede');
import type { RequestUser } from '../../shared/contracts';
import { httpError } from './http-error';
export const GLOBAL_ROLES = ['admin', 'superadmin'];

export const isGlobalRole = (rol: string | null | undefined) => !!rol && GLOBAL_ROLES.includes(rol);

export function assertSedeAccess(usuario: RequestUser | null | undefined, sedeId: unknown) {
  if (!isGlobalRole(usuario?.rol) && (!usuario?.sedeId || String(usuario.sedeId) !== String(sedeId))) {
    throw httpError(403, 'No tiene acceso a registros de esta sede.');
  }
}

const isValidSedeParam = (sede: string | null | undefined): sede is string => {
  if (!sede || sede === 'undefined' || sede === 'null') return false;
  return true;
};

/** Filtro de listados: null = todas las sedes (admin/superadmin) */
export const resolveQuerySede = (sedeParam: string | null | undefined, usuario: RequestUser) => {
  if (!isGlobalRole(usuario.rol)) {
    assertSedeAccess(usuario, usuario.sedeId);
    return usuario.sedeId;
  }
  return isValidSedeParam(sedeParam) ? sedeParam : null;
};

/**
 * Sede para crear/actualizar registros.
 * Roles no globales: siempre la sede del usuario (se ignora bodySedeId).
 * Admin/superadmin: body → usuario → primera sede.
 */
export const resolveActionSede = async (bodySedeId: string | null | undefined, usuario: RequestUser, Sede?: ModelStatic<SedeModel>, transaction: Transaction | null = null) => {
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
export const textoSedeNotificacion = (sede: { direccion?: string | null; nombre?: string | null } | null | undefined) => {
  if (!sede) return '';
  return String(sede.direccion || sede.nombre || '').trim();
};


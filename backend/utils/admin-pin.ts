import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import models = require('../models');
import { httpError } from './http-error';

const { Usuario } = models;

// El "PIN de administrador" es la contraseña de un admin activo. Para impedir que se
// adivine por fuerza bruta desde caja o POS, se limita por usuario que lo intenta.
const MAX_FALLOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map<string, { count: number; first: number; bloqueadoHasta?: number }>();

function estado(usuarioId: string) {
  const now = Date.now();
  const actual = fallos.get(usuarioId);
  if (actual && actual.bloqueadoHasta && actual.bloqueadoHasta <= now) {
    fallos.delete(usuarioId);
    return undefined;
  }
  if (actual && !actual.bloqueadoHasta && now - actual.first > VENTANA_MS) {
    fallos.delete(usuarioId);
    return undefined;
  }
  return actual;
}

/**
 * Valida el PIN contra los administradores activos.
 * Devuelve el id del administrador que autoriza; lanza 403 si es inválido o 429 si
 * el usuario superó el número de intentos fallidos.
 */
export async function verificarPinAdmin(pinAdmin: unknown, usuarioId: string, transaction?: Transaction): Promise<string> {
  const actual = estado(usuarioId);
  if (actual?.bloqueadoHasta) {
    const minutos = Math.ceil((actual.bloqueadoHasta - Date.now()) / 60000);
    throw httpError(429, `Demasiados intentos de PIN fallidos. Espere ${minutos} min o pida al administrador que autorice en persona.`, 'ADMIN_PIN_LOCKED');
  }

  const pin = String(pinAdmin ?? '');
  if (pin) {
    const administradores = await Usuario.findAll({
      where: { rol: { [Op.in]: ['admin', 'superadmin'] }, activo: true },
      transaction
    });
    for (const admin of administradores) {
      if (await admin.compararPassword(pin)) {
        fallos.delete(usuarioId);
        return admin.id;
      }
    }
  }

  const now = Date.now();
  const registro = actual ?? { count: 0, first: now };
  registro.count += 1;
  if (registro.count >= MAX_FALLOS) registro.bloqueadoHasta = now + VENTANA_MS;
  fallos.set(usuarioId, registro);
  const restantes = Math.max(0, MAX_FALLOS - registro.count);
  throw httpError(403, restantes > 0
    ? `PIN de Administrador inválido. Intentos restantes: ${restantes}.`
    : 'PIN de Administrador inválido. Se bloquearon los intentos por 15 minutos.', 'ADMIN_PIN_INVALID');
}

/** Solo para pruebas. */
export function _resetPinAdminIntentos() { fallos.clear(); }

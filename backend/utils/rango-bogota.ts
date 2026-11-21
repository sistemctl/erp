import cajaFecha = require('./caja-fecha');
import { httpError } from './http-error';
import { Op } from 'sequelize';

// Colombia no tiene horario de verano: el día operativo va de 00:00 a 23:59:59.999 en UTC-5.
const OFFSET = '-05:00';
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function ymdValido(value: string, campo: string): string {
  const ymd = value.slice(0, 10);
  if (!YMD.test(ymd) || Number.isNaN(new Date(`${ymd}T00:00:00${OFFSET}`).getTime())) {
    throw httpError(400, `La fecha "${campo}" no es válida (use AAAA-MM-DD).`);
  }
  return ymd;
}

/** Inicio del día (00:00 Bogotá) de una fecha AAAA-MM-DD. */
export function inicioDiaBogota(ymd: string): Date {
  return new Date(`${ymdValido(ymd, 'desde')}T00:00:00.000${OFFSET}`);
}

/** Fin del día (23:59:59.999 Bogotá) de una fecha AAAA-MM-DD. */
export function finDiaBogota(ymd: string): Date {
  return new Date(`${ymdValido(ymd, 'hasta')}T23:59:59.999${OFFSET}`);
}

/** Fecha de hoy en Bogotá (AAAA-MM-DD). */
export function hoyBogota(): string {
  return cajaFecha.fechaOperativa();
}

/** Resta días a una fecha AAAA-MM-DD sin depender de la zona horaria del servidor. */
export function restarDias(ymd: string, dias: number): string {
  const base = new Date(`${ymd}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}

type FiltroFecha = { [Op.gte]?: Date; [Op.lte]?: Date };

/**
 * Filtro de createdAt para listados con fechas opcionales AAAA-MM-DD (hora de Bogotá):
 * desde 00:00 y hasta 23:59:59.999, incluidos ambos días. Devuelve undefined si no hay fechas.
 * Una fecha mal formada responde 400 en lugar de un error de base de datos.
 */
export function filtroFechaBogota(desde: unknown, hasta: unknown): FiltroFecha | undefined {
  const texto = (valor: unknown, campo: string) => {
    if (valor === undefined || valor === null || valor === '') return '';
    if (typeof valor !== 'string') throw httpError(400, `La fecha "${campo}" no es válida (use AAAA-MM-DD).`);
    return valor.trim();
  };
  const desdeYmd = texto(desde, 'desde');
  const hastaYmd = texto(hasta, 'hasta');
  if (!desdeYmd && !hastaYmd) return undefined;
  const filtro: FiltroFecha = {};
  if (desdeYmd) filtro[Op.gte] = inicioDiaBogota(desdeYmd);
  if (hastaYmd) filtro[Op.lte] = finDiaBogota(hastaYmd);
  return filtro;
}

/** Rango [desde 00:00, hasta 23:59:59.999] en hora de Bogotá; por defecto los últimos `defaultDays` días. */
export function rangoBogota(desde: string | undefined, hasta: string | undefined, defaultDays = 30) {
  const hastaYmd = hasta ? ymdValido(hasta, 'hasta') : hoyBogota();
  const desdeYmd = desde ? ymdValido(desde, 'desde') : restarDias(hastaYmd, defaultDays);
  return { startDate: inicioDiaBogota(desdeYmd), endDate: finDiaBogota(hastaYmd), desdeYmd, hastaYmd };
}

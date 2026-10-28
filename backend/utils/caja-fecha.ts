import { httpError } from './http-error';

type FechaEntrada = Date | string | number;
interface SesionCaja { estado: string; fecha: string; }

// El día operativo se define en Colombia, independientemente del reloj del servidor.
function fechaOperativa(date: FechaEntrada = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(date instanceof Date ? date.getTime() : date));
}

function cierrePendiente(caja: SesionCaja | null | undefined, ahora: FechaEntrada = new Date()): boolean {
  return !!caja && caja.estado === 'abierta' && caja.fecha < fechaOperativa(ahora);
}

function assertCajaVigente(caja: SesionCaja | null | undefined, ahora: FechaEntrada = new Date()): void {
  if (caja && cierrePendiente(caja, ahora)) {
    throw httpError(409, `Tienes un cierre pendiente del ${caja.fecha}. Cierra esa caja y abre la caja de hoy para continuar.`, 'CAJA_CIERRE_PENDIENTE');
  }
}

export = { fechaOperativa, cierrePendiente, assertCajaVigente };

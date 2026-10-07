const { httpError } = require('./http-error');

// El día operativo se define en Colombia, independientemente del reloj del servidor.
function fechaOperativa(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(date));
}

function cierrePendiente(caja, ahora = new Date()) {
  return !!caja && caja.estado === 'abierta' && caja.fecha < fechaOperativa(ahora);
}

function assertCajaVigente(caja, ahora = new Date()) {
  if (cierrePendiente(caja, ahora)) {
    throw httpError(409, `Tienes un cierre pendiente del ${caja.fecha}. Cierra esa caja y abre la caja de hoy para continuar.`, 'CAJA_CIERRE_PENDIENTE');
  }
}

module.exports = { fechaOperativa, cierrePendiente, assertCajaVigente };

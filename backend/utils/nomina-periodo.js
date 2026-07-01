const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const DEFAULTS = {
  nominaFrecuenciaDefault: 'quincenal',
  nominaDiaCorteQuincena: 15,
  nominaDiaPago1: 15,
  nominaDiaPago2: 30,
};

function clampDia(d, fallback = 1) {
  const n = parseInt(d, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(1, Math.min(31, n));
}

function parseNominaConfig(config = {}) {
  return {
    frecuencia: config.nominaFrecuenciaDefault || DEFAULTS.nominaFrecuenciaDefault,
    diaCorte: clampDia(config.nominaDiaCorteQuincena, DEFAULTS.nominaDiaCorteQuincena),
    diaPago1: clampDia(config.nominaDiaPago1, DEFAULTS.nominaDiaPago1),
    diaPago2: clampDia(config.nominaDiaPago2, DEFAULTS.nominaDiaPago2),
  };
}

function obtenerPeriodoPagoQuincenal(refDate = new Date(), config = {}) {
  const { frecuencia, diaCorte, diaPago1, diaPago2 } = parseNominaConfig(config);
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDate();
  const mm = String(m + 1).padStart(2, '0');
  const ultimoDiaMes = new Date(y, m + 1, 0).getDate();
  const mesNombre = MESES[m];

  if (frecuencia === 'mensual') {
    const diaPago = Math.min(diaPago2, ultimoDiaMes);
    const dd = String(diaPago).padStart(2, '0');
    return {
      tipoPeriodo: 'mensual',
      periodo: `${y}-${mm}`,
      etiqueta: `Mes ${mesNombre} ${y} · pago ${diaPago}/${mm}/${y}`,
      rango: `1 al ${ultimoDiaMes} de ${mesNombre} de ${y}`,
    };
  }

  const dd1 = String(Math.min(diaPago1, ultimoDiaMes)).padStart(2, '0');
  const diaPago2Eff = Math.min(diaPago2, ultimoDiaMes);
  const dd2 = String(diaPago2Eff).padStart(2, '0');

  if (d <= diaCorte) {
    return {
      tipoPeriodo: 'quincenal',
      periodo: `${y}-${mm}-${dd1}`,
      quincena: 1,
      diaPago: parseInt(dd1, 10),
      rango: `1 al ${diaCorte} de ${mesNombre} de ${y}`,
      etiqueta: `1.ª quincena · del 1 al ${diaCorte} de ${mesNombre} · pago ${dd1}/${mm}/${y}`,
    };
  }

  return {
    tipoPeriodo: 'quincenal',
    periodo: `${y}-${mm}-${dd2}`,
    quincena: 2,
    diaPago: diaPago2Eff,
    rango: `${diaCorte + 1} al ${ultimoDiaMes} de ${mesNombre} de ${y}`,
    etiqueta: `2.ª quincena · del ${diaCorte + 1} al ${ultimoDiaMes} de ${mesNombre} · pago ${diaPago2Eff}/${mm}/${y}`,
  };
}

module.exports = { obtenerPeriodoPagoQuincenal, parseNominaConfig, MESES, DEFAULTS };

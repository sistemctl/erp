const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const NOMINA_CONFIG_DEFAULTS = {
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

export function parseNominaConfig(config = {}) {
  return {
    frecuencia: config.nominaFrecuenciaDefault || NOMINA_CONFIG_DEFAULTS.nominaFrecuenciaDefault,
    diaCorte: clampDia(config.nominaDiaCorteQuincena, NOMINA_CONFIG_DEFAULTS.nominaDiaCorteQuincena),
    diaPago1: clampDia(config.nominaDiaPago1, NOMINA_CONFIG_DEFAULTS.nominaDiaPago1),
    diaPago2: clampDia(config.nominaDiaPago2, NOMINA_CONFIG_DEFAULTS.nominaDiaPago2),
  };
}

export function obtenerPeriodoPagoQuincenal(refDate = new Date(), config = {}) {
  const { frecuencia, diaCorte, diaPago1, diaPago2 } = parseNominaConfig(config);
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDate();
  const mm = String(m + 1).padStart(2, '0');
  const ultimoDiaMes = new Date(y, m + 1, 0).getDate();
  const mesNombre = MESES[m];

  if (frecuencia === 'mensual') {
    const diaPago = Math.min(diaPago2, ultimoDiaMes);
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

export function formatearEtiquetaPeriodo(periodo, tipoPeriodo = 'quincenal', config = {}) {
  if (tipoPeriodo === 'mensual') {
    const matchMes = String(periodo).match(/^(\d{4})-(\d{2})$/);
    if (!matchMes) return periodo;
    const [, y, mm] = matchMes;
    const mesNombre = MESES[parseInt(mm, 10) - 1] || mm;
    const { diaPago2 } = parseNominaConfig(config);
    return `Mes ${mesNombre} ${y} · pago ${diaPago2}/${mm}/${y}`;
  }

  const match = String(periodo).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return periodo;
  const [, y, mm, dd] = match;
  const mesNombre = MESES[parseInt(mm, 10) - 1] || mm;
  const dia = parseInt(dd, 10);
  const { diaCorte, diaPago1 } = parseNominaConfig(config);
  const ultimoDia = new Date(parseInt(y, 10), parseInt(mm, 10), 0).getDate();

  if (dia === Math.min(diaPago1, ultimoDia)) {
    return `1.ª quincena · 1-${diaCorte} ${mesNombre} ${y} · pago ${dia}/${mm}/${y}`;
  }
  return `2.ª quincena · ${diaCorte + 1}-${ultimoDia} ${mesNombre} ${y} · pago ${dia}/${mm}/${y}`;
}

export function resumenConfigNomina(config = {}) {
  const { frecuencia, diaCorte, diaPago1, diaPago2 } = parseNominaConfig(config);
  if (frecuencia === 'mensual') {
    return `Pago mensual · día ${diaPago2} de cada mes`;
  }
  return `Quincenal · corte día ${diaCorte} · pagos los días ${diaPago1} y ${diaPago2}`;
}

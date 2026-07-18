const UNIDADES_VALIDAS = new Set(['und', 'm']);

/** Normaliza unidad de medida del producto. Default: und. */
function normalizeUnidadMedida(value) {
  const u = String(value || 'und').trim().toLowerCase();
  return UNIDADES_VALIDAS.has(u) ? u : 'und';
}

/** Etiqueta corta para docs/UI (und / m). */
function labelUnidadMedida(value) {
  return normalizeUnidadMedida(value) === 'm' ? 'm' : 'und';
}

module.exports = {
  UNIDADES_VALIDAS,
  normalizeUnidadMedida,
  labelUnidadMedida
};

/** Normaliza unidad de medida del producto. Default: und. */
export function normalizeUnidadMedida(value) {
  const u = String(value || 'und').trim().toLowerCase();
  return u === 'm' ? 'm' : 'und';
}

/** Etiqueta corta para UI/docs (und / m). */
export function labelUnidadMedida(value) {
  return normalizeUnidadMedida(value) === 'm' ? 'm' : 'und';
}

/** Texto de stock: "305 m" o "12 und". */
export function formatStockUnidad(cantidad, unidadMedida) {
  return `${cantidad} ${labelUnidadMedida(unidadMedida)}`;
}

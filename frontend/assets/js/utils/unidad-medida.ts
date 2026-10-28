/** Normaliza unidad de medida del producto. Default: und. */
export function normalizeUnidadMedida(value: unknown) {
  const u = String(value || 'und').trim().toLowerCase();
  return u === 'm' ? 'm' : 'und';
}

/** Etiqueta corta para UI/docs (und / m). */
export function labelUnidadMedida(value: unknown) {
  return normalizeUnidadMedida(value) === 'm' ? 'm' : 'und';
}

/** Texto de stock: "305 m" o "12 und". */
export function formatStockUnidad(cantidad: number | string, unidadMedida: unknown) {
  return `${cantidad} ${labelUnidadMedida(unidadMedida)}`;
}

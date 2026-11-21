export const UNIDADES_VALIDAS = new Set(['und', 'm']);

/** Normaliza unidad de medida del producto. Default: und. */
export function normalizeUnidadMedida(value: unknown): 'und' | 'm' {
  const u = String(value || 'und').trim().toLowerCase();
  return u === 'm' ? 'm' : 'und';
}

/** Etiqueta corta para docs/UI (und / m). */
export function labelUnidadMedida(value: unknown) {
  return normalizeUnidadMedida(value) === 'm' ? 'm' : 'und';
}


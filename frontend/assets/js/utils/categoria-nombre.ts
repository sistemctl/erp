/**
 * Las categorías importadas guardan la ruta completa como nombre
 * ("Servitec Gamers / Accesorios y Cables / Adaptadores"). En tarjetas, chips y
 * tablas basta el último nivel ("Adaptadores"); la ruta completa queda en el title.
 * Si dos categorías comparten el último nivel, se usan los dos últimos para distinguirlas.
 */
const partes = (nombre: string) => String(nombre || '').split('/').map((p) => p.trim()).filter(Boolean);

export function nombreCortoCategoria(nombre: string | null | undefined, todas: readonly { nombre?: string | null }[] = []): string {
  const p = partes(nombre || '');
  if (p.length <= 1) return String(nombre || '').trim();
  const ultimo = p[p.length - 1];
  const repetido = todas.some((c) => c.nombre && c.nombre !== nombre && partes(c.nombre).pop()?.toLowerCase() === ultimo.toLowerCase());
  return repetido ? p.slice(-2).join(' / ') : ultimo;
}

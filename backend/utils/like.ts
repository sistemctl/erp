/**
 * Escapa los comodines de LIKE/ILIKE (% y _) y la barra de escape, para que el texto
 * que escribe el usuario se busque tal cual: "50%" no debe coincidir con "500 GB".
 * PostgreSQL usa la barra invertida como carácter de escape por defecto en LIKE.
 */
export function escaparLike(valor: unknown): string {
  return String(valor ?? '').replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/** Patrón "contiene" para ILIKE con el texto del usuario escapado. */
export function contiene(valor: unknown): string {
  return `%${escaparLike(valor)}%`;
}

/** Devuelve YYYY-MM-DD en la zona horaria local del navegador. */
export function getLocalDateStr(date: Date | string | number = new Date()): string {
  const d = new Date(date instanceof Date ? date.getTime() : date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

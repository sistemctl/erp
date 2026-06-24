/**
 * Formats a Date object as a local YYYY-MM-DD string.
 * @param {Date} [date] - The date to format, defaults to now.
 * @returns {string} The formatted local date string.
 */
export function getLocalDateStr(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

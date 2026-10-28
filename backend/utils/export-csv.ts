import type { Response } from 'express';
type CsvColumn<T> = { label: string; key: keyof T; value?: never } | { label: string; value: (row: T) => unknown; key?: never };
export function escapeCsvCell(value: unknown) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]) {
  const header = columns.map(c => escapeCsvCell(c.label)).join(',');
  const lines = rows.map(row =>
    columns.map(c => escapeCsvCell(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

export function sendCsv(res: Response, filename: string, csvContent: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csvContent);
}


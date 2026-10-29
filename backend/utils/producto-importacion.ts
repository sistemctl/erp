import { costoPorMetro, moneyCents, moneyText } from './compra-unidad';
import { normalizeUnidadMedida } from './unidad-medida';

/** Empty CSV fields and escaped quotes must retain their column positions. */
export function parseCsvRecord(line: string): string[] {
  const fields: string[] = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { fields.push(value.trim()); value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('El CSV contiene comillas sin cerrar; no se admiten saltos de línea dentro de una celda.');
  fields.push(value.trim()); return fields;
}
export function importProductPrices(row: Record<string, string | undefined>) {
  const unidadMedida = normalizeUnidadMedida(row.unidadMedida);
  let precioCosto: string;
  if (row.presentacionCosto === 'rollo') {
    if (unidadMedida !== 'm') throw new Error('Solo los productos en m admiten costo por rollo.');
    if (row.precioCosto) throw new Error('No combine precioCosto por metro y costoTotalRollo: se convertiría dos veces.');
    precioCosto = costoPorMetro(row.costoTotalRollo, row.metrosPorRollo).costoPorMetro;
  } else {
    if (row.presentacionCosto && row.presentacionCosto !== 'unidad') throw new Error('presentacionCosto debe ser unidad o rollo.');
    if (row.costoTotalRollo || row.metrosPorRollo) throw new Error('Indique presentacionCosto=rollo para convertir con una longitud explícita.');
    precioCosto = moneyText(moneyCents(row.precioCosto));
  }
  return { unidadMedida, precioCosto, precioVenta: moneyText(moneyCents(row.precioVenta)) };
}

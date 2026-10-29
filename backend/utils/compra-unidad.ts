/** Canonical purchase values are always inventory units. Keep browser preview in parity tests. */
export interface CompraUnidadInput {
  presentacion?: 'unidad' | 'rollo'; cantidadPedida?: unknown; precioUnitario?: unknown;
  costoTotalRollo?: unknown; metrosPorRollo?: unknown; cantidadRollos?: unknown;
}
const MAX_CENTS = 999999999999999n;
export function moneyCents(value: unknown): bigint {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,8})?$/.test(text)) throw new Error('El importe debe ser un número positivo, sin separadores de miles.');
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)) + (Number(fraction[2] || 0) >= 5 ? 1n : 0n);
  if (cents > MAX_CENTS) throw new Error('El importe supera el máximo permitido.');
  return cents;
}
export function moneyText(cents: bigint): string { return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`; }
export function inventoryQuantity(value: unknown): number {
  const text = String(value ?? '').trim();
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw new Error('La cantidad debe ser un entero positivo (metros completos para productos en m).');
  return number;
}
export function costoPorMetro(costoTotal: unknown, longitud: unknown) {
  const metros = inventoryQuantity(longitud);
  const total = moneyCents(costoTotal);
  if (total <= 0n) throw new Error('El costo total del rollo debe ser mayor que cero.');
  const divisor = BigInt(metros);
  const unit = (total * 2n + divisor) / (divisor * 2n); // half up to one cent
  if (unit <= 0n) throw new Error('El costo por metro es inferior a un centavo.');
  return { metros, costoPorMetro: moneyText(unit), totalCalculado: moneyText(unit * divisor), diferenciaCentavos: Number(unit * divisor - total) };
}
export function normalizeCompraUnidad(input: CompraUnidadInput, unidad: string) {
  if (input.presentacion && !['unidad', 'rollo'].includes(input.presentacion)) throw new Error('Presentación de compra no válida.');
  if (input.presentacion === 'rollo') {
    if (unidad !== 'm') throw new Error('La compra por rollo solo está disponible para productos en metros.');
    if (input.precioUnitario !== undefined || input.cantidadPedida !== undefined) throw new Error('Envíe el rollo o los valores por metro, nunca ambos; el costo no debe convertirse dos veces.');
    const converted = costoPorMetro(input.costoTotalRollo, input.metrosPorRollo);
    const rolls = inventoryQuantity(input.cantidadRollos ?? 1);
    return { cantidadPedida: inventoryQuantity(converted.metros * rolls), precioUnitario: converted.costoPorMetro };
  }
  if (input.costoTotalRollo !== undefined || input.metrosPorRollo !== undefined || input.cantidadRollos !== undefined) throw new Error('Indique presentacion=rollo para convertir un rollo explícitamente.');
  const cantidadPedida = inventoryQuantity(input.cantidadPedida);
  const price = moneyCents(input.precioUnitario);
  if (price <= 0n) throw new Error('El costo unitario debe ser mayor que cero.');
  return { cantidadPedida, precioUnitario: moneyText(price) };
}

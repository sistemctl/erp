import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { costoPorMetro, normalizeCompraUnidad, moneyCents, inventoryQuantity } from '../utils/compra-unidad';
import { importProductPrices, parseCsvRecord } from '../utils/producto-importacion';

test('rollos ficticios A y B: costo por metro y valoración restante', () => {
  assert.equal(costoPorMetro('80000', 100).costoPorMetro, '800.00');
  assert.equal(costoPorMetro('183000', 305).costoPorMetro, '600.00');
  assert.equal(moneyCents(costoPorMetro(80000, 100).costoPorMetro) * 35n, 2800000n);
  assert.equal(moneyCents(costoPorMetro(183000, 305).costoPorMetro) * 200n, 12000000n);
});
test('centavos exactos: redondeo half up, sin redondear a pesos enteros', () => {
  assert.equal(costoPorMetro(100, 3).costoPorMetro, '33.33');
  assert.equal(costoPorMetro(100, 3).diferenciaCentavos, -1);
  assert.equal(costoPorMetro(1, 200).costoPorMetro, '0.01');
  assert.equal(moneyCents('1.005'), 101n);
  assert.equal(normalizeCompraUnidad({ cantidadPedida: 100, precioUnitario: '800.45' }, 'm').precioUnitario, '800.45');
});
test('normalización idempotente: una conversión explícita, nunca dos', () => {
  const raw = { presentacion: 'rollo' as const, costoTotalRollo: 80000, metrosPorRollo: 100, cantidadRollos: 2 };
  const canonical = normalizeCompraUnidad(raw, 'm');
  assert.deepEqual(canonical, { cantidadPedida: 200, precioUnitario: '800.00' });
  assert.deepEqual(normalizeCompraUnidad(canonical, 'm'), canonical);
  assert.throws(() => normalizeCompraUnidad({ ...raw, ...canonical }, 'm'), /nunca ambos/);
  assert.throws(() => normalizeCompraUnidad(raw, 'und'), /solo/);
  assert.throws(() => normalizeCompraUnidad({ costoTotalRollo: 80000, metrosPorRollo: 100 }, 'm'), /explícitamente/);
});
test('rechaza longitudes desconocidas, ceros, fracciones y cantidades truncables', () => {
  for (const value of [0, -1, '', '100m', '35.5', Infinity, 2147483648]) assert.throws(() => inventoryQuantity(value));
  for (const length of [0, undefined, -1, 1.5]) assert.throws(() => costoPorMetro(80000, length));
  for (const price of [-1, '80.000,00', 'NaN', Infinity]) assert.throws(() => costoPorMetro(price, 100));
  assert.throws(() => costoPorMetro('0.01', 100));
});
test('CSV conserva vacíos y comillas; precios existentes ya son por unidad de inventario', () => {
  assert.deepEqual(parseCsvRecord('"Cable, A",,"Dijo ""hola""",800'), ['Cable, A', '', 'Dijo "hola"', '800']);
  assert.deepEqual(importProductPrices({ unidadMedida: 'm', precioCosto: '800', precioVenta: '1200' }), { unidadMedida: 'm', precioCosto: '800.00', precioVenta: '1200.00' });
  assert.equal(importProductPrices({ unidadMedida: 'm', presentacionCosto: 'rollo', costoTotalRollo: '183000', metrosPorRollo: '305', precioVenta: '1000' }).precioCosto, '600.00');
  assert.throws(() => importProductPrices({ unidadMedida: 'm', presentacionCosto: 'rollo', costoTotalRollo: '80000', metrosPorRollo: '100', precioCosto: '800', precioVenta: '1200' }), /dos veces/);
  assert.equal(importProductPrices({ unidadMedida: 'und', precioCosto: '80000', precioVenta: '100000' }).precioCosto, '80000.00');
});
test('la vista previa y el backend aplican exactamente el mismo redondeo y normalización', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../frontend/dist/assets/js/utils/compra-unidad.js'), 'utf8');
  const preview = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`) as { costoPorMetro: typeof costoPorMetro; normalizeCompraUnidad: typeof normalizeCompraUnidad };
  for (const [total, length] of [[80000, 100], [183000, 305], [100, 3], [1, 200], [100.01, 9]]) assert.deepEqual(preview.costoPorMetro(total, length), costoPorMetro(total, length));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { calculateSale, normalizePayments, amount } = require('../utils/venta-totales');
const { encryptBackup, decryptBackup } = require('../utils/backup');
const { assertSedeAccess, resolveQuerySede } = require('../utils/sede');
const product = { precioVenta: 10000, tieneIVA: true };
const calculate = (rows, config = {}) => calculateSale(rows, new Map([['p', product]]), config);
const line = (extra = {}) => ({ productoId: 'p', cantidad: 1, precioModificado: 10000, ...extra });

test('totales y descuento se calculan a partir del catálogo', () => {
  const result = calculate([line({ precioBase: 1, precioModificado: 2000, descuentoPct: 0 })]);
  assert.equal(result.items[0].descuentoPct, 80);
  assert.equal(result.subtotal, 10000);
  assert.equal(result.total, 2380);
});
test('IVA desactivado y productos exentos', () => {
  assert.equal(calculate([line()], { cobrarIvaPos: false }).iva, 0);
  const result = calculateSale([line()], new Map([['p', { ...product, tieneIVA: false }]]));
  assert.equal(result.iva, 0);
});
test('redondeo por línea conserva centavos en IVA', () => {
  const result = calculate([line({ cantidad: 3, precioModificado: 1.13 })]);
  assert.equal(result.total, 4.03);
  assert.equal(Math.round(result.items[0].iva * 3 * 100), 64);
});
test('cantidades inválidas y equipos agrupados se rechazan', () => {
  for (const cantidad of [0, -1, 1.5, true, null, Infinity]) assert.throws(() => calculate([line({ cantidad })]), { status: 400 });
  assert.throws(() => calculateSale([line({ cantidad: 2 })], new Map([['p', { ...product, tieneNumeroSerie: true }]])), { status: 400 });
});
test('contado sin pago o un centavo insuficiente se rechaza', () => {
  assert.throws(() => normalizePayments([], 100, false), { status: 400 });
  assert.throws(() => normalizePayments([{ metodo: 'tarjeta', monto: 99.99 }], 100, false), { status: 400 });
});
test('cambio descuenta efectivo y conserva el cobro neto', () => {
  const result = normalizePayments([{ metodo: 'tarjeta', monto: 50 }, { metodo: 'efectivo', monto: 100 }], 100, false);
  assert.equal(result.change, 50);
  assert.equal(result.paid, 100);
  assert.equal(result.pagos[1].monto, 50);
});
test('sobrepago sin efectivo y montos inválidos se rechazan', () => {
  assert.throws(() => normalizePayments([{ metodo: 'tarjeta', monto: 101 }], 100, false), { status: 400 });
  for (const value of [true, null, '', ' ', {}, -1, Infinity, 'NaN']) assert.throws(() => amount(value, 'Pago'), { status: 400 });
});
test('crédito conserva el abono parcial', () => {
  assert.equal(normalizePayments([{ metodo: 'efectivo', monto: 25 }], 100, true).paid, 25);
});
test('sede ajena y usuario sin sede no obtienen acceso global', () => {
  assert.throws(() => assertSedeAccess({ rol: 'cajero', sedeId: 'A' }, 'B'), { status: 403 });
  assert.throws(() => resolveQuerySede(null, { rol: 'cajero', sedeId: null }), { status: 403 });
  assert.equal(resolveQuerySede('B', { rol: 'superadmin' }), 'B');
});
test('respaldo cifra datos y detecta contraseña incorrecta o modificación', () => {
  const data = { Usuario: [{ password: 'hash-private' }], ComboComponente: [] };
  const password = 'backup-test-password';
  const backup = encryptBackup(data, password);
  assert.ok(!JSON.stringify(backup).includes('hash-private'));
  assert.deepEqual(decryptBackup(backup, password), data);
  assert.throws(() => decryptBackup(backup, 'wrong-test-password'), { status: 400 });
  const bytes = Buffer.from(backup.payload, 'base64'); bytes[0] ^= 1;
  assert.throws(() => decryptBackup({ ...backup, payload: bytes.toString('base64') }, password), { status: 400 });
  assert.throws(() => decryptBackup(data, password), { status: 400 });
});
test('PIN rechazado con 403 mantiene la sesión del cajero', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/assets/js/api.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
  const store = new Map([['token', 'fixture-token'], ['usuario', '{}']]);
  const window = { location: { hash: '#/pos' } };
  const apiFetch = vm.runInNewContext(`${source}\napiFetch`, { FormData, console: { error() {} },
    window, localStorage: { getItem: (k) => store.get(k), removeItem: (k) => store.delete(k) },
    fetch: async () => ({ status: 403, ok: false, json: async () => ({ error: 'PIN incorrecto' }) }) });
  await assert.rejects(apiFetch('/ventas', { method: 'POST' }), /PIN/);
  assert.equal(store.get('token'), 'fixture-token');
  assert.equal(window.location.hash, '#/pos');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '../../frontend/assets/js', file), 'utf8');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('API consulta sin caché y comunica solo escrituras exitosas, incluyendo 204', async () => {
  const changes = [], calls = [];
  let status = 200;
  const apiFetch = vm.runInNewContext(`${read('api.js').replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function')}\napiFetch`, {
    FormData, console: { error() {} }, window: { location: {} }, localStorage: { getItem() { return null; } },
    notifyDataChange: endpoint => changes.push(endpoint),
    fetch: async (_url, config) => {
      calls.push(config);
      return { status, ok: status < 400, json: async () => status === 400 ? { error: 'Rechazado' } : [] };
    }
  });
  await apiFetch('/productos');
  assert.equal(calls[0].cache, 'no-store');
  assert.equal(changes.length, 0);
  await apiFetch('/productos', { method: 'POST', body: '{}' });
  assert.deepEqual(changes, ['/productos']);
  status = 400;
  await assert.rejects(apiFetch('/productos', { method: 'POST' }), /Rechazado/);
  assert.equal(changes.length, 1);
  status = 204;
  await apiFetch('/productos/p', { method: 'DELETE' });
  assert.equal(changes.at(-1), '/productos/p');
});

function liveFixture() {
  const window = new EventTarget();
  window.location = { hash: '#/inventario' };
  const document = new EventTarget();
  document.visibilityState = 'visible';
  let modal = false;
  document.querySelector = () => modal;
  const context = { window, document, CustomEvent, setTimeout, clearTimeout, console };
  const api = vm.runInNewContext(`${read('utils/live-data.js').replace(/export function/g, 'function')}\n({watchDataChanges, notifyDataChange})`, context);
  const owner = { isConnected: true };
  const changed = (scope) => window.dispatchEvent(new CustomEvent('erp:data-changed', { detail: { scope, remote: true } }));
  return { ...api, window, document, owner, changed, setModal(value) { modal = value; } };
}

test('suscripción agrupa cambios y consulta solo dominios relacionados', async () => {
  const f = liveFixture();
  let calls = 0;
  const stop = f.watchDataChanges(f.owner, ['productos'], async () => calls++);
  f.changed('clientes');
  f.changed('productos'); f.changed('productos'); f.changed('productos');
  await sleep(140);
  assert.equal(calls, 1);
  f.window.location.hash = '#/inventario';
  f.notifyDataChange('/productos'); // La propia pantalla ya realiza su actualización al guardar.
  await sleep(140);
  assert.equal(calls, 1);
  stop();
});

test('una suscripción por módulo y limpieza al navegar evitan consultas duplicadas', async () => {
  const f = liveFixture();
  let old = 0, current = 0;
  f.watchDataChanges(f.owner, ['productos'], async () => old++);
  f.watchDataChanges(f.owner, ['productos'], async () => current++);
  f.changed('productos');
  await sleep(140);
  assert.equal(old, 0); assert.equal(current, 1);
  f.window.location.hash = '#/clientes';
  f.window.dispatchEvent(new Event('hashchange'));
  f.changed('productos');
  await sleep(140);
  assert.equal(current, 1);
});

test('actualización espera a cerrar el modal y a recuperar visibilidad', async () => {
  const f = liveFixture();
  let calls = 0;
  const stop = f.watchDataChanges(f.owner, ['ventas'], async () => calls++);
  f.setModal(true); f.changed('ventas');
  await sleep(140); assert.equal(calls, 0);
  f.setModal(false); f.document.dispatchEvent(new Event('hidden.bs.modal'));
  await sleep(140); assert.equal(calls, 1);
  f.document.visibilityState = 'hidden'; f.changed('ventas');
  await sleep(140); assert.equal(calls, 1);
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange'));
  await sleep(140); assert.equal(calls, 2);
  stop();
});

import { test } from 'node:test';
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');
import vm = require('node:vm');
import runtime = require('../utils/runtime-paths');
const { FRONTEND_ROOT } = runtime;
import type { SessionUser, UserDTO } from '../../shared/contracts';

interface AuthModule {
  login(email: string, password: string): Promise<UserDTO>;
  logout(): Promise<void>;
  getUsuario(): SessionUser | null;
}
function authFixture(response: unknown) {
  const store = new Map<string, string>();
  const window = { location: { hash: '#/pos' } };
  const source = fs.readFileSync(path.join(FRONTEND_ROOT, 'assets/js/auth.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export (async )?function/g, '$1function');
  // Frontera VM para probar el JavaScript emitido, sin evaluar fuentes TypeScript.
  const auth = vm.runInNewContext(`${source}\n({login,logout,getUsuario})`, {
    window,
    localStorage: { getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) },
    apiFetch: async () => response
  }) as AuthModule;
  return { auth, store, window };
}
const user: UserDTO = { id: 'fixture', nombre: 'Prueba', rol: 'cajero', sedeId: 'sede', email: 'test@example.invalid', sedeNombre: 'Prueba' };
test('autenticación conserva usuario y limpia la sesión al salir', async () => {
  const f = authFixture({ token: 'fixture-token', usuario: user });
  assert.deepEqual(await f.auth.login(user.email, 'fixture'), user);
  assert.equal(f.store.get('token'), 'fixture-token');
  assert.equal(JSON.stringify(f.auth.getUsuario()), JSON.stringify(user));
  await f.auth.logout();
  assert.equal(f.auth.getUsuario(), null);
  assert.equal(f.store.has('token'), false);
  assert.equal(f.window.location.hash, '#/login');
});
test('respuesta de login inválida no guarda token ni usuario', async () => {
  for (const response of [null, { token: 123, usuario: user }, { token: 'token', usuario: { ...user, rol: 'inventado' } }]) {
    const f = authFixture(response);
    await assert.rejects(f.auth.login(user.email, 'fixture'));
    assert.equal(f.store.size, 0);
  }
});
test('usuario almacenado corrupto se puede recuperar mostrando login', () => {
  const f = authFixture(null);
  for (const raw of ['{', 'null', '42', '{"rol":"superadmin"}', JSON.stringify({ ...user, email: 123 })]) {
    f.store.set('usuario', raw);
    assert.equal(f.auth.getUsuario(), null);
  }
});

test('401 del login conserva sesión y 401 de otra petición la revoca', async () => {
  const store = new Map([['token', 'fixture'], ['usuario', JSON.stringify(user)]]);
  const window = { location: { hash: '#/pos' } };
  const source = fs.readFileSync(path.join(FRONTEND_ROOT, 'assets/js/api.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export (async )?function/g, '$1function');
  const apiFetch = vm.runInNewContext(`${source}\napiFetch`, {
    Headers, FormData, window, console: { error() {} },
    localStorage: { getItem: (key: string) => store.get(key), removeItem: (key: string) => store.delete(key) },
    fetch: async () => ({ status: 401, ok: false, json: async () => ({ error: 'No autorizado' }) })
  }) as (endpoint: string) => Promise<unknown>;
  await assert.rejects(apiFetch('/auth/login'), /No autorizado/);
  assert.equal(store.has('token'), true);
  assert.equal(window.location.hash, '#/pos');
  await assert.rejects(apiFetch('/productos'), /No autorizado/);
  assert.equal(store.has('token'), false);
  assert.equal(store.has('usuario'), false);
  assert.equal(window.location.hash, '#/login');
});

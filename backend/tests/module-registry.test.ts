import { test } from 'node:test';
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');
import runtime = require('../utils/runtime-paths');
interface Lifecycle { init(container: unknown, hash: string): void | Promise<void>; destroy?: () => void; }
interface RegistryAPI { validateModule(namespace: unknown, entry: string, cleanup?: string): Lifecycle; moduleRegistry: Record<string, unknown>; }
async function registry(): Promise<RegistryAPI> {
  const source = fs.readFileSync(path.join(runtime.FRONTEND_ROOT, 'assets/js/utils/module-registry.js'), 'utf8');
  // Los imports dinámicos solo se ejecutan al cargar un módulo; aquí se prueba su frontera.
  return await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`) as RegistryAPI;
}
test('registro rechaza exports ausentes o limpieza no ejecutable', async () => {
  const r = await registry();
  for (const value of [null, 'módulo', {}, { init: 42 }]) assert.throws(() => r.validateModule(value, 'init'), /módulo/);
  assert.throws(() => r.validateModule({ init() {}, destroy: false }, 'init', 'destroy'), /destroy/);
});
test('registro conserva entrada y limpieza correctas para módulos existentes', async () => {
  const r = await registry();
  let mounted = 0, disposed = 0;
  const module = r.validateModule({ init() { mounted++; }, destroy() { disposed++; } }, 'init', 'destroy');
  await module.init({}, '#/pos');
  module.destroy?.();
  assert.equal(mounted, 1);
  assert.equal(disposed, 1);
  assert.equal(Object.keys(r.moduleRegistry).length, 20);
  assert.equal(Object.hasOwn(r.moduleRegistry, '#/pos'), true);
});

import { test } from 'node:test';
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');
import vm = require('node:vm');
import runtime = require('../utils/runtime-paths');

type Debounced = ((...args: unknown[]) => void) & { flush(): void; cancel(): void };
const source = fs.readFileSync(path.join(runtime.FRONTEND_ROOT, 'assets/js/utils/debounce.js'), 'utf8').replace(/export function/g, 'function');
const { debounce } = vm.runInNewContext(`${source}\n({ debounce })`, { setTimeout, clearTimeout }) as { debounce(fn: (...a: unknown[]) => unknown, ms?: number): Debounced };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('debounce ejecuta una sola vez con los últimos argumentos al dejar de escribir', async () => {
  const calls: unknown[][] = [];
  const fn = debounce((...args) => { calls.push(args); }, 40);
  fn('c'); fn('ca'); fn('cab');
  assert.equal(calls.length, 0);
  await sleep(70);
  assert.deepEqual(calls.map(c => [...c]), [['cab']]);
});

test('flush ejecuta de inmediato lo pendiente y cancel lo descarta', async () => {
  const calls: unknown[] = [];
  const fn = debounce((v) => { calls.push(v); }, 40);
  fn('enter');
  fn.flush();
  assert.deepEqual(calls, ['enter']);
  fn.flush(); // sin pendiente: no repite
  fn('descartado');
  fn.cancel();
  await sleep(70);
  assert.deepEqual(calls, ['enter']);
});

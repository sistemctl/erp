import { test } from 'node:test';
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');
import vm = require('node:vm');
import { EventEmitter } from 'node:events';
import jwt = require('jsonwebtoken');
import type { Request, Response } from 'express';
import runtime = require('../utils/runtime-paths');
import { difundirCambios, streamEventos, conexionesActivas } from '../utils/eventos';
import { denyToken } from '../utils/token-denylist';

function fakeRes() {
  const res = new EventEmitter() as EventEmitter & { statusCode: number; escrito: string[]; headers: Record<string, string>; terminado: boolean; [k: string]: unknown };
  res.statusCode = 200; res.escrito = []; res.headers = {}; res.terminado = false;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.set = (h: Record<string, string>) => { Object.assign(res.headers, h); return res; };
  res.json = () => res;
  res.flushHeaders = () => {};
  res.write = (texto: string) => { res.escrito.push(texto); return true; };
  res.end = () => { res.terminado = true; };
  return res;
}
const socket = { setKeepAlive() {}, setNoDelay() {}, setTimeout() {} };

function conectar(userId: string, token: string) {
  const req = Object.assign(new EventEmitter(), { usuario: { userId }, token, socket });
  const res = fakeRes();
  streamEventos(req as unknown as Request, res as unknown as Response, () => {});
  return { req, res };
}

function escribir(method: string, ruta: string, status: number, cliente?: string) {
  const res = fakeRes();
  const req = { method, path: ruta, get: (h: string) => (h.toLowerCase() === 'x-client-id' ? cliente : undefined) };
  let siguio = false;
  difundirCambios(req as unknown as Request, res as unknown as Response, () => { siguio = true; });
  assert.equal(siguio, true);
  res.statusCode = status;
  res.emit('finish');
}

test('escrituras exitosas avisan el área a todos los conectados; lecturas, errores y login no', () => {
  const token = jwt.sign({ userId: 'u1' }, 'secreto-de-prueba', { expiresIn: '1h' });
  const a = conectar('u1', token);
  const b = conectar('u2', token);
  assert.match(a.res.escrito[0], /^event: hola\ndata: \{"version":/);
  assert.equal(a.res.headers['Content-Type'], 'text/event-stream; charset=utf-8');

  escribir('PUT', '/productos/abc', 200, 'navegador-123');
  escribir('GET', '/productos', 200);
  escribir('POST', '/ventas', 400);
  escribir('POST', '/auth/login', 200);
  escribir('POST', '/gemini/chat', 200);
  escribir('POST', '/config/restore', 200);
  const avisos = b.res.escrito.slice(1);
  assert.deepEqual(avisos, [
    'event: cambio\ndata: {"scope":"productos","origen":"navegador-123"}\n\n',
    'event: cambio\ndata: {"scope":"*","origen":null}\n\n'
  ]);

  a.req.emit('close'); b.req.emit('close');
  assert.equal(conexionesActivas(), 0);
});

test('sesión cerrada no recibe avisos y un usuario no abre conexiones sin límite', () => {
  const token = jwt.sign({ userId: 'u3' }, 'secreto-de-prueba', { expiresIn: '1h' });
  const abiertas = Array.from({ length: 20 }, () => conectar('u3', token));
  const extra = conectar('u3', token);
  assert.equal(extra.res.statusCode, 429);
  denyToken(token);
  for (const c of abiertas) c.req.emit('close');
  assert.equal(conexionesActivas(), 0);
});

test('navegador: un cambio avisa también las áreas que dependen de él y el módulo sabe cuáles', async () => {
  const source = fs.readFileSync(path.join(runtime.FRONTEND_ROOT, 'assets/js/utils/live-data.js'), 'utf8').replace(/export function/g, 'function');
  const window = new EventTarget() as EventTarget & { location: { hash: string } };
  window.location = { hash: '#/pos' };
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible', querySelector: () => null });
  const api = vm.runInNewContext(`${source}\n({watchDataChanges, receiveServerChange, expandScopes})`, { window, document, CustomEvent, setTimeout, clearTimeout, console }) as {
    watchDataChanges(owner: object, scopes: string[], refresh: (changed: ReadonlySet<string>) => void): () => void;
    receiveServerChange(scope: string): void;
    expandScopes(scope: string): string[];
  };
  assert.deepEqual([...api.expandScopes('compras').slice(0, 3)], ['compras', 'productos', 'inventario']);
  const recibidos: string[][] = [];
  const stop = api.watchDataChanges({ isConnected: true }, ['productos', 'inventario', 'config'], changed => { recibidos.push([...changed].sort()); });
  api.receiveServerChange('compras');
  await new Promise(resolve => setTimeout(resolve, 140));
  assert.deepEqual(recibidos, [['inventario', 'productos']]);
  api.receiveServerChange('config');
  await new Promise(resolve => setTimeout(resolve, 140));
  assert.deepEqual(recibidos.at(-1), ['config']);
  stop();
});

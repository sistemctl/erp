import fs = require('fs');
import path = require('path');
import jwt = require('jsonwebtoken');
import type { RequestHandler, Response } from 'express';
import { isDenied } from './token-denylist';
import runtimePaths = require('./runtime-paths');

/**
 * Avisos en tiempo real (Server-Sent Events). Tras cada escritura exitosa en /api se avisa
 * a todos los navegadores conectados qué área cambió (solo el nombre, nunca datos); cada
 * pantalla vuelve a consultar lo que necesita con sus propios permisos.
 */
interface Conexion { res: Response; token: string; expira: number; usuarioId: string; }

const conexiones = new Set<Conexion>();
const MAX_TOTAL = 2000;
const MAX_POR_USUARIO = 20;
const LATIDO_MS = 25_000;
// Rutas que no modifican datos del negocio.
const SIN_AVISO = new Set(['auth', 'public', 'eventos', 'gemini']);
const SCOPE = /^[a-z][a-z-]{0,39}$/;
const CLIENTE = /^[\w-]{8,64}$/;

/** Versión de los archivos del frontend servidos ahora (la misma que ASSET_V del navegador). */
export function versionFrontend(): string | null {
  try {
    const html = fs.readFileSync(path.join(runtimePaths.FRONTEND_ROOT, 'index.html'), 'utf8');
    return /app\.js\?v=([\w.-]+)/.exec(html)?.[1] ?? null;
  } catch { return null; }
}

function enviar(conexion: Conexion, texto: string) {
  try { conexion.res.write(texto); } catch { cerrar(conexion); }
}

function cerrar(conexion: Conexion) {
  conexiones.delete(conexion);
  try { conexion.res.end(); } catch { /* ya cerrada */ }
}

export function emitirCambio(scope: string, origen: string | null): void {
  if (!conexiones.size) return;
  const texto = `event: cambio\ndata: ${JSON.stringify({ scope, origen })}\n\n`;
  for (const conexion of conexiones) enviar(conexion, texto);
}

export function conexionesActivas(): number {
  return conexiones.size;
}

/** Montar en /api antes de las rutas: avisa tras respuestas 2xx de POST/PUT/PATCH/DELETE. */
export const difundirCambios: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const segmentos = req.path.split('/').filter(Boolean);
  const scope = segmentos[0] || '';
  if (!SCOPE.test(scope) || SIN_AVISO.has(scope)) return next();
  // Restaurar un respaldo cambia todo: las pantallas recargan todas sus áreas.
  const area = scope === 'config' && segmentos[1] === 'restore' ? '*' : scope;
  const cliente = String(req.get('x-client-id') || '');
  const origen = CLIENTE.test(cliente) ? cliente : null;
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) emitirCambio(area, origen);
  });
  next();
};

/** GET /api/eventos (requiere authMiddleware). */
export const streamEventos: RequestHandler = (req, res) => {
  const usuarioId = req.usuario?.userId;
  const token = req.token;
  if (!usuarioId || !token) return void res.status(401).json({ error: 'No autenticado.' });
  let delUsuario = 0;
  for (const conexion of conexiones) if (conexion.usuarioId === usuarioId) delUsuario++;
  if (conexiones.size >= MAX_TOTAL || delUsuario >= MAX_POR_USUARIO) {
    return void res.status(429).json({ error: 'Demasiadas conexiones de avisos abiertas.' });
  }
  const decoded = jwt.decode(token);
  const exp = decoded && typeof decoded === 'object' && typeof decoded.exp === 'number' ? decoded.exp * 1000 : Date.now() + 8 * 3600_000;

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no' // Nginx: no retener los mensajes
  });
  res.flushHeaders();
  req.socket.setKeepAlive(true);
  req.socket.setNoDelay(true);
  req.socket.setTimeout(0);

  const conexion: Conexion = { res, token, expira: exp, usuarioId };
  conexiones.add(conexion);
  enviar(conexion, `event: hola\ndata: ${JSON.stringify({ version: versionFrontend() })}\n\n`);
  req.on('close', () => { conexiones.delete(conexion); });
};

// Latido: mantiene viva la conexión a través de proxies y corta sesiones cerradas o vencidas.
setInterval(() => {
  const ahora = Date.now();
  for (const conexion of conexiones) {
    if (ahora >= conexion.expira || isDenied(conexion.token)) cerrar(conexion);
    else enviar(conexion, `: latido\n\n`);
  }
}, LATIDO_MS).unref?.();

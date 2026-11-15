import { erpClientId } from '../api.js';
import { receiveServerChange } from './live-data.js';
import { ASSET_V } from './module-registry.js';

/**
 * Avisos del servidor en tiempo real (`/api/eventos`, text/event-stream).
 * Una sola pestaña por navegador mantiene la conexión (Web Locks) y reparte los avisos
 * a las demás por BroadcastChannel: los navegadores limitan las conexiones por host.
 */
const LOCK = 'erp-eventos-servidor';
const CANAL = 'erp-eventos-servidor';
const SIN_DATOS_MS = 70_000; // el servidor envía un latido cada 25 s

type MensajeCanal = { tipo: 'version'; version: string } | { tipo: 'reconectado' };

let iniciado = false;
let activo = false;
let controller: AbortController | null = null;
let liberarLock: (() => void) | null = null;
let despertar: (() => void) | null = null;
let canal: BroadcastChannel | null = null;

try {
  if (typeof BroadcastChannel !== 'undefined') {
    canal = new BroadcastChannel(CANAL);
    canal.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (typeof data !== 'object' || data === null || !('tipo' in data)) return;
      if (data.tipo === 'reconectado') window.dispatchEvent(new Event('erp:retry-read'));
      if (data.tipo === 'version' && 'version' in data && typeof data.version === 'string') revisarVersion(data.version);
    });
  }
} catch { /* sin canal: cada pestaña se conecta por su cuenta */ }

function publicar(mensaje: MensajeCanal) {
  try { canal?.postMessage(mensaje); } catch { /* canal opcional */ }
}

function revisarVersion(version: string) {
  if (!version || version === ASSET_V || document.getElementById('erp-version-nueva')) return;
  const aviso = document.createElement('div');
  aviso.id = 'erp-version-nueva';
  aviso.className = 'alert alert-info shadow d-flex align-items-center gap-3 mb-0';
  aviso.setAttribute('role', 'status');
  aviso.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2000;max-width:calc(100% - 32px);';
  const texto = document.createElement('span');
  texto.textContent = 'Hay una versión nueva del sistema.';
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn-primary btn-sm';
  boton.textContent = 'Recargar';
  boton.addEventListener('click', () => window.location.reload());
  aviso.append(texto, boton);
  document.body.append(aviso);
}

function esperar(ms: number) {
  return new Promise<void>(resolve => {
    const fin = () => { clearTimeout(timer); window.removeEventListener('online', fin); despertar = null; resolve(); };
    const timer = setTimeout(fin, ms);
    window.addEventListener('online', fin);
    despertar = fin;
  });
}

async function leer(body: ReadableStream<Uint8Array>, alEvento: (evento: string, data: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let vigilante = setTimeout(() => controller?.abort(), SIN_DATOS_MS);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      clearTimeout(vigilante);
      vigilante = setTimeout(() => controller?.abort(), SIN_DATOS_MS);
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let corte: number;
      while ((corte = buffer.indexOf('\n\n')) >= 0) {
        const bloque = buffer.slice(0, corte);
        buffer = buffer.slice(corte + 2);
        let evento = 'message';
        const datos: string[] = [];
        for (const linea of bloque.split('\n')) {
          if (linea.startsWith('event:')) evento = linea.slice(6).trim();
          else if (linea.startsWith('data:')) datos.push(linea.slice(5).trimStart());
        }
        if (datos.length) alEvento(evento, datos.join('\n'));
      }
    }
  } finally {
    clearTimeout(vigilante);
    reader.cancel().catch(() => {});
  }
}

function alEvento(evento: string, data: string, reconexion: boolean) {
  let payload: unknown;
  try { payload = JSON.parse(data); } catch { return; }
  if (typeof payload !== 'object' || payload === null) return;
  if (evento === 'hola') {
    if ('version' in payload && typeof payload.version === 'string') {
      revisarVersion(payload.version);
      publicar({ tipo: 'version', version: payload.version });
    }
    if (reconexion) {
      // Pudieron perderse avisos mientras no había conexión: actualizar todo.
      window.dispatchEvent(new Event('erp:retry-read'));
      publicar({ tipo: 'reconectado' });
    }
    return;
  }
  if (evento === 'cambio' && 'scope' in payload && typeof payload.scope === 'string') {
    if ('origen' in payload && payload.origen === erpClientId()) return; // ya avisado localmente
    if (payload.scope === '*') {
      window.dispatchEvent(new Event('erp:retry-read'));
      publicar({ tipo: 'reconectado' });
    } else {
      receiveServerChange(payload.scope);
    }
  }
}

async function conectar() {
  let intentos = 0;
  let conectadoAntes = false;
  while (activo) {
    const token = localStorage.getItem('token');
    if (!token) break;
    controller = new AbortController();
    try {
      const response = await fetch('/api/eventos', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', 'X-Client-Id': erpClientId() },
        cache: 'no-store',
        signal: controller.signal
      });
      if (response.status === 401 || response.status === 403) break; // sesión vencida: la API lleva al login
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reconexion = conectadoAntes;
      conectadoAntes = true;
      intentos = 0;
      await leer(response.body, (evento, data) => alEvento(evento, data, reconexion));
    } catch { /* red caída, servidor reiniciado o conexión inactiva: reintentar */ }
    if (!activo) break;
    intentos++;
    await esperar(Math.min(30_000, 1000 * 2 ** Math.min(intentos, 5)) + Math.random() * 1000);
  }
  detener();
}

/** Inicia la escucha si hay sesión. Idempotente: se llama en cada navegación. */
export function startServerEvents(): void {
  if (iniciado || !localStorage.getItem('token') || typeof fetch === 'undefined') return;
  iniciado = true;
  activo = true;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    // Espera su turno: si la pestaña que conecta se cierra, otra toma el relevo.
    locks.request(LOCK, () => new Promise<void>(resolve => {
      if (!activo) { resolve(); return; }
      liberarLock = resolve;
      void conectar();
    })).catch(() => { if (activo) void conectar(); });
  } else {
    void conectar();
  }
}

export function stopServerEvents(): void {
  activo = false;
  controller?.abort();
  despertar?.();
  detener();
}

function detener() {
  activo = false;
  iniciado = false;
  controller = null;
  liberarLock?.();
  liberarLock = null;
}

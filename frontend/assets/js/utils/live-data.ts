import type { DataChangeDetail } from '../../../../shared/contracts';
const EVENT = 'erp:data-changed';
const CHANNEL = 'erp-data-changes';
const route = () => window.location.hash.split('?')[0];
let channel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (isDataChange(event.data)) window.dispatchEvent(new CustomEvent(EVENT, { detail: event.data }));
    });
  }
} catch { /* La actualización al volver a la pestaña sigue disponible. */ }

/**
 * Áreas que cambian como efecto de guardar en otra. Única tabla de relaciones:
 * los módulos declaran lo que muestran y no necesitan conocer qué endpoint lo altera.
 */
const DEPENDENCIAS: Record<string, readonly string[]> = {
  productos: ['inventario'],
  inventario: ['productos'],
  series: ['inventario', 'productos'],
  compras: ['productos', 'inventario', 'series', 'proveedores', 'caja'],
  ventas: ['productos', 'inventario', 'series', 'caja', 'cartera', 'facturas', 'clientes'],
  cotizaciones: ['ventas', 'productos', 'inventario', 'caja'],
  reparaciones: ['productos', 'inventario', 'caja', 'cartera', 'facturas'],
  instalaciones: ['productos', 'inventario', 'series', 'caja', 'cartera', 'facturas'],
  rma: ['series', 'inventario', 'productos'],
  'trade-in': ['productos', 'inventario', 'series', 'caja'],
  cartera: ['caja', 'clientes', 'ventas'],
  facturas: ['ventas', 'cartera'],
  proveedores: ['compras'],
  empleados: ['nomina'],
  nomina: ['caja']
};

export function expandScopes(scope: string): string[] {
  return [scope, ...(DEPENDENCIAS[scope] || [])];
}

function isDataChange(value: unknown): value is DataChangeDetail {
  return typeof value === 'object' && value !== null
    && 'scope' in value && typeof value.scope === 'string'
    && 'sourceRoute' in value && typeof value.sourceRoute === 'string'
    && 'remote' in value && typeof value.remote === 'boolean';
}

function emitScopes(scopes: readonly string[], sourceRoute: string, local: boolean): void {
  for (const scope of scopes) {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { scope, sourceRoute, remote: !local } }));
    try { channel?.postMessage({ scope, sourceRoute, remote: true }); } catch { /* Canal opcional. */ }
  }
}

export function notifyDataChange(endpoint: string): void {
  const scope = endpoint.split('?')[0].split('/').filter(Boolean)[0];
  if (!scope || ['auth', 'public'].includes(scope)) return;
  emitScopes(expandScopes(scope), route(), true);
}

/** Cambio hecho por otro usuario o equipo, recibido del servidor. */
export function receiveServerChange(scope: string): void {
  emitScopes(expandScopes(scope), '', false);
}

// Actualiza datos, no reinicia módulos ni toca formularios. Una suscripción por propietario.
const subscriptions = new WeakMap<Element, () => void>();
export function syncSelectOptions<T extends { id: string; nombre?: string }>(select: HTMLSelectElement | null, items: readonly T[], label: (item: T) => string = item => item.nombre || ''): void {
  if (!select) return;
  const current = select.value;
  const placeholder = select.querySelector('option[value=""]')?.cloneNode(true);
  select.replaceChildren(...(placeholder ? [placeholder] : []), ...items.map(item => new Option(label(item), item.id)));
  select.value = current;
}

/**
 * `refresh` recibe las áreas que cambiaron desde la última actualización. Al volver a la
 * pestaña, reintentar o reconectar con el servidor se informan todas las áreas vigiladas.
 */
export function watchDataChanges(owner: Element, scopes: readonly string[], refresh: (changed: ReadonlySet<string>) => unknown | Promise<unknown>, { allowDuringModal = false }: { allowDuringModal?: boolean } = {}): () => void {
  subscriptions.get(owner)?.();
  const initialRoute = route();
  let stopped = false, running = false;
  const pendingScopes = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const active = () => !stopped && route() === initialRoute && owner.isConnected;
  const run = async () => {
    if (!active() || document.visibilityState === 'hidden') return;
    if (!allowDuringModal && document.querySelector('.modal.show')) return;
    if (running || !pendingScopes.size) return;
    const changed = new Set(pendingScopes);
    pendingScopes.clear();
    running = true;
    try { await refresh(changed); }
    catch (error) { if (active()) console.warn('No se pudieron actualizar los datos del módulo:', error instanceof Error ? error.message : String(error)); }
    finally {
      running = false;
      if (pendingScopes.size && active()) schedule();
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 80); };
  const request = (list: readonly string[] = scopes) => { for (const scope of list) pendingScopes.add(scope); schedule(); };
  const requestAll = () => request();
  const changed = ({ detail }: CustomEvent<DataChangeDetail>) => {
    if (scopes.includes(detail?.scope) && (detail.remote || detail.sourceRoute !== initialRoute)) request([detail.scope]);
  };
  const visible = () => { if (document.visibilityState !== 'hidden') request(); };
  const modalHidden = () => { if (pendingScopes.size) schedule(); };
  const dispose = () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener(EVENT, changed as EventListener);
    window.removeEventListener('focus', visible);
    window.removeEventListener('erp:retry-read', requestAll);
    window.removeEventListener('hashchange', dispose);
    document.removeEventListener('visibilitychange', visible);
    document.removeEventListener('hidden.bs.modal', modalHidden);
    if (subscriptions.get(owner) === dispose) subscriptions.delete(owner);
  };
  window.addEventListener(EVENT, changed as EventListener);
  window.addEventListener('focus', visible);
  window.addEventListener('erp:retry-read', requestAll);
  window.addEventListener('hashchange', dispose);
  document.addEventListener('visibilitychange', visible);
  document.addEventListener('hidden.bs.modal', modalHidden);
  subscriptions.set(owner, dispose);
  return dispose;
}

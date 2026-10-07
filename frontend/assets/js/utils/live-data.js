const EVENT = 'erp:data-changed';
const CHANNEL = 'erp-data-changes';
const route = () => window.location.hash.split('?')[0];
let channel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', ({ data }) => {
      if (typeof data?.scope === 'string') window.dispatchEvent(new CustomEvent(EVENT, { detail: data }));
    });
  }
} catch { /* La actualización al volver a la pestaña sigue disponible. */ }

export function notifyDataChange(endpoint) {
  const scope = endpoint.split('?')[0].split('/').filter(Boolean)[0];
  if (!scope || ['auth', 'public'].includes(scope)) return;
  const detail = { scope, sourceRoute: route(), remote: false };
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  try { channel?.postMessage({ ...detail, remote: true }); } catch { /* Canal opcional. */ }
}

// Actualiza datos, no reinicia módulos ni toca formularios. Una suscripción por propietario.
const subscriptions = new WeakMap();
export function syncSelectOptions(select, items, label = item => item.nombre || '') {
  if (!select) return;
  const current = select.value;
  const placeholder = select.querySelector('option[value=""]')?.cloneNode(true);
  select.replaceChildren(...(placeholder ? [placeholder] : []), ...items.map(item => new Option(label(item), item.id)));
  select.value = current;
}

export function watchDataChanges(owner, scopes, refresh, { allowDuringModal = false } = {}) {
  subscriptions.get(owner)?.();
  const initialRoute = route();
  let stopped = false, pending = false, running = false, timer;
  const active = () => !stopped && route() === initialRoute && owner.isConnected;
  const run = async () => {
    if (!active() || document.visibilityState === 'hidden') return;
    if (!allowDuringModal && document.querySelector('.modal.show')) return;
    if (running || !pending) return;
    pending = false;
    running = true;
    try { await refresh(); }
    catch (error) { if (active()) console.warn('No se pudieron actualizar los datos del módulo:', error.message); }
    finally {
      running = false;
      if (pending && active()) schedule();
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 80); };
  const request = () => { pending = true; schedule(); };
  const changed = ({ detail }) => {
    if (scopes.includes(detail?.scope) && (detail.remote || detail.sourceRoute !== initialRoute)) request();
  };
  const visible = () => { if (document.visibilityState !== 'hidden') request(); };
  const modalHidden = () => { if (pending) schedule(); };
  const dispose = () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener(EVENT, changed);
    window.removeEventListener('focus', visible);
    window.removeEventListener('hashchange', dispose);
    document.removeEventListener('visibilitychange', visible);
    document.removeEventListener('hidden.bs.modal', modalHidden);
    if (subscriptions.get(owner) === dispose) subscriptions.delete(owner);
  };
  window.addEventListener(EVENT, changed);
  window.addEventListener('focus', visible);
  window.addEventListener('hashchange', dispose);
  document.addEventListener('visibilitychange', visible);
  document.addEventListener('hidden.bs.modal', modalHidden);
  subscriptions.set(owner, dispose);
  return dispose;
}

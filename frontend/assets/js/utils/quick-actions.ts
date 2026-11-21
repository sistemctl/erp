import type { QuickAction, QuickActionDetail, QuickActionId, Role } from '../../../../shared/contracts';
const listeners = new WeakMap<Element, () => void>();
const operatorRoles: readonly Role[] = ['admin', 'superadmin', 'gerente_sede', 'cajero'];

export function quickActionsForRole(role: Role): QuickAction[] {
  if (!operatorRoles.includes(role)) return [];
  return [
    { id: 'venta', route: '#/pos', label: 'Nueva venta', description: 'Abrir el punto de venta', icon: 'ti-shopping-cart-plus' },
    { id: 'egreso', route: '#/caja', label: 'Registrar gasto', description: 'Registrar una salida de caja', icon: 'ti-cash' },
    { id: 'abono', route: '#/cartera', label: 'Recibir abono', description: 'Buscar un cliente o una factura', icon: 'ti-wallet' }
  ];
}

// Cada módulo recibe la acción cuando sus datos y formularios están listos.
export function bindQuickAction(owner: Element, action: QuickActionId, handler: () => void): void {
  listeners.get(owner)?.();
  const route = window.location.hash.split('?')[0];
  const invoke = () => {
    if (owner.isConnected && window.location.hash.split('?')[0] === route) handler();
  };
  const listener = (event: CustomEvent<QuickActionDetail>) => { if (event.detail?.action === action) invoke(); };
  const dispose = () => {
    window.removeEventListener('erp:quick-action', listener);
    window.removeEventListener('hashchange', dispose);
    if (listeners.get(owner) === dispose) listeners.delete(owner);
  };
  listeners.set(owner, dispose);
  window.addEventListener('erp:quick-action', listener);
  window.addEventListener('hashchange', dispose);
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (params.get('accion') === action) {
    params.delete('accion');
    const hash = route + (params.size ? `?${params}` : '');
    history.replaceState(history.state, '', window.location.pathname + window.location.search + hash);
    invoke();
  }
}

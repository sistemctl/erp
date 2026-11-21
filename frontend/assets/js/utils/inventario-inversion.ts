import type { InversionInventarioDTO, SedeDTO, SessionUser, DataChangeDetail } from '../../../../shared/contracts.js';
import { apiRequired } from './api-required.js';
import { watchDataChanges } from './live-data.js';
import { requireElement } from './dom.js';
import { errorMessage } from './errors.js';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char] || char));
/** Keep decimal text exact even above Number.MAX_SAFE_INTEGER. */
export function formatInversionMoney(value: string): string {
  const [integer, fraction = '00'] = value.split('.');
  return `${value.startsWith('-') ? '-' : ''}$ ${new Intl.NumberFormat('es-CO').format(BigInt(integer.replace(/^-/, '')))},${fraction.padEnd(2, '0')}`;
}
export function inversionPanelHtml(sedes: readonly SedeDTO[], usuario: SessionUser): string {
  const global = ['superadmin', 'admin'].includes(usuario.rol);
  const permitted = global ? sedes : sedes.filter(sede => sede.id === usuario.sedeId);
  return `<div class="tab-pane" id="tab-inventario-inversion" role="tabpanel" aria-labelledby="inv-inversion-tab">
    <section class="inv-investment" aria-label="Inventario al costo registrado">
      <div class="inv-investment-toolbar">
        <div><h2 class="h3 mb-1">Inversión en inventario</h2><p class="text-secondary mb-0">Existencias actuales × costo unitario registrado</p></div>
        <div class="inv-investment-scope"><label class="form-label" for="inv-inversion-sede">Sede</label>
          <select id="inv-inversion-sede" class="form-select" ${global ? '' : 'disabled'}>
            ${global ? '<option value="">Todas las sedes</option>' : ''}
            ${permitted.map(sede => `<option value="${escapeHtml(sede.id)}">${escapeHtml(sede.nombre)}</option>`).join('')}
          </select></div>
      </div>
      <div id="inv-inversion-state" role="status" aria-live="polite"></div>
      <button id="inv-inversion-retry" type="button" class="btn btn-outline-primary mb-3" hidden>Reintentar</button>
      <div id="inv-inversion-content" hidden>
        <div class="inv-investment-summary">
          <div class="card inv-investment-main"><div class="card-body"><div class="text-secondary">Inversión en inventario</div><strong id="inv-inversion-total" class="inv-investment-total"></strong><div id="inv-inversion-alcance" class="text-secondary mt-2"></div></div></div>
          <div class="card"><div class="card-body"><div class="text-secondary">Productos con existencias</div><strong id="inv-inversion-products" class="inv-investment-count"></strong></div></div>
          <div class="card"><div class="card-body"><div class="text-secondary">Productos sin costo registrado</div><strong id="inv-inversion-no-cost-count" class="inv-investment-count"></strong></div></div>
        </div>
        <p id="inv-inversion-warning" class="alert alert-warning mt-3" hidden>Hay productos con costo registrado en $0. Aportan $0 al total y el importe puede estar incompleto.</p>
        <p class="text-secondary mt-3 mb-3">Inventario al costo registrado. Incluye productos inactivos con existencias; excluye servicios y combos virtuales. No representa compras históricas.</p>
        <section id="inv-inversion-sedes-section" class="card mb-3" hidden><div class="card-body"><h3 class="h4">Inversión por sede</h3><ul id="inv-inversion-sedes" class="inv-investment-sites"></ul></div></section>
        <div class="card erp-table-panel"><div class="card-header"><h3 class="card-title">Detalle de existencias</h3></div>
          <div class="table-responsive"><table class="table table-vcenter card-table mb-0 inv-investment-table">
            <thead><tr><th>Producto</th><th>Código</th><th>Sede</th><th class="text-end">Cantidad</th><th class="text-end">Costo unitario</th><th class="text-end">Inversión</th></tr></thead><tbody id="inv-inversion-rows"></tbody>
          </table></div>
          <div id="inv-inversion-pagination" class="inv-investment-pagination" hidden>
            <button id="inv-inversion-prev" type="button" class="btn btn-outline-secondary" aria-label="Página anterior">Anterior</button><span id="inv-inversion-page-info" class="text-secondary"></span><button id="inv-inversion-next" type="button" class="btn btn-outline-secondary" aria-label="Página siguiente">Siguiente</button>
          </div>
        </div>
      </div>
    </section>
  </div>`;
}

export function mountInventarioInversion(container: HTMLElement, usuario: SessionUser): () => void {
  const pane = container.querySelector<HTMLElement>('#tab-inventario-inversion');
  if (!pane) return () => {};
  const tab = requireElement('inv-inversion-tab', HTMLAnchorElement);
  const select = requireElement('inv-inversion-sede', HTMLSelectElement);
  const state = requireElement('inv-inversion-state', HTMLElement);
  const content = requireElement('inv-inversion-content', HTMLElement);
  const retry = requireElement('inv-inversion-retry', HTMLButtonElement);
  const previous = requireElement('inv-inversion-prev', HTMLButtonElement);
  const next = requireElement('inv-inversion-next', HTMLButtonElement);
  const events = new AbortController();
  const options = { signal: events.signal };
  const route = window.location.hash.split('?')[0];
  const scopes = ['productos', 'inventario', 'series', 'compras', 'ventas', 'instalaciones', 'reparaciones', 'rma', 'trade-in'];
  let dirty = true, opened = false, disposed = false, page = 1, pages = 1, requestId = 0;
  const current = (id: number) => !disposed && pane.isConnected && id === requestId && window.location.hash.split('?')[0] === route;
  const render = (data: InversionInventarioDTO) => {
    const total = requireElement('inv-inversion-total', HTMLElement);
    total.textContent = formatInversionMoney(data.resumen.inversionTotal);
    total.dataset.long = String(total.textContent.length > 22);
    requireElement('inv-inversion-products', HTMLElement).textContent = String(data.resumen.productosConExistencias);
    requireElement('inv-inversion-no-cost-count', HTMLElement).textContent = String(data.resumen.productosSinCosto);
    requireElement('inv-inversion-warning', HTMLElement).hidden = data.resumen.productosSinCosto === 0;
    requireElement('inv-inversion-alcance', HTMLElement).textContent = `${data.alcance.nombre} · Consultado ${new Date(data.consultadoEn).toLocaleString('es-CO')}`;
    requireElement('inv-inversion-sedes-section', HTMLElement).hidden = data.alcance.sedeId !== null || data.sedes.length === 0;
    requireElement('inv-inversion-sedes', HTMLElement).innerHTML = data.sedes.map(sede => `<li><span>${escapeHtml(sede.nombre)}</span><strong>${formatInversionMoney(sede.inversionTotal)}</strong></li>`).join('');
    requireElement('inv-inversion-rows', HTMLTableSectionElement).innerHTML = data.items.length ? data.items.map(item => `<tr data-id="inversion-${escapeHtml(item.id)}">
      <td><strong>${escapeHtml(item.nombre)}</strong>${!item.activo ? ' <span class="badge bg-secondary-lt">Inactivo</span>' : ''}${item.sinCosto ? ' <span class="badge bg-warning-lt">Sin costo registrado</span>' : ''}</td><td>${escapeHtml(item.codigoBarras || '—')}</td><td>${escapeHtml(item.sedeNombre)}</td>
      <td class="text-end">${new Intl.NumberFormat('es-CO').format(item.cantidad)} ${escapeHtml(item.unidadMedida)}</td><td class="text-end">${formatInversionMoney(item.costoUnitario)}/${escapeHtml(item.unidadMedida)}</td><td class="text-end fw-bold">${formatInversionMoney(item.inversionTotal)}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="text-center text-secondary py-4">No hay mercancía con existencias en este alcance.</td></tr>';
    page = data.pagination.page; pages = data.pagination.totalPages;
    previous.disabled = page <= 1; next.disabled = page >= pages;
    requireElement('inv-inversion-pagination', HTMLElement).hidden = pages <= 1;
    requireElement('inv-inversion-page-info', HTMLElement).textContent = `Página ${page} de ${pages} · ${data.pagination.total} registros`;
  };
  const load = async () => {
    const id = ++requestId;
    dirty = false; content.hidden = true; retry.hidden = true; state.className = 'text-secondary mb-3';
    state.textContent = 'Calculando inversión…'; pane.setAttribute('aria-busy', 'true'); previous.disabled = true; next.disabled = true;
    const params = new URLSearchParams({ page: String(page) });
    if (select.value) params.set('sedeId', select.value);
    try {
      const data = await apiRequired<InversionInventarioDTO>(`/inventario/inversion?${params}`, { silent: true });
      if (!current(id)) return;
      render(data); content.hidden = false; state.textContent = '';
    } catch (error) {
      if (!current(id)) return;
      dirty = true; state.className = 'text-danger mb-3'; state.textContent = `No se pudo calcular la inversión. ${errorMessage(error)}`; retry.hidden = false;
    } finally { if (current(id)) pane.removeAttribute('aria-busy'); }
  };
  const refresh = () => { dirty = true; if (pane.classList.contains('active')) return load(); };
  tab.addEventListener('shown.bs.tab', () => {
    if (!opened) { opened = true; select.value = ['admin', 'superadmin'].includes(usuario.rol) ? requireElement('select-sede-inventario', HTMLSelectElement).value : usuario.sedeId || ''; }
    if (dirty) void load();
  }, options);
  tab.addEventListener('hidden.bs.tab', () => {
    if (pane.hasAttribute('aria-busy')) { requestId++; dirty = true; pane.removeAttribute('aria-busy'); }
  }, options);
  select.addEventListener('change', () => { page = 1; void load(); }, options);
  retry.addEventListener('click', () => void load(), options);
  previous.addEventListener('click', () => { if (page > 1) { page--; void load(); } }, options);
  next.addEventListener('click', () => { if (page < pages) { page++; void load(); } }, options);
  window.addEventListener('erp:data-changed', ((event: CustomEvent<DataChangeDetail>) => {
    if (!event.detail.remote && event.detail.sourceRoute === route && scopes.includes(event.detail.scope)) void refresh();
  }) as EventListener, options);
  const unwatch = watchDataChanges(pane, scopes, refresh);
  return () => { disposed = true; requestId++; events.abort(); unwatch(); };
}

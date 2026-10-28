import type { ModuleRoute } from './module-registry.js';
import { captureFormRequestOrigin } from '../api.js';

interface MobilePolicy { title: readonly string[]; metric: readonly string[]; analysis?: boolean; }
/** Presentación por dominio; no contiene peticiones ni reglas comerciales. */
export const mobilePolicies: Record<ModuleRoute, MobilePolicy> = {
  '#/clientes': { title: ['nombre'], metric: ['telefono'] },
  '#/proveedores': { title: ['nombre', 'proveedor'], metric: ['telefono'] },
  '#/inventario': { title: ['producto'], metric: ['inversion', 'stock', 'unidades', 'venta'] },
  '#/series': { title: ['serial', 'imei', 'serie'], metric: ['producto'] },
  '#/reparaciones': { title: ['orden', 'equipo'], metric: ['total', 'costo'] },
  '#/instalaciones': { title: ['orden', 'servicio', 'cliente'], metric: ['total'] },
  '#/rma': { title: ['caso', 'producto', 'cliente'], metric: ['fecha'] },
  '#/tradein': { title: ['equipo', 'cliente'], metric: ['valor', 'total'] },
  '#/ventas': { title: ['venta', 'numero', 'cliente'], metric: ['total'] },
  '#/facturacion': { title: ['factura', 'numero', 'cliente'], metric: ['total', 'saldo'] },
  '#/cartera': { title: ['cliente', 'documento'], metric: ['saldo', 'pendiente', 'total'] },
  '#/compras': { title: ['numero', 'orden', 'proveedor'], metric: ['total'] },
  '#/cotizaciones': { title: ['cotizacion', 'numero', 'cliente'], metric: ['total'] },
  '#/nomina': { title: ['empleado', 'periodo', 'nombre'], metric: ['neto', 'total'] },
  '#/caja': { title: ['concepto', 'descripcion', 'fecha'], metric: ['monto', 'valor', 'total', 'saldo'] },
  '#/pos': { title: ['producto'], metric: ['total', 'precio', 'cantidad'] },
  '#/dashboard': { title: ['concepto'], metric: ['total'], analysis: true },
  '#/reportes': { title: ['concepto'], metric: ['total'], analysis: true },
  '#/rentabilidad': { title: ['concepto'], metric: ['total'], analysis: true },
  '#/config': { title: ['nombre', 'usuario', 'accion'], metric: ['rol', 'fecha'] }
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
let sequence = 0;
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
};
interface MovedNode { node: Node; anchor: Comment; }
function move(node: Node, target: Node, moved: MovedNode[]): void {
  const anchor = document.createComment('mobile-original-position');
  node.parentNode?.insertBefore(anchor, node);
  moved.push({ node, anchor });
  target.appendChild(node);
}
function restore(moved: MovedNode[]): void {
  for (const { node, anchor } of moved) {
    if (anchor.parentNode) anchor.replaceWith(node);
  }
  moved.length = 0;
}
function actionMenu(actions: readonly HTMLElement[], owner: HTMLElement, moved: MovedNode[]): HTMLDetailsElement | null {
  if (!actions.length) return null;
  const menu = make('details', 'erp-mobile-action-menu');
  const summary = make('summary', 'erp-mobile-action-trigger', 'Acciones');
  summary.addEventListener('click', event => event.stopPropagation());
  const body = make('div', 'erp-mobile-action-options');
  menu.append(summary, body);
  owner.append(menu);
  for (const action of actions) {
    if (!action.textContent?.trim() && !action.getAttribute('aria-label')) action.setAttribute('aria-label', action.title || 'Acción del registro');
    // Mantiene nodos, manejadores y el ancestro de delegación de eventos.
    move(action, body, moved);
  }
  return menu;
}

/** Una instancia por vista; se destruye antes de desmontar el módulo. */
export function mountMobileUI(root: HTMLElement, route: string): () => void {
  const phone = window.matchMedia('(max-width: 767.98px)');
  const compact = window.matchMedia('(max-width: 991.98px)');
  const policy = Object.hasOwn(mobilePolicies, route) ? mobilePolicies[route as ModuleRoute] : undefined;
  const events = new AbortController();
  const rows = new Map<HTMLTableRowElement, () => void>();
  const headers = new WeakMap<HTMLElement, () => void>();
  const expanded = new Set<string>();
  const rowCleanups = new Set<() => void>();
  const headerCleanups = new Set<() => void>();
  const filters = new Map<HTMLElement, () => void>();
  const tabs = new Map<HTMLElement, () => void>();
  const externalModals = new Set<HTMLElement>();
  const owns = (node: Node) => root.contains(node) || [...externalModals].some(modal => modal.isConnected && modal.contains(node));
  const pendingForms = new Map<HTMLFormElement, { count: number; buttons: Map<HTMLButtonElement | HTMLInputElement, boolean> }>();
  const pendingReads = new Map<string, number>();
  const failedReads = new Map<string, string>();
  let readStatus: HTMLElement | null = null;
  let frame = 0;
  let disposed = false;
  let viewportBaseline = window.visualViewport?.height || window.innerHeight;
  let viewportWidth = window.innerWidth;

  const listen = (target: EventTarget, type: string, listener: EventListener, capture = false) => target.addEventListener(type, listener, { signal: events.signal, capture });
  const findColumn = (labels: string[], keys: readonly string[], excluded: number[] = []) => {
    for (const key of keys) {
      const index = labels.findIndex((label, i) => !excluded.includes(i) && label.includes(key));
      if (index >= 0) return index;
    }
    return -1;
  };

  function prepareTable(table: HTMLTableElement): void {
    if (table.closest('.cot-doc,.factura-print-host,.cotizacion-print-host,.pos-receipt-print-host,.d-print-block')) return;
    const head = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!head || head.cells.length < 2) return;
    const labels = Array.from(head.cells, cell => normalize(cell.textContent || ''));
    const grouped = Array.from(head.cells).some(cell => cell.colSpan > 1 || cell.rowSpan > 1);
    if (policy?.analysis || grouped || table.dataset.mobileKind === 'analysis') {
      table.classList.add('erp-mobile-analysis');
      return;
    }
    table.classList.add('erp-mobile-records');
    table.closest('.table-responsive')?.classList.add('erp-mobile-record-container');
    const title = Math.max(0, findColumn(labels, policy?.title || ['nombre', 'producto', 'numero']));
    const actions = findColumn(labels, ['acciones', 'accion']);
    const metric = findColumn(labels, policy?.metric || ['total', 'saldo', 'valor'], [title, actions]);
    const status = findColumn(labels, ['estado', 'estatus'], [title, actions, metric]);
    const quantity = table.closest('.modal') ? findColumn(labels, ['cantidad'], [title, actions, metric, status]) : -1;
    const secondary = quantity >= 0 ? quantity : labels.findIndex((label, index) => index !== title && index !== actions && index !== metric && index !== status && /cliente|equipo|documento|sku|codigo|numero|fecha|orden/.test(label));
    for (const body of Array.from(table.tBodies)) for (const row of Array.from(body.rows)) {
      if (rows.has(row) || row.cells.length !== head.cells.length || Array.from(row.cells).some(cell => cell.colSpan > 1)) continue;
      const originalCells = Array.from(row.cells);
      const rowEvents = new AbortController();
      const identity = row.dataset.id || row.querySelector<HTMLElement>('[data-id]')?.dataset.id || originalCells[title]?.textContent?.trim() || '';
      const key = `${body.id || table.id || labels.join('|')}:${identity}`;
      row.classList.add('erp-mobile-record');
      const detailsId = `mobile-record-${++sequence}`;
      const extra: HTMLTableCellElement[] = [];
      originalCells.forEach((cell, index) => {
        cell.dataset.mobileLabel = head.cells[index]?.textContent?.trim() || '';
        const kind = index === title ? 'primary' : index === actions ? 'actions' : index === metric ? 'metric' : index === status ? 'status' : index === secondary ? 'secondary' : 'detail';
        cell.classList.add(`erp-mobile-cell-${kind}`);
        // Los campos editables de repuestos, cantidades y costos permanecen accesibles.
        if (kind === 'detail' && !cell.querySelector('input,select,textarea,button,a[href]')) extra.push(cell);
        else if (kind === 'detail') cell.classList.add('erp-mobile-cell-editor');
      });
      let actionCell = actions >= 0 ? originalCells[actions] : undefined;
      let createdCell: HTMLTableCellElement | undefined;
      if (!actionCell && extra.length) {
        createdCell = row.insertCell();
        createdCell.className = 'erp-mobile-cell-actions';
        actionCell = createdCell;
      }
      const moved: MovedNode[] = [];
      let menu: HTMLDetailsElement | null = null;
      if (actionCell && !actionCell.querySelector('input,select,textarea,.dropdown') && !table.closest('.modal')) {
        const buttons = Array.from(actionCell.querySelectorAll<HTMLElement>('button,a[href]'));
        const primary = buttons.find(button => /\b(ver|detalle|abrir)\b/.test(normalize(button.textContent || button.title || button.getAttribute('aria-label') || '')));
        menu = actionMenu(buttons.filter(button => button !== primary), actionCell, moved);
      }
      let toggle: HTMLButtonElement | undefined;
      if (extra.length && actionCell) {
        toggle = make('button', 'erp-mobile-record-toggle', 'Detalles');
        toggle.type = 'button';
        const cellIds = extra.map((cell, index) => {
          if (!cell.id) { cell.id = `${detailsId}-${index}`; cell.dataset.mobileGeneratedId = 'true'; }
          return cell.id;
        });
        toggle.setAttribute('aria-controls', cellIds.join(' '));
        const setOpen = (open: boolean) => {
          row.classList.toggle('erp-mobile-record-expanded', open);
          toggle?.setAttribute('aria-expanded', String(open));
          if (toggle) toggle.textContent = open ? 'Menos detalles' : 'Detalles';
          if (open) expanded.add(key); else expanded.delete(key);
        };
        setOpen(expanded.has(key));
        toggle.addEventListener('click', event => { event.stopPropagation(); setOpen(!row.classList.contains('erp-mobile-record-expanded')); }, { signal: rowEvents.signal });
        row.addEventListener('click', event => {
          if (event.target instanceof Element && !event.target.closest('button,a,input,select,textarea,label,details,[role="button"]')) setOpen(!row.classList.contains('erp-mobile-record-expanded'));
        }, { signal: rowEvents.signal });
        actionCell.prepend(toggle);
      }
      const cleanup = () => {
        rowEvents.abort();
        restore(moved); menu?.remove(); toggle?.remove(); createdCell?.remove();
        row.classList.remove('erp-mobile-record', 'erp-mobile-record-expanded');
        for (const cell of originalCells) {
          for (const name of Array.from(cell.classList)) if (name.startsWith('erp-mobile-cell-')) cell.classList.remove(name);
          delete cell.dataset.mobileLabel;
          if (cell.dataset.mobileGeneratedId) { cell.removeAttribute('id'); delete cell.dataset.mobileGeneratedId; }
        }
        rows.delete(row);
      };
      rows.set(row, cleanup); rowCleanups.add(cleanup);
    }
  }

  function prepareHeader(header: HTMLElement): void {
    if (headers.has(header)) return;
    const wrapper = header.querySelector<HTMLElement>(':scope > .btn-list');
    if (wrapper) { prepareHeader(wrapper); return; }
    const candidates = Array.from(header.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches('button,a,.dropdown,.btn-group'));
    if (candidates.length < 2 || header.querySelector('input,select,textarea')) return;
    const primary = candidates.find(child => child.matches('.btn-primary') || child.querySelector('.btn-primary')) || candidates[0];
    const moved: MovedNode[] = [];
    const dropdown = candidates.find(child => child.matches('.dropdown'));
    const dropdownBody = dropdown?.querySelector<HTMLElement>('.dropdown-menu');
    if (dropdown && dropdownBody) {
      for (const child of candidates) if (child !== primary && child !== dropdown) move(child, dropdownBody, moved);
      dropdown.classList.add('erp-mobile-header-dropdown');
      const cleanup = () => { restore(moved); dropdown.classList.remove('erp-mobile-header-dropdown'); headers.delete(header); };
      headers.set(header, cleanup); headerCleanups.add(cleanup); return;
    }
    const menu = actionMenu(candidates.filter(child => child !== primary), header, moved);
    const cleanup = () => { restore(moved); menu?.remove(); headers.delete(header); };
    headers.set(header, cleanup); headerCleanups.add(cleanup);
  }

  function prepareTabs(nav: HTMLElement): void {
    if (tabs.has(nav) || nav.closest('.modal')) return;
    const links = Array.from(nav.querySelectorAll<HTMLElement>('[data-bs-toggle="tab"]'));
    if (links.length < 4) return;
    const field = make('div', 'erp-mobile-section-switch');
    const label = make('label', 'form-label', 'Sección');
    const select = make('select', 'form-select'); select.id = `mobile-section-${++sequence}`; label.htmlFor = select.id;
    links.forEach((link, index) => select.add(new Option(link.textContent?.trim() || `Sección ${index + 1}`, String(index), false, link.classList.contains('active'))));
    field.append(label, select); nav.before(field); nav.classList.add('erp-mobile-tabs');
    listen(select, 'change', () => { const link = links[Number(select.value)]; if (link) bootstrap.Tab.getOrCreateInstance(link).show(); });
    listen(nav, 'shown.bs.tab', event => { const index = event.target instanceof HTMLElement ? links.indexOf(event.target) : -1; if (index >= 0) select.value = String(index); });
    tabs.set(nav, () => { field.remove(); nav.classList.remove('erp-mobile-tabs'); });
  }

  function prepareFilter(card: HTMLElement): void {
    if (filters.has(card) || card.closest('.modal')) return;
    const fields = Array.from(card.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="hidden"]),select,textarea'));
    if (!fields.length) return;
    const search = fields.find(field => field instanceof HTMLInputElement && (field.type === 'search' || field.type === 'text') && /buscar|search|nombre|referencia|documento/.test(normalize(`${field.id} ${field.getAttribute('placeholder') || ''}`)));
    const groupFor = (field: HTMLElement): HTMLElement | null => {
      let group: HTMLElement | null = field;
      while (group && group.parentElement !== card && !group.matches('[class*="col-"],.form-group,.mb-3,.erp-filter-field')) group = group.parentElement;
      return group && group !== card && !group.matches('form,.card-body,.row') ? group : null;
    };
    const searchGroup = search ? groupFor(search) : null;
    const groups = [...new Set(fields.filter(field => field !== search).map(groupFor).filter((group): group is HTMLElement => Boolean(group)))].filter(group => group !== searchGroup && !group.contains(searchGroup));
    const originals = groups.filter(group => !groups.some(other => other !== group && other.contains(group)));
    if (!originals.length) return;
    const moved: MovedNode[] = [];
    const defaults = new Map(fields.map(field => [field, field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type) ? String(field.checked) : field.value]));
    const formAttributes = new Map<HTMLElement, string | null>();
    const originalSubmit = card.querySelector<HTMLButtonElement | HTMLInputElement>('button[type="submit"],input[type="submit"],.erp-filter-submit');
    const originalButton = originalSubmit || Array.from(card.querySelectorAll<HTMLButtonElement>('button')).find(button => /filtrar|aplicar|consultar/.test(normalize(button.textContent || '')));
    if (originalButton && !originals.some(group => group.contains(originalButton))) originals.push(groupFor(originalButton) || originalButton);
    const id = `mobile-filters-${++sequence}`;
    const modal = make('div', 'modal erp-mobile-filter-modal');
    modal.id = id; modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true'); modal.setAttribute('aria-labelledby', `${id}-title`);
    modal.innerHTML = `<div class="modal-dialog modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title" id="${id}-title">Filtros</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar filtros"></button></div><div class="modal-body"><div class="row g-3 erp-mobile-filter-fields"></div></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-mobile-reset>Limpiar filtros</button><button type="button" class="btn btn-primary" data-mobile-apply>Ver resultados</button></div></div></div>`;
    const target = modal.querySelector<HTMLElement>('.erp-mobile-filter-fields');
    if (!target) return;
    const toolbar = make('div', 'erp-mobile-filter-toolbar');
    const open = make('button', 'btn btn-outline-primary erp-mobile-filter-open', 'Filtros');
    open.type = 'button'; open.dataset.bsToggle = 'modal'; open.dataset.bsTarget = `#${id}`;
    const count = make('span', 'erp-mobile-filter-count', '0');
    open.append(count); toolbar.append(open); card.append(toolbar); root.append(modal);
    for (const group of originals) {
      const controls = [group, ...Array.from(group.querySelectorAll<HTMLElement>('input,select,textarea,button'))];
      for (const control of controls) {
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement || control instanceof HTMLButtonElement) || !control.form) continue;
        if (!control.form.id) control.form.id = `mobile-filter-form-${++sequence}`;
        formAttributes.set(control, control.getAttribute('form'));
        control.setAttribute('form', control.form.id);
      }
      move(group, target, moved);
    }
    if (originalButton) originalButton.classList.add('erp-mobile-original-filter-submit');
    const update = () => {
      const active = fields.filter(field => field !== search && (field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type) ? String(field.checked) : field.value) !== defaults.get(field));
      count.textContent = String(active.length);
      open.setAttribute('aria-label', `Filtros: ${active.length} activos`);
    };
    listen(modal, 'input', update); listen(modal, 'change', update);
    const hide = () => bootstrap.Modal.getOrCreateInstance(modal).hide();
    listen(modal.querySelector('[data-mobile-apply]') || modal, 'click', () => {
      if (originalButton?.form && !originalButton.form.reportValidity()) return;
      originalButton?.click(); update(); hide();
    });
    listen(modal.querySelector('[data-mobile-reset]') || modal, 'click', () => {
      for (const field of fields) {
        if (field === search) continue;
        if (field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type)) field.checked = defaults.get(field) === 'true';
        else field.value = defaults.get(field) || '';
        field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
      }
      update();
    });
    listen(modal, 'hidden.bs.modal', () => { if (open.isConnected && phone.matches) open.focus(); });
    filters.set(card, () => {
      const instance = bootstrap.Modal.getInstance(modal); instance?.hide(); instance?.dispose();
      restore(moved);
      for (const [control, attr] of formAttributes) { if (attr === null) control.removeAttribute('form'); else control.setAttribute('form', attr); }
      originalButton?.classList.remove('erp-mobile-original-filter-submit');
      toolbar.remove(); modal.remove();
    });
    update();
  }

  function prepareFields(scope: HTMLElement): void {
    for (const field of scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')) {
      if (field instanceof HTMLInputElement && !field.inputMode) {
        if (field.type === 'number') field.inputMode = field.step && field.step !== '1' ? 'decimal' : 'numeric';
        else if (/telefono|phone|celular/.test(field.id)) field.inputMode = 'tel';
      }
      if (field.type !== 'hidden' && !field.getAttribute('aria-label') && !field.labels?.length && field.placeholder) field.setAttribute('aria-label', field.placeholder);
    }
    const modals = [...(scope.matches('.modal') ? [scope] : []), ...Array.from(scope.querySelectorAll<HTMLElement>('.modal'))];
    for (const modal of modals) {
      if (modal.classList.contains('erp-mobile-filter-modal')) continue;
      if (modal.querySelector('.modal-lg,.modal-xl') || modal.querySelectorAll('input:not([type="hidden"]),select,textarea').length > 4) modal.classList.add('erp-mobile-long-modal');
    }
  }

  function scan(): void {
    if (disposed) return;
    observer.disconnect(); externalObserver.disconnect();
    for (const modal of externalModals) if (!modal.isConnected) externalModals.delete(modal);
    for (const [row, cleanup] of rows) if (!owns(row)) { cleanup(); rowCleanups.delete(cleanup); }
    for (const [card, dispose] of filters) if (!card.isConnected) { dispose(); filters.delete(card); }
    for (const [nav, dispose] of tabs) if (!nav.isConnected) { dispose(); tabs.delete(nav); }
    const scopes = [root, ...externalModals];
    for (const scope of scopes) prepareFields(scope);
    const main = root.querySelector('#main-content');
    if (main && readStatus && !main.contains(readStatus) && (pendingReads.size || failedReads.size)) main.prepend(readStatus);
    if (compact.matches) for (const scope of scopes) for (const table of scope.querySelectorAll<HTMLTableElement>('table')) prepareTable(table);
    if (phone.matches) {
      for (const header of root.querySelectorAll<HTMLElement>('.erp-header__actions')) prepareHeader(header);
      for (const card of root.querySelectorAll<HTMLElement>('.erp-filter-card')) prepareFilter(card);
      for (const nav of root.querySelectorAll<HTMLElement>('.nav-tabs,.nav-pills')) prepareTabs(nav);
    }
    observer.observe(root, { childList: true, subtree: true });
    externalObserver.observe(document.body, { childList: true, subtree: true });
  }
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(scan); };
  const observer = new MutationObserver(schedule);
  const externalObserver = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement) || root.contains(node)) continue;
      if (node.matches('.modal')) externalModals.add(node);
      for (const modal of node.querySelectorAll<HTMLElement>('.modal')) if (!root.contains(modal)) externalModals.add(modal);
    }
    schedule();
  });

  function viewport(): void {
    if (disposed) return;
    const view = window.visualViewport;
    const focused = document.activeElement;
    const editing = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement;
    if (!editing || viewportWidth !== window.innerWidth) { viewportBaseline = window.innerHeight; viewportWidth = window.innerWidth; }
    const keyboard = compact.matches && editing && Boolean(view && viewportBaseline - view.height > 140 && view.scale < 1.1);
    document.body.classList.toggle('erp-keyboard-open', keyboard);
    document.body.style.setProperty('--erp-visible-height', `${view?.height || window.innerHeight}px`);
    if (keyboard && focused instanceof HTMLElement) focused.scrollIntoView({ block: 'nearest' });
  }
  const changeSize = () => {
    if (!phone.matches) {
      observer.disconnect(); externalObserver.disconnect();
      for (const cleanup of headerCleanups) cleanup(); headerCleanups.clear();
      for (const cleanup of filters.values()) cleanup(); filters.clear();
      for (const cleanup of tabs.values()) cleanup(); tabs.clear();
    }
    if (!compact.matches) { for (const cleanup of rowCleanups) cleanup(); rowCleanups.clear(); }
    viewport(); cancelAnimationFrame(frame); scan();
  };
  listen(phone, 'change', changeSize); listen(compact, 'change', changeSize); listen(window, 'resize', viewport);
  if (window.visualViewport) listen(window.visualViewport, 'resize', viewport);
  listen(document, 'focusin', viewport); listen(document, 'focusout', () => requestAnimationFrame(viewport));
  listen(document, 'shown.bs.modal', event => {
    if (event.target instanceof HTMLElement && event.target.querySelector('.modal-body') && event.target.scrollHeight > window.innerHeight * .8) event.target.classList.add('erp-mobile-long-modal');
  });
  listen(document, 'keydown', event => {
    if (event instanceof KeyboardEvent && event.key === 'Escape') for (const menu of root.querySelectorAll<HTMLDetailsElement>('.erp-mobile-action-menu[open]')) { menu.open = false; menu.querySelector('summary')?.focus(); }
  });
  listen(root, 'click', event => {
    for (const menu of root.querySelectorAll<HTMLDetailsElement>('.erp-mobile-action-menu[open]')) {
      if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
  });
  listen(document, 'invalid', event => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
    if (!owns(field)) return;
    field.setAttribute('aria-invalid', 'true');
    let message = field.parentElement?.querySelector<HTMLElement>('.erp-mobile-field-error');
    if (!message) { message = make('span', 'erp-mobile-field-error'); message.id = `mobile-field-error-${++sequence}`; field.after(message); }
    message.textContent = field.validationMessage;
    const describedBy = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); describedBy.add(message.id);
    field.setAttribute('aria-describedby', [...describedBy].join(' '));
  }, true);
  listen(document, 'input', event => {
    const field = event.target;
    if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) && owns(field) && field.validity.valid) {
      field.removeAttribute('aria-invalid');
      const message = field.parentElement?.querySelector('.erp-mobile-field-error');
      if (message) { field.setAttribute('aria-describedby', (field.getAttribute('aria-describedby') || '').split(' ').filter(id => id !== message.id).join(' ')); message.remove(); }
    }
  });
  listen(document, 'submit', event => {
    if (event.target instanceof HTMLFormElement && pendingForms.has(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
    else if (event.target instanceof HTMLFormElement) captureFormRequestOrigin(event.target);
  }, true);
  listen(document, 'erp:read-state', event => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!detail || typeof detail !== 'object' || !('endpoint' in detail) || typeof detail.endpoint !== 'string' || !('state' in detail) || !('sourceRoute' in detail) || detail.sourceRoute !== route) return;
    const count = pendingReads.get(detail.endpoint) || 0;
    if (detail.state === 'pending') pendingReads.set(detail.endpoint, count + 1);
    else {
      if (count <= 1) pendingReads.delete(detail.endpoint); else pendingReads.set(detail.endpoint, count - 1);
      if (detail.state === 'success') failedReads.delete(detail.endpoint);
      if (detail.state === 'error') failedReads.set(detail.endpoint, 'message' in detail && typeof detail.message === 'string' ? detail.message : 'No se pudo actualizar la información.');
    }
    const main = root.querySelector<HTMLElement>('#main-content');
    if (!main) return;
    main.setAttribute('aria-busy', String(pendingReads.size > 0));
    if (!pendingReads.size && !failedReads.size) { readStatus?.remove(); readStatus = null; return; }
    if (!readStatus) { readStatus = make('div', 'erp-mobile-load-state'); readStatus.setAttribute('role', 'status'); main.prepend(readStatus); }
    const message = make('span', '', failedReads.size ? [...failedReads.values()][0] : 'Actualizando información…');
    readStatus.replaceChildren(message);
    readStatus.classList.toggle('erp-mobile-load-error', failedReads.size > 0);
    if (failedReads.size && !pendingReads.size) {
      const retry = make('button', 'btn btn-outline-primary', 'Reintentar'); retry.type = 'button';
      retry.addEventListener('click', () => window.dispatchEvent(new Event('erp:retry-read')), { once: true }); readStatus.append(retry);
    }
  });
  listen(document, 'erp:form-request', event => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!detail || typeof detail !== 'object' || !('form' in detail) || !(detail.form instanceof HTMLFormElement) || !('pending' in detail)) return;
    const form = detail.form;
    if (!owns(form)) return;
    if (detail.pending === true) {
      let state = pendingForms.get(form);
      if (!state) { state = { count: 0, buttons: new Map() }; pendingForms.set(form, state); }
      state.count++;
      for (const button of Array.from(form.elements)) if ((button instanceof HTMLButtonElement || button instanceof HTMLInputElement) && button.type === 'submit') { if (!state.buttons.has(button)) state.buttons.set(button, button.disabled); button.disabled = true; }
      form.setAttribute('aria-busy', 'true');
    } else {
      const state = pendingForms.get(form);
      if (state && --state.count <= 0) { for (const [button, disabled] of state.buttons) button.disabled = disabled; form.removeAttribute('aria-busy'); pendingForms.delete(form); }
    }
  });
  scan(); viewport();
  return () => {
    disposed = true; observer.disconnect(); externalObserver.disconnect(); cancelAnimationFrame(frame); events.abort();
    for (const cleanup of filters.values()) cleanup();
    for (const cleanup of tabs.values()) cleanup();
    for (const cleanup of rowCleanups) cleanup();
    for (const cleanup of headerCleanups) cleanup();
    for (const [form, state] of pendingForms) { for (const [button, disabled] of state.buttons) button.disabled = disabled; form.removeAttribute('aria-busy'); }
    for (const modal of externalModals) { bootstrap.Modal.getInstance(modal)?.dispose(); modal.remove(); }
    document.body.classList.remove('erp-keyboard-open'); document.body.style.removeProperty('--erp-visible-height');
    readStatus?.remove(); root.querySelector('#main-content')?.removeAttribute('aria-busy');
  };
}

import type { ClienteDTO, ProductoDTO, SedeDTO } from '../../../../shared/contracts';
import type { CotizacionDocumento, EmpresaDocumento } from '../types/documents.js';
import { apiRequired } from '../utils/api-required.js';
import { eventElement, eventField } from '../utils/dom.js';
interface CotItem { productoId: string | null; descripcion: string; cantidad: number; precioUnitario: number; tieneIVA: boolean; }
interface CotizacionDTO extends CotizacionDocumento { id: string; total: string; clienteId: string | null; }
import { requireElement } from '../utils/dom.js';
import { errorMessage } from '../utils/errors.js';
import { watchDataChanges, syncSelectOptions } from '../utils/live-data.js';
import { apiFetch } from '../api.js';
import { requireUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';
import { renderCotizacionDocumento, printCotizacionDocumento } from '../utils/cotizacion-document.js';
import { showToast } from '../utils/toast.js';

export async function initCotizaciones(container: HTMLElement) {
  const usuario = requireUsuario();
  const sedeId = usuario.sedeId;

  let clientes: ClienteDTO[] = [];
  let productos: ProductoDTO[] = [];
  let sedes: SedeDTO[] = [];
  let cotizacionCart: CotItem[] = [];

  try {
    clientes = await apiRequired<ClienteDTO[]>('/clientes').catch(() => []);
    productos = await apiRequired<ProductoDTO[]>('/productos').then((list) => list.filter((p) => p.activo !== false)).catch(() => []);
    if (['admin', 'superadmin'].includes(usuario.rol)) {
      sedes = await apiRequired<SedeDTO[]>('/config/sedes').catch(() => []);
    }
  } catch (e) {
    console.error('Error precargando datos en cotizaciones:', e);
  }

  const defaultSedeId = usuario.sedeId || (sedes[0]?.id || '');

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Cotizaciones',
        title: 'Presupuestos comerciales',
        subtitle: 'Elaboración y seguimiento de ofertas para clientes'
      })}

      <!-- Navigation tabs -->
      <div class="card mb-3 d-print-none">
        <div class="card-header bg-transparent border-bottom">
          <ul class="nav nav-tabs card-header-tabs" data-bs-toggle="tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <a href="#tab-historial-cot" class="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab">
                <i class="ti ti-history me-1"></i> Historial
              </a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-nueva-cot" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-plus me-1"></i> Nueva Cotización
              </a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <!-- TAB 1: HISTORIAL -->
            <div class="tab-pane active show" id="tab-historial-cot" role="tabpanel">
              <div class="erp-list-workspace">
              <div class="card erp-filter-card">
                <div class="card-body">
                  <div class="row g-2 align-items-end">
                    <div class="col-md-4">
                      <label class="form-label" for="filtro-cot-buscar">Buscar</label>
                      <input type="text" id="filtro-cot-buscar" class="form-control" placeholder="Número o cliente…" spellcheck="false">
                    </div>
                    <div class="col-md-3">
                      <label class="form-label" for="filtro-cot-estado">Estado</label>
                      <select id="filtro-cot-estado" class="form-select">
                        <option value="">-- Todos los Estados --</option>
                        <option value="borrador">Borrador</option>
                        <option value="enviada">Enviada</option>
                        <option value="aprobada">Aprobada</option>
                        <option value="rechazada">Rechazada</option>
                        <option value="expirada">Expirada</option>
                      </select>
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                      <button id="btn-filtrar-cot" type="button" class="btn btn-primary erp-filter-submit"><i class="ti ti-filter me-1"></i>Filtrar</button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="card erp-table-panel">
                <div class="table-responsive">
                  <table class="table table-vcenter card-table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Cliente</th>
                      <th>Fecha Vence</th>
                      <th class="text-end">Total</th>
                      <th class="text-center">Estado</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="cotizaciones-table-body">
                    <tr><td colspan="6" class="text-center py-4 text-secondary">Cargando cotizaciones…</td></tr>
                  </tbody>
                  </table>
                </div>
              </div>
              </div>
            </div>

            <!-- TAB 2: NUEVA COTIZACIÓN -->
            <div class="tab-pane" id="tab-nueva-cot" role="tabpanel">
              <form id="form-nueva-cotizacion">
                <div class="row">
                  ${['admin', 'superadmin'].includes(usuario.rol) ? `
                    <div class="col-md-4 mb-3">
                      <label class="form-label">Sede</label>
                      <select id="cot-sede" class="form-select" required>
                        <option value="">-- Seleccionar Sede --</option>
                        ${sedes.map(s => `<option value="${s.id}" ${s.id === defaultSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label">Cliente</label>
                      <select id="cot-cliente" class="form-select" required>
                        <option value="">-- Seleccionar Cliente --</option>
                        ${clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.documento || 'Sin doc'})</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label">Fecha de Vencimiento</label>
                      <input type="date" id="cot-vencimiento" class="form-control" required>
                    </div>
                  ` : `
                    <div class="col-md-6 mb-3">
                      <label class="form-label">Cliente</label>
                      <select id="cot-cliente" class="form-select" required>
                        <option value="">-- Seleccionar Cliente --</option>
                        ${clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.documento || 'Sin doc'})</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-6 mb-3">
                      <label class="form-label">Fecha de Vencimiento</label>
                      <input type="date" id="cot-vencimiento" class="form-control" required>
                    </div>
                  `}
                </div>

                <div class="mb-3">
                  <label class="form-label">Notas y Términos</label>
                  <textarea id="cot-notas" class="form-control" rows="2" placeholder="Notas internas o condiciones comerciales…" spellcheck="false"></textarea>
                </div>

                <div class="card p-3 mb-3 bg-light">
                  <h4 class="card-title mb-3">Agregar Ítems</h4>
                  <div class="row g-2 align-items-end">
                    <div class="col-md-5">
                      <label class="form-label small text-secondary" for="btn-cot-buscar-producto">Producto del Catálogo</label>
                      <div class="input-group">
                        <input type="hidden" id="cot-add-producto" value="">
                        <input type="hidden" id="cot-add-tiene-iva" value="1">
                        <span class="input-group-text"><i class="ti ti-package" aria-hidden="true"></i></span>
                        <input
                          type="text"
                          id="cot-add-producto-display"
                          class="form-control"
                          placeholder="Buscar en catálogo…"
                          readonly
                          tabindex="-1"
                        >
                        <button type="button" class="btn btn-outline-primary" id="btn-cot-buscar-producto" title="Buscar producto">
                          <i class="ti ti-search me-1" aria-hidden="true"></i>Buscar
                        </button>
                      </div>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small text-secondary" for="cot-add-desc">Descripción Manual / Servicio</label>
                      <input type="text" id="cot-add-desc" class="form-control" placeholder="Ej: Servicio de mantenimiento">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label small text-secondary" for="cot-add-precio">Precio Unitario</label>
                      <input type="number" id="cot-add-precio" class="form-control" placeholder="0" min="0">
                    </div>
                    <div class="col-md-1 d-flex align-items-end">
                      <button type="button" id="btn-add-item-cot" class="btn btn-primary w-100" aria-label="Agregar ítem a cotización"><i class="ti ti-plus"></i></button>
                    </div>
                  </div>
                </div>

                <div class="table-responsive mb-3">
                  <table class="table table-vcenter">
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th style="width: 100px;">Cant.</th>
                        <th class="text-end">Precio Unit.</th>
                        <th class="text-end">Subtotal</th>
                        <th style="width: 50px;"></th>
                      </tr>
                    </thead>
                    <tbody id="cot-cart-body">
                      <tr><td colspan="5" class="text-center py-3 text-secondary">Ningún ítem agregado.</td></tr>
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colspan="3" class="text-end">TOTAL COTIZACIÓN:</th>
                        <th id="cot-cart-total" class="text-end text-primary h3">$ 0</th>
                        <th></th>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <button type="submit" class="btn btn-primary w-100 btn-lg"><i class="ti ti-device-floppy me-1"></i> Guardar y Crear Cotización</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Detalle Cotizacion -->
    <div class="modal modal-blur fade" id="modal-detalle-cot" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
        <div class="modal-content" id="detalle-cot-content"></div>
      </div>
    </div>

    <!-- Modal Buscar producto (Nueva Cotización) -->
    <div class="modal modal-blur fade" id="modal-cot-producto" tabindex="-1" role="dialog" aria-labelledby="modal-cot-producto-title" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
        <div class="modal-content oc-product-modal">
          <div class="modal-header oc-product-modal__header">
            <div>
              <h5 class="modal-title" id="modal-cot-producto-title">Buscar producto</h5>
              <p class="oc-product-modal__lede mb-0">Busque → fije precio → agregue. El modal sigue abierto para cargar varios.</p>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body oc-product-modal__body p-0">
            <aside class="oc-product-modal__cats" aria-label="Categorías">
              <p class="oc-product-modal__rail-label">Categorías</p>
              <div id="cot-producto-chips" class="oc-product-modal__cat-list" role="list"></div>
            </aside>
            <div class="oc-product-modal__main">
              <div class="oc-product-modal__search input-group">
                <span class="input-group-text"><i class="ti ti-search" aria-hidden="true"></i></span>
                <input
                  type="search"
                  id="cot-producto-search"
                  class="form-control"
                  placeholder="Nombre o código…"
                  autocomplete="off"
                  spellcheck="false"
                >
              </div>
              <div id="cot-producto-list" class="oc-product-modal__list" role="listbox"></div>
            </div>
            <aside class="oc-product-modal__added" aria-label="Productos en esta cotización">
              <div class="oc-product-modal__ticket-head">
                <p class="oc-product-modal__rail-label mb-0">En esta cotización</p>
                <span class="oc-product-modal__ticket-hint" id="cot-modal-ticket-hint">Vacía</span>
              </div>
              <div class="oc-product-modal__compose" id="cot-modal-compose" hidden>
                <div class="oc-product-modal__compose-head">
                  <div class="oc-product-modal__compose-name">
                    <span class="oc-product-modal__compose-label">Para agregar</span>
                    <strong id="cot-modal-prod-name">—</strong>
                  </div>
                  <button type="button" class="btn btn-ghost-secondary btn-icon btn-sm oc-product-modal__compose-cancel" id="cot-modal-compose-cancel" aria-label="Cancelar selección" title="Cancelar">
                    <i class="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>
                <div class="oc-product-modal__compose-fields">
                  <div class="oc-field oc-field--cost">
                    <label class="form-label" for="cot-modal-precio">Precio</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" id="cot-modal-precio" class="form-control" placeholder="0" min="0" step="1" inputmode="numeric">
                    </div>
                  </div>
                  <div class="oc-field oc-field--qty">
                    <label class="form-label" for="cot-modal-cant">Cant.</label>
                    <input type="number" id="cot-modal-cant" class="form-control" value="1" min="1" inputmode="numeric">
                  </div>
                  <div class="oc-field oc-field--action">
                    <button type="button" id="cot-modal-add" class="btn btn-primary">
                      <i class="ti ti-plus" aria-hidden="true"></i>
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>
              </div>
              <div id="cot-modal-cart-list" class="oc-product-modal__added-list"></div>
            </aside>
          </div>
          <div class="modal-footer oc-product-modal__footer">
            <div class="oc-product-modal__cart-summary" id="cot-modal-cart-summary" aria-live="polite">
              0 en la cotización · $ 0
            </div>
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal" id="cot-modal-listo">Listo</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const modalDetalle = new bootstrap.Modal(requireElement('modal-detalle-cot', HTMLDivElement));
  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  // Poner fecha de vencimiento por defecto a 15 días
  const today = new Date();
  today.setDate(today.getDate() + 15);
  requireElement('cot-vencimiento', HTMLInputElement).value = today.toISOString().split('T')[0];

  const prodIdInput = requireElement('cot-add-producto', HTMLInputElement);
  const prodDisplay = requireElement('cot-add-producto-display', HTMLInputElement);
  const prodIvaInput = requireElement('cot-add-tiene-iva', HTMLInputElement);
  const descInput = requireElement('cot-add-desc', HTMLInputElement);
  const precioInput = requireElement('cot-add-precio', HTMLInputElement);
  const btnBuscarProd = requireElement('btn-cot-buscar-producto', HTMLButtonElement);
  const modalProdEl = requireElement('modal-cot-producto', HTMLDivElement);
  const modalProd = modalProdEl ? bootstrap.Modal.getOrCreateInstance(modalProdEl) : null;
  const searchProd = requireElement('cot-producto-search', HTMLInputElement);
  const listProd = requireElement('cot-producto-list', HTMLDivElement);
  const chipsProd = requireElement('cot-producto-chips', HTMLDivElement);
  const modalCompose = requireElement('cot-modal-compose', HTMLDivElement);
  const modalProdName = requireElement('cot-modal-prod-name', HTMLElement);
  const modalPrecio = requireElement('cot-modal-precio', HTMLInputElement);
  const modalCant = requireElement('cot-modal-cant', HTMLInputElement);
  const modalAddBtn = requireElement('cot-modal-add', HTMLButtonElement);
  const modalCartSummary = requireElement('cot-modal-cart-summary', HTMLDivElement);
  const modalCartList = requireElement('cot-modal-cart-list', HTMLDivElement);
  const modalTicketHint = requireElement('cot-modal-ticket-hint', HTMLSpanElement);

  let pickerMatches: ProductoDTO[] = [];
  let pickerActiveIdx = -1;
  let pickerCategoriaId = '';
  let modalSelectedProd: ProductoDTO | null = null;

  function escapeCotHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeCotSearch(value: unknown) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function productoCategoriaNombre(prod: ProductoDTO) {
    return prod?.categoria?.nombre || prod?.categoriaNombre || '';
  }

  function productoCategoriaId(prod: ProductoDTO) {
    return String(prod?.categoriaId || prod?.categoria?.id || '');
  }

  function categoriaChipLabel(nombre: string) {
    const raw = String(nombre || '').trim();
    if (!raw) return '';
    const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : raw;
  }

  function productoSearchHaystack(prod: ProductoDTO) {
    return normalizeCotSearch(`${prod?.nombre || ''} ${prod?.codigoBarras || ''} ${productoCategoriaNombre(prod)}`);
  }

  function getPickerCategorias() {
    const map = new Map();
    productos.forEach((p) => {
      const id = productoCategoriaId(p);
      const nombre = productoCategoriaNombre(p);
      if (!id || !nombre || map.has(id)) return;
      map.set(id, nombre);
    });
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function scoreProductoMatch(prod: ProductoDTO, queryNorm: string, tokens: string[]) {
    const nombre = normalizeCotSearch(prod?.nombre || '');
    const codigo = normalizeCotSearch(prod?.codigoBarras || '');
    const haystack = productoSearchHaystack(prod);
    if (tokens.some((t) => !haystack.includes(t))) return -1;
    let score = 0;
    if (queryNorm && nombre.startsWith(queryNorm)) score += 100;
    else if (queryNorm && codigo.startsWith(queryNorm)) score += 90;
    else if (queryNorm && nombre.includes(queryNorm)) score += 50;
    else if (queryNorm && codigo.includes(queryNorm)) score += 40;
    if (tokens.length > 1) score += 10;
    return score;
  }

  function filterProductosPicker(query = '', categoriaId = '') {
    const qRaw = String(query || '').trim();
    const qNorm = normalizeCotSearch(qRaw);
    const tokens = qNorm.split(/\s+/).filter(Boolean);
    const catId = String(categoriaId || '');
    const canListByQuery = qNorm.length >= 2;
    if (!productos.length) return { mode: 'guide', matches: [], query: qRaw };

    let list = productos;
    if (catId) list = list.filter((p) => productoCategoriaId(p) === catId);

    if (canListByQuery) {
      list = list
        .map((p) => ({ p, score: scoreProductoMatch(p, qNorm, tokens) }))
        .filter((row) => row.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.p.nombre || '').localeCompare(String(b.p.nombre || ''), 'es');
        })
        .map((row) => row.p);
    } else {
      list = [...list].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
    }

    const limit = canListByQuery || catId ? 40 : 80;
    return { mode: 'results', matches: list.slice(0, limit), query: qRaw, total: list.length, limit };
  }

  function highlightCotMatch(text: string, query: string) {
    const raw = String(text ?? '');
    const q = String(query || '').trim();
    if (!raw || !q || q.length < 2) return escapeCotHtml(raw);
    const normText = normalizeCotSearch(raw);
    const tokens = normalizeCotSearch(q).split(/\s+/).filter((t) => t.length >= 2);
    if (!tokens.length) return escapeCotHtml(raw);
    let best: { idx: number; len: number } | null = null;
    for (const token of tokens) {
      const idx = normText.indexOf(token);
      if (idx < 0) continue;
      if (!best || idx < best.idx) best = { idx, len: token.length };
    }
    if (!best) return escapeCotHtml(raw);
    let normPos = 0;
    let start = -1;
    let end = -1;
    for (let i = 0; i < raw.length; i++) {
      const ch = normalizeCotSearch(raw[i]);
      if (!ch) continue;
      if (normPos === best.idx) start = i;
      normPos += ch.length;
      if (start >= 0 && normPos >= best.idx + best.len) {
        end = i + 1;
        break;
      }
    }
    if (start < 0 || end < 0) return escapeCotHtml(raw);
    return (
      escapeCotHtml(raw.slice(0, start)) +
      `<mark class="oc-product-picker__mark">${escapeCotHtml(raw.slice(start, end))}</mark>` +
      escapeCotHtml(raw.slice(end))
    );
  }

  function highlightPickerItem(idx: number) {
    if (!listProd) return;
    const items = Array.from(listProd.querySelectorAll('[role="option"]'));
    items.forEach((el, i) => {
      const on = i === idx;
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.classList.toggle('is-active', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
    pickerActiveIdx = idx;
  }

  function renderProductoPickerRows(matches: ProductoDTO[], query: string) {
    return matches.map((p, idx) => {
      const codigo = p.codigoBarras || 's/c';
      const cat = productoCategoriaNombre(p);
      const catShort = categoriaChipLabel(cat);
      const precio = Math.round(Number(p.precioVenta) || 0);
      return `
        <button type="button" class="oc-product-picker__item" role="option" id="cot-prod-opt-${idx}" data-id="${escapeCotHtml(p.id)}" aria-selected="false">
          <span class="oc-product-picker__main">
            <span class="oc-product-picker__name">${highlightCotMatch(p.nombre || 'Producto', query)}</span>
            <span class="oc-product-picker__meta">
              <span class="oc-product-picker__sku">${highlightCotMatch(codigo, query)}</span>
              ${cat ? `<span class="oc-product-picker__dot" aria-hidden="true">·</span><span class="oc-product-picker__cat" title="${escapeCotHtml(cat)}">${escapeCotHtml(catShort)}</span>` : ''}
            </span>
          </span>
          <span class="oc-product-picker__cost">${formatter.format(precio)}</span>
        </button>
      `;
    }).join('');
  }

  function renderProductoPickerChips() {
    if (!chipsProd) return;
    const cats = getPickerCategorias();
    chipsProd.innerHTML = `
      <button type="button" class="oc-product-modal__cat${!pickerCategoriaId ? ' is-active' : ''}" data-categoria="" role="listitem">Todas</button>
      ${cats.map((c) => {
        const short = categoriaChipLabel(c.nombre);
        return `
          <button type="button" class="oc-product-modal__cat${pickerCategoriaId === c.id ? ' is-active' : ''}" data-categoria="${escapeCotHtml(c.id)}" title="${escapeCotHtml(c.nombre)}" role="listitem">
            ${escapeCotHtml(short)}
          </button>
        `;
      }).join('')}
    `;
  }

  function renderProductoPicker(query = '') {
    if (!listProd) return;
    const result = filterProductosPicker(query, pickerCategoriaId);
    pickerMatches = result.matches;
    pickerActiveIdx = -1;
    renderProductoPickerChips();

    if (result.mode === 'guide') {
      listProd.innerHTML = `
        <div class="oc-product-picker__guide">
          <p class="oc-product-picker__guide-title">No hay productos en el catálogo</p>
          <p class="oc-product-picker__guide-hint">Cree productos en Inventario para usarlos aquí.</p>
        </div>
      `;
      return;
    }

    if (!pickerMatches.length) {
      listProd.innerHTML = `<div class="oc-product-picker__empty">Sin coincidencias. Pruebe otro término o categoría.</div>`;
      return;
    }

    const shown = pickerMatches.length;
    const total = Number(result.total || shown);
    const more = total > shown;
    listProd.innerHTML = `
      <div class="oc-product-picker__count">${shown}${more ? ` / ${total}` : ''} producto${shown === 1 ? '' : 's'}${more ? ' · filtre para acotar' : ''}</div>
      ${renderProductoPickerRows(pickerMatches, result.query || query)}
    `;
  }

  function clearModalCompose({ clearForm = false } = {}) {
    modalSelectedProd = null;
    if (modalCompose) modalCompose.hidden = true;
    if (modalProdName) modalProdName.textContent = '—';
    if (modalPrecio) modalPrecio.value = '';
    if (modalCant) modalCant.value = '1';
    if (clearForm) {
      if (prodIdInput) prodIdInput.value = '';
      if (prodDisplay) prodDisplay.value = '';
      if (prodIvaInput) prodIvaInput.value = '1';
      highlightPickerItem(-1);
      searchProd?.focus();
    }
  }

  function updateCotModalCartSummary() {
    const n = cotizacionCart.length;
    const tot = cotizacionCart.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0);
    if (modalCartSummary) modalCartSummary.textContent = `${n} en la cotización · ${formatter.format(tot)}`;
    if (modalTicketHint) {
      modalTicketHint.textContent = n === 0 ? 'Vacía' : `${n}`;
      modalTicketHint.classList.toggle('is-filled', n > 0);
    }
    if (!modalCartList) return;
    if (!n) {
      modalCartList.innerHTML = `
        <div class="oc-product-modal__added-empty">
          <span class="oc-product-modal__added-empty-title">Sin ítems aún</span>
          <span class="oc-product-modal__added-empty-hint">Elija un producto de la lista, fije precio y pulse Agregar.</span>
        </div>`;
      return;
    }
    modalCartList.innerHTML = cotizacionCart.map((item, idx) => {
      const sub = item.cantidad * item.precioUnitario;
      return `
        <div class="oc-product-modal__added-item" data-idx="${idx}">
          <div class="oc-product-modal__added-top">
            <strong class="oc-product-modal__added-name" title="${escapeCotHtml(item.descripcion)}">${escapeCotHtml(item.descripcion)}</strong>
            <button type="button" class="btn btn-ghost-danger btn-icon btn-sm cot-modal-remove-item" data-idx="${idx}" aria-label="Quitar de la cotización">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </div>
          <div class="oc-product-modal__added-meta">
            <span>× ${item.cantidad}</span>
            <span>${formatter.format(item.precioUnitario)}</span>
            <span class="oc-product-modal__added-sub">${formatter.format(sub)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  async function openProductoPickerModal() {
    try { productos = (await apiRequired<ProductoDTO[]>('/productos')).filter(p => p.activo !== false); }
    catch (error) { showToast('No se pudo actualizar el catálogo', errorMessage(error), 'error'); return; }
    if (!container.isConnected || window.location.hash.split('?')[0] !== '#/cotizaciones') return;
    if (!modalProd) return;
    pickerCategoriaId = '';
    if (searchProd) searchProd.value = '';
    clearModalCompose();
    renderProductoPicker('');
    updateCotModalCartSummary();
    modalProd.show();
  }

  function chooseProductoFromPicker(prod: ProductoDTO | undefined) {
    if (!prod) return;
    modalSelectedProd = prod;
    if (prodIdInput) prodIdInput.value = prod.id;
    if (prodDisplay) prodDisplay.value = prod.nombre || '';
    if (prodIvaInput) prodIvaInput.value = prod.tieneIVA === false ? '0' : '1';
    if (descInput) descInput.value = prod.nombre || '';
    if (precioInput) precioInput.value = String(Math.round(Number(prod.precioVenta) || 0));
    if (modalCompose) modalCompose.hidden = false;
    if (modalProdName) modalProdName.textContent = prod.nombre || 'Producto';
    const precio = Math.round(Number(prod.precioVenta) || 0);
    if (modalPrecio) modalPrecio.value = precio > 0 ? String(precio) : '';
    if (modalCant) modalCant.value = '1';
    modalCompose?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (precio <= 0) {
      modalPrecio?.focus();
      modalPrecio?.select?.();
    } else {
      modalCant?.focus();
      modalCant?.select?.();
    }
  }

  function addProductoAlCarrito({ productoId, descripcion, cantidad, precioUnitario, tieneIVA }: CotItem) {
    const exist = cotizacionCart.find((item) => item.productoId && productoId && item.productoId === productoId);
    if (exist) {
      exist.cantidad += cantidad;
      exist.precioUnitario = precioUnitario;
    } else {
      cotizacionCart.push({
        productoId,
        descripcion,
        cantidad,
        precioUnitario,
        tieneIVA
      });
    }
    renderCotCart();
  }

  function addFromModalCompose() {
    const prod = modalSelectedProd || productos.find((p) => p.id === prodIdInput?.value);
    if (!prod) {
      showToast('Sin producto', 'Elija un producto de la lista.', 'warning');
      return;
    }
    const precio = parseFloat(String(modalPrecio?.value || 0));
    const cant = parseInt(String(modalCant?.value || 0), 10);
    if (precio <= 0 || cant <= 0) {
      showToast('Datos incompletos', 'Indique precio y cantidad válidos.', 'warning');
      modalPrecio?.focus();
      return;
    }
    addProductoAlCarrito({
      productoId: prod.id,
      descripcion: prod.nombre,
      cantidad: cant,
      precioUnitario: precio,
      tieneIVA: prod.tieneIVA !== false
    });
    showToast('Producto agregado', `${prod.nombre} × ${cant}`, 'success');
    clearModalCompose({ clearForm: true });
    if (searchProd) {
      searchProd.value = '';
      renderProductoPicker('');
      searchProd.focus();
    }
  }

  function clearFormProducto() {
    if (prodIdInput) prodIdInput.value = '';
    if (prodDisplay) prodDisplay.value = '';
    if (prodIvaInput) prodIvaInput.value = '1';
    if (descInput) descInput.value = '';
    if (precioInput) precioInput.value = '';
  }

  btnBuscarProd?.addEventListener('click', () => openProductoPickerModal());
  prodDisplay?.addEventListener('click', () => openProductoPickerModal());

  if (modalProdEl && searchProd && listProd) {
    modalProdEl.addEventListener('shown.bs.modal', () => {
      searchProd.focus();
      searchProd.select?.();
    });

    searchProd.addEventListener('input', () => {
      renderProductoPicker(searchProd.value);
      if (pickerMatches.length) highlightPickerItem(0);
    });

    searchProd.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min((pickerActiveIdx < 0 ? -1 : pickerActiveIdx) + 1, pickerMatches.length - 1);
        if (next >= 0) highlightPickerItem(next);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!pickerMatches.length) return;
        highlightPickerItem(Math.max(pickerActiveIdx - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        if (pickerActiveIdx < 0 || !pickerMatches[pickerActiveIdx]) return;
        e.preventDefault();
        chooseProductoFromPicker(pickerMatches[pickerActiveIdx]);
      }
    });

    chipsProd?.addEventListener('click', (e) => {
      const chip = eventElement(e).closest<HTMLElement>('[data-categoria]');
      if (!chip) return;
      pickerCategoriaId = chip.getAttribute('data-categoria') || '';
      renderProductoPicker(searchProd.value);
      if (pickerMatches.length) highlightPickerItem(0);
      searchProd.focus();
    });

    listProd.addEventListener('click', (e) => {
      const item = eventElement(e).closest<HTMLElement>('[data-id]');
      if (!item) return;
      const prod = productos.find((p) => p.id === item.dataset.id);
      if (prod) chooseProductoFromPicker(prod);
    });

    modalAddBtn?.addEventListener('click', () => addFromModalCompose());
    document.getElementById('cot-modal-compose-cancel')?.addEventListener('click', () => {
      clearModalCompose({ clearForm: true });
    });
    modalCompose?.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      clearModalCompose({ clearForm: true });
    });
    [modalPrecio, modalCant].forEach((el) => {
      el?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        addFromModalCompose();
      });
    });
    modalCartList?.addEventListener('click', (e) => {
      const btn = eventElement(e).closest<HTMLElement>('.cot-modal-remove-item');
      if (!btn) return;
      const idx = parseInt(String(btn.dataset.idx), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= cotizacionCart.length) return;
      cotizacionCart.splice(idx, 1);
      renderCotCart();
    });
  }

  requireElement('btn-add-item-cot', HTMLButtonElement).addEventListener('click', () => {
    const desc = descInput?.value.trim() || '';
    const precio = parseFloat(String(precioInput?.value || 0));
    if (!desc || precio <= 0) {
      showToast('Datos incompletos', 'Indique descripción y precio unitario válido.', 'warning');
      return;
    }
    const prodId = prodIdInput?.value || null;
    const tieneIVA = prodId ? prodIvaInput?.value === '1' : true;
    addProductoAlCarrito({
      productoId: prodId,
      descripcion: desc,
      cantidad: 1,
      precioUnitario: precio,
      tieneIVA
    });
    clearFormProducto();
    showToast('Ítem agregado', desc, 'success');
  });

  function renderCotCart() {
    const tbody = requireElement('cot-cart-body', HTMLTableSectionElement);
    const totalEl = requireElement('cot-cart-total', HTMLElement);

    if (cotizacionCart.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-secondary">Ningún ítem agregado.</td></tr>`;
      totalEl.innerText = '$ 0';
      updateCotModalCartSummary();
      return;
    }

    let total = 0;
    tbody.innerHTML = cotizacionCart.map((item, idx) => {
      const subtotal = item.cantidad * item.precioUnitario;
      total += subtotal;
      return `
        <tr>
          <td>
            <strong>${escapeCotHtml(item.descripcion)}</strong>
            ${item.productoId ? `<br><span class="badge bg-blue-lt">Catálogo</span>${item.tieneIVA === false ? ' <span class="badge bg-secondary-lt">Sin IVA</span>' : ''}` : '<br><span class="badge bg-yellow-lt">Manual/Servicio</span>'}
          </td>
          <td>
            <input type="number" class="form-control form-control-sm input-cot-qty" data-idx="${idx}" value="${item.cantidad}" min="1">
          </td>
          <td class="text-end font-weight-medium">${formatter.format(item.precioUnitario)}</td>
          <td class="text-end fw-bold text-dark">${formatter.format(subtotal)}</td>
          <td>
            <button type="button" class="btn btn-sm btn-link link-danger btn-remove-item-cot" data-idx="${idx}" aria-label="Eliminar ítem"><i class="ti ti-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');

    totalEl.innerText = formatter.format(total);
    updateCotModalCartSummary();

    document.querySelectorAll('.input-cot-qty').forEach((input) => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(String(eventField(e).dataset.idx), 10);
        const qty = parseInt(eventField(e).value || '1', 10);
        cotizacionCart[idx].cantidad = qty > 0 ? qty : 1;
        renderCotCart();
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.btn-remove-item-cot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(String(btn.dataset.idx), 10);
        cotizacionCart.splice(idx, 1);
        renderCotCart();
      });
    });
  }

  // Submit Nueva Cotización
  requireElement('form-nueva-cotizacion', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();

    if (cotizacionCart.length === 0) {
      alert('Debe agregar al menos un ítem a la cotización.');
      return;
    }

    const payload: { clienteId: string; fechaVencimiento: string; notas: string; items: CotItem[]; sedeId?: string } = {
      clienteId: requireElement('cot-cliente', HTMLSelectElement).value,
      fechaVencimiento: requireElement('cot-vencimiento', HTMLInputElement).value,
      notas: requireElement('cot-notas', HTMLTextAreaElement).value,
      items: cotizacionCart
    };

    if (['admin', 'superadmin'].includes(usuario.rol) && requireElement('cot-sede', HTMLSelectElement)) {
      payload.sedeId = requireElement('cot-sede', HTMLSelectElement).value;
    }

    try {
      await apiFetch('/cotizaciones', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      alert('Cotización creada exitosamente.');
      cotizacionCart = [];
      requireElement('form-nueva-cotizacion', HTMLFormElement).reset();
      clearFormProducto();
      updateCotModalCartSummary();
      renderCotCart();
      
      // Cambiar a pestaña historial y recargar
      const trigger = document.querySelector('a[href="#tab-historial-cot"]');
      if (trigger) {
        bootstrap.Tab.getOrCreateInstance(trigger).show();
      }
      loadCotizaciones();

    } catch (err) {
      alert(errorMessage(err));
    }
  });

  // Cargar Historial
  const loadCotizaciones = async () => {
    const tbody = requireElement('cotizaciones-table-body', HTMLTableSectionElement);
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const q = requireElement('filtro-cot-buscar', HTMLInputElement).value;
      const estado = requireElement('filtro-cot-estado', HTMLSelectElement).value;

      const params = [];
      if (sedeId) params.push(`sede=${sedeId}`);
      if (q) params.push(`buscar=${q}`);
      if (estado) params.push(`estado=${estado}`);

      const query = params.length > 0 ? '?' + params.join('&') : '';
      const data = await apiRequired<CotizacionDTO[]>(`/cotizaciones${query}`);

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-secondary">No se encontraron cotizaciones.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(c => {
        let statusBadge = 'bg-secondary-lt';
        if (c.estado === 'aprobada') statusBadge = 'bg-success-lt';
        else if (c.estado === 'enviada') statusBadge = 'bg-blue-lt';
        else if (c.estado === 'rechazada') statusBadge = 'bg-red-lt';

        return `
          <tr>
            <td><strong>${c.numeroCotizacion}</strong></td>
            <td>${c.cliente ? c.cliente.nombre : 'Cliente General'}</td>
            <td>${new Date(c.fechaVencimiento ?? '').toLocaleDateString()}</td>
            <td class="text-end fw-bold text-dark">${formatter.format(Number(c.total))}</td>
            <td class="text-center"><span class="badge ${statusBadge} px-2 py-1">${c.estado.toUpperCase()}</span></td>
            <td class="text-end erp-td-actions">
              ${erpActions(`
                ${erpAction('view', { className: 'btn-view-cot', attrs: { 'data-id': c.id } })}
                ${erpAction('pdf', { className: 'btn-pdf-cot', attrs: { 'data-id': c.id, 'data-num': c.numeroCotizacion } })}
              `)}
            </td>
          </tr>
        `;
      }).join('');

      document.querySelectorAll('.btn-view-cot').forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
        btn.addEventListener('click', () => openDetalleCot(btn.dataset.id));
      });

      document.querySelectorAll('.btn-pdf-cot').forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const num = btn.dataset.num || id;
          try {
            btn.disabled = true;
            btn.innerHTML = '<i class="ti ti-loader-2 me-1"></i>Generando…';
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/cotizaciones/${id}/pdf`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('No se pudo generar el PDF de la cotización.');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cotizacion_${num}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
          } catch (e) {
            alert(errorMessage(e));
          } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ti ti-file-text me-1"></i>PDF';
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error: ${errorMessage(e)}</td></tr>`;
    }
  };

  requireElement('btn-filtrar-cot', HTMLButtonElement).addEventListener('click', loadCotizaciones);

  async function openDetalleCot(id: string | undefined) {
    if (!id) return;
    const content = requireElement('detalle-cot-content', HTMLDivElement);
    content.innerHTML = `<div class="modal-body text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;
    modalDetalle.show();

    try {
      const [c, config] = await Promise.all([
        apiRequired<CotizacionDTO>(`/cotizaciones/${id}`),
        apiRequired<EmpresaDocumento>('/config/sistema').catch(() => ({}))
      ]);

      content.innerHTML = `
        <div class="modal-header d-print-none">
          <h5 class="modal-title">Cotización <strong>${c.numeroCotizacion}</strong></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body cot-doc-modal-body">
          ${renderCotizacionDocumento(c, config)}
        </div>
        <div class="modal-footer d-print-none">
          ${c.estado !== 'aprobada' ? `
            <button type="button" id="btn-cobrar-pos-cot" class="btn btn-success me-auto">
              <i class="ti ti-shopping-cart me-1"></i> Cobrar en POS
            </button>
          ` : '<span class="me-auto"></span>'}
          <button type="button" class="btn btn-outline-secondary" id="btn-imprimir-cot">
            <i class="ti ti-printer me-1"></i> Imprimir
          </button>
          <button type="button" class="btn btn-primary" id="btn-pdf-cot-modal" data-id="${c.id}" data-num="${c.numeroCotizacion}">
            <i class="ti ti-file-text me-1"></i> Descargar PDF
          </button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
        </div>
      `;

      document.getElementById('btn-imprimir-cot')?.addEventListener('click', () => printCotizacionDocumento());

      document.getElementById('btn-pdf-cot-modal')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!(btn instanceof HTMLButtonElement)) return;
        const cotId = btn.dataset.id;
        const num = btn.dataset.num;
        try {
          btn.disabled = true;
          btn.innerHTML = '<i class="ti ti-loader-2 me-1"></i>Generando…';
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/cotizaciones/${cotId}/pdf`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!response.ok) throw new Error('No se pudo generar el PDF.');
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cotizacion_${num}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
        } catch (err) {
          alert(errorMessage(err));
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="ti ti-file-text me-1"></i> Descargar PDF';
        }
      });

      document.getElementById('btn-cobrar-pos-cot')?.addEventListener('click', () => {
        localStorage.setItem('pendingCotizacionId', c.id);
        modalDetalle.hide();
        window.location.hash = '#/pos';
      });
    } catch (err) {
      content.innerHTML = `<div class="modal-body text-danger py-4">${errorMessage(err)}</div>`;
    }
  }

  // Carga inicial
  await loadCotizaciones();
  watchDataChanges(container, ["productos","clientes","cotizaciones"], async () => {
    const [list, clients] = await Promise.all([apiRequired<ProductoDTO[]>('/productos'), apiRequired<ClienteDTO[]>('/clientes')]);
    productos = list.filter(p => p.activo !== false);
    clientes = clients;
    syncSelectOptions(requireElement('cot-cliente', HTMLSelectElement), clientes, c => `${c.nombre}${c.documento ? ` (${c.documento})` : ''}`);
    if (modalProdEl?.classList.contains('show')) renderProductoPicker(searchProd?.value || '');
    await loadCotizaciones();
  }, { allowDuringModal: true });

}

import { apiRequired } from '../utils/api-required.js';
import type { ClienteDTO, ProductoDTO, SedeDTO } from '../../../../shared/contracts.js';
import type { ConfigSistema } from '../types/config.js';
import type { ReparacionServicio, TecnicoServicio, CampoGuardado } from '../types/service.js';
import { eventField, eventElement, requireSelector, requireField } from '../utils/dom.js';
import { requireElement } from '../utils/dom.js';
import { errorMessage } from '../utils/errors.js';
import { watchDataChanges } from '../utils/live-data.js';
import { apiFetch } from '../api.js';
import { requireUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction } from '../utils/action-buttons.js';
import { showConfirm, showToast } from '../utils/toast.js';

export async function initReparaciones(container: HTMLElement) {
  const usuario = requireUsuario();
  const esTecnico = usuario.rol === 'tecnico';
  const esCajero = usuario.rol === 'cajero';
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  const needsSedePicker = !usuario.sedeId || ['admin', 'superadmin'].includes(usuario.rol);

  let ordenes: ReparacionServicio[] = [];
  let tecnicos: TecnicoServicio[] = [];
  let clientes: ClienteDTO[] = [];
  let productos: ProductoDTO[] = [];
  let sedes: SedeDTO[] = [];

  // Cargar datos iniciales
  async function loadData() {
    try {
      ordenes = await apiRequired<ReparacionServicio[]>('/reparaciones');
      tecnicos = await apiRequired<TecnicoServicio[]>('/config/usuarios-operativos?rol=tecnico').catch(() => []);
      clientes = await apiRequired<ClienteDTO[]>('/clientes').catch(() => []);
      productos = await apiRequired<ProductoDTO[]>('/productos').then(prods => prods.filter(p => p.activo !== false));
      if (needsSedePicker) {
        sedes = await apiRequired<SedeDTO[]>('/config/sedes').catch(() => []);
      }
    } catch (error) {
      console.error('Error al cargar datos de reparaciones:', error);
    }
  }

  await loadData();

  // Evitar modal/backdrop huérfanos y fixed roto dentro de .erp-module
  ['modal-orden-reparacion', 'modal-detalle-orden', 'modal-entregar-reparacion'].forEach((id) => {
    document.getElementById(id)?.remove();
  });
  document.querySelectorAll<HTMLElement>('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');

  const defaultSedeId = usuario.sedeId || (sedes[0]?.id || '');

  container.innerHTML = `
    <div class="container-xl erp-module rep-module">
      ${erpHeader({
        eyebrow: 'Taller',
        title: 'Reparaciones y órdenes',
        subtitle: 'Servicio técnico por sede y estado de cada orden',
        actionsHtml: `
          <div class="rep-header-tools">
            <div class="rep-search-wrap">
              <i class="ti ti-search rep-search-wrap__icon" aria-hidden="true"></i>
              <input type="search" id="kanban-search" class="form-control" placeholder="Buscar orden, IMEI o cliente…" spellcheck="false" autocomplete="off">
            </div>
            ${!esTecnico ? `
              <button type="button" id="btn-nueva-orden" class="btn btn-primary">
                <i class="ti ti-plus me-2"></i> Nueva orden
              </button>
            ` : ''}
          </div>
        `
      })}

      <div class="rep-toolbar" aria-label="Controles del tablero">
        <div class="rep-toolbar__views" role="tablist" aria-label="Vista del tablero">
          <button type="button" class="rep-view-btn is-active" data-view="activas" role="tab" aria-selected="true">En taller</button>
          <button type="button" class="rep-view-btn" data-view="todas" role="tab" aria-selected="false">Todas</button>
          <button type="button" class="rep-view-btn" data-view="archivo" role="tab" aria-selected="false">Archivo</button>
        </div>
        <div class="rep-toolbar__stats" id="rep-board-stats" aria-live="polite"></div>
      </div>

      <div class="rep-kanban-board rep-kanban-board--view-activas" role="region" aria-label="Tablero de reparaciones">
        <div class="rep-kanban-track">
        ${renderKanbanColumn('Recibido', 'recibido', 'rep-kanban-col--recibido', 'active', 'ti-inbox')}
        ${renderKanbanColumn('En diagnóstico', 'diagnostico', 'rep-kanban-col--diagnostico', 'active', 'ti-search')}
        ${renderKanbanColumn('En reparación', 'en_reparacion', 'rep-kanban-col--reparacion', 'active', 'ti-tool')}
        ${renderKanbanColumn('Listo para entrega', 'listo', 'rep-kanban-col--listo', 'active', 'ti-package-export')}
        ${renderKanbanColumn('Entregado', 'entregado', 'rep-kanban-col--entregado', 'archive', 'ti-circle-check')}
        ${renderKanbanColumn('Cancelado', 'cancelado', 'rep-kanban-col--cancelado', 'archive', 'ti-circle-x')}
        </div>
      </div>
    </div>

    <!-- Modal Registrar Orden (ui 3.0.7 — form is the scroll container; sticky header/footer) -->
    <div class="modal modal-blur fade" id="modal-orden-reparacion" tabindex="-1" role="dialog" aria-hidden="true" data-rep-orden-ui="3.0.7">
      <!-- No modal-dialog-scrollable: form wraps header/body/footer and breaks Bootstrap's height chain -->
      <div class="modal-dialog modal-xl" role="document">
        <div class="modal-content rep-orden-modal">
          <form id="form-nueva-orden" class="rep-orden-form">
            <div class="modal-header rep-orden-modal__header">
              <div class="rep-orden-modal__heading">
                <p class="rep-orden-modal__eyebrow">Ticket de taller</p>
                <h5 class="modal-title">Nueva orden de ingreso</h5>
                <p class="rep-orden-modal__lede">Registra cliente, equipo y condiciones en un solo paso.</p>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body rep-orden-modal__body">
              <div class="rep-orden-layout">
                <section class="rep-orden-rail" aria-labelledby="rep-orden-cliente-title">
                  <header class="rep-orden-section-head">
                    <span class="rep-orden-section-head__mark" aria-hidden="true">01</span>
                    <div>
                      <h4 id="rep-orden-cliente-title" class="rep-orden-section-head__title">Cliente</h4>
                      <p class="rep-orden-section-head__hint">Elige uno existente o crea el contacto aquí.</p>
                    </div>
                  </header>
                  <div class="rep-orden-field">
                    <label class="form-label" for="btn-buscar-cliente-orden">Cliente existente</label>
                    <input type="hidden" id="orden-cliente-select" value="">
                    <button type="button" id="btn-buscar-cliente-orden" class="btn btn-outline-secondary w-100 text-start d-flex align-items-center justify-content-between"><span id="orden-cliente-nombre">Seleccionar o crear nuevo abajo</span><i class="ti ti-search"></i></button>
                  </div>
                  <div class="rep-orden-panel" id="quick-client-card">
                    <div class="rep-orden-panel__bar">
                      <span class="rep-orden-panel__label">Nuevo cliente</span>
                    </div>
                    <div class="rep-orden-field">
                      <label class="form-label required" for="cli-nombre">Nombre completo</label>
                      <input type="text" id="cli-nombre" class="form-control" autocomplete="name">
                    </div>
                    <div class="rep-orden-field-grid">
                      <div class="rep-orden-field">
                        <label class="form-label" for="cli-documento">Cédula / NIT</label>
                        <input type="text" id="cli-documento" class="form-control" autocomplete="off">
                      </div>
                      <div class="rep-orden-field">
                        <label class="form-label" for="cli-telefono">Teléfono</label>
                        <input type="text" id="cli-telefono" class="form-control" autocomplete="tel">
                      </div>
                    </div>
                    <div class="rep-orden-field">
                      <label class="form-label" for="cli-email">Correo electrónico</label>
                      <input type="email" id="cli-email" class="form-control" spellcheck="false" autocomplete="email">
                    </div>
                  </div>
                </section>

                <section class="rep-orden-rail rep-orden-rail--equipo" aria-labelledby="rep-orden-equipo-title">
                  <header class="rep-orden-section-head">
                    <span class="rep-orden-section-head__mark" aria-hidden="true">02</span>
                    <div>
                      <h4 id="rep-orden-equipo-title" class="rep-orden-section-head__title">Equipo</h4>
                      <p class="rep-orden-section-head__hint">Qué llega, dónde se atiende y qué falla.</p>
                    </div>
                  </header>

                  <div class="rep-orden-field-grid ${needsSedePicker ? '' : 'rep-orden-field-grid--solo'}">
                    ${needsSedePicker ? `
                    <div class="rep-orden-field">
                      <label class="form-label required" for="eq-sede">Sede de ingreso</label>
                      <select id="eq-sede" class="form-select" required>
                        ${sedes.length === 0 ? '<option value="">Sin sedes configuradas</option>' : sedes.map(s => `<option value="${s.id}" ${s.id === defaultSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                      </select>
                    </div>
                    ` : ''}
                    <div class="rep-orden-field">
                      <label class="form-label">Modalidad</label>
                      <div class="rep-orden-mode" role="group" aria-label="Modalidad de servicio">
                        <input type="radio" class="btn-check" name="eq-modalidad" id="eq-mod-taller" value="taller" checked>
                        <label class="rep-orden-mode__btn" for="eq-mod-taller">
                          <i class="ti ti-building-warehouse" aria-hidden="true"></i>
                          En taller
                        </label>
                        <input type="radio" class="btn-check" name="eq-modalidad" id="eq-mod-domicilio" value="domicilio">
                        <label class="rep-orden-mode__btn" for="eq-mod-domicilio">
                          <i class="ti ti-bike" aria-hidden="true"></i>
                          A domicilio
                        </label>
                      </div>
                    </div>
                  </div>

                  <div class="rep-orden-field d-none" id="eq-direccion-wrap">
                    <label class="form-label required" for="eq-direccion">Dirección del servicio</label>
                    <input type="text" id="eq-direccion" class="form-control" placeholder="Calle, barrio, referencias">
                  </div>

                  <div class="rep-orden-field-grid">
                    <div class="rep-orden-field">
                      <label class="form-label required" for="eq-tipo">Tipo de equipo</label>
                      <input type="text" id="eq-tipo" class="form-control" placeholder="Celular, laptop, consola…" required>
                    </div>
                    <div class="rep-orden-field">
                      <label class="form-label required" for="eq-marca">Marca</label>
                      <input type="text" id="eq-marca" class="form-control" placeholder="Apple, Dell, Sony…" required>
                    </div>
                    <div class="rep-orden-field">
                      <label class="form-label required" for="eq-modelo">Modelo</label>
                      <input type="text" id="eq-modelo" class="form-control" placeholder="iPhone 15, Latitude…" required>
                    </div>
                    <div class="rep-orden-field">
                      <label class="form-label" for="eq-imei">Serial / IMEI</label>
                      <input type="text" id="eq-imei" class="form-control" placeholder="Trazabilidad del equipo">
                    </div>
                  </div>

                  <div class="rep-orden-field">
                    <label class="form-label required" for="eq-problema">Problema reportado</label>
                    <textarea id="eq-problema" class="form-control" rows="2" placeholder="Describe la falla en palabras del cliente…" required spellcheck="false"></textarea>
                  </div>

                  <div class="rep-orden-band">
                    <header class="rep-orden-section-head rep-orden-section-head--compact">
                      <span class="rep-orden-section-head__mark" aria-hidden="true">03</span>
                      <div>
                        <h4 class="rep-orden-section-head__title">Condiciones</h4>
                        <p class="rep-orden-section-head__hint">Estimación, garantía y recepción.</p>
                      </div>
                    </header>
                    <div class="rep-orden-field-grid">
                      <div class="rep-orden-field">
                        <label class="form-label" for="eq-mano-obra">Mano de obra (COP)</label>
                        <input type="number" id="eq-mano-obra" class="form-control" placeholder="0" min="0" value="0">
                      </div>
                      <div class="rep-orden-field">
                        <label class="form-label" for="eq-garantia">Días de garantía</label>
                        <input type="number" id="eq-garantia" class="form-control" min="0" value="30">
                      </div>
                      <div class="rep-orden-field">
                        <label class="form-label" for="eq-fecha-entrega">Entrega estimada</label>
                        <input type="date" id="eq-fecha-entrega" class="form-control">
                      </div>
                      <div class="rep-orden-field">
                        <label class="form-label" for="eq-tecnico">Técnico</label>
                        <select id="eq-tecnico" class="form-select">
                          <option value="">Por asignar</option>
                          ${tecnicos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
                        </select>
                      </div>
                    </div>
                    <div class="rep-orden-field">
                      <label class="form-label" for="eq-observaciones">Estado físico al recibir</label>
                      <input type="text" id="eq-observaciones" class="form-control" placeholder="Rayones, golpes, accesorios incluidos…">
                    </div>
                    <div class="rep-orden-field">
                      <label class="form-label" for="eq-fotos">Fotos de recepción</label>
                      <input type="file" id="eq-fotos" class="form-control" multiple accept="image/*">
                    </div>
                  </div>
                </section>
              </div>
            </div>
            <div class="modal-footer rep-orden-modal__footer">
              <button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary rep-orden-modal__submit">
                <i class="ti ti-clipboard-check me-1" aria-hidden="true"></i>Registrar ingreso
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Detalle/Editar Orden -->
    <div class="modal modal-blur fade" id="modal-detalle-orden" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
        <div class="modal-content" id="detalle-orden-content">
          <!-- Se carga dinámicamente -->
        </div>
      </div>
    </div>

    <!-- Modal Entregar/Cobrar Reparación -->
    <div class="modal modal-blur fade" id="modal-entregar-reparacion" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document">
        <form id="form-entregar-reparacion" class="modal-content shadow-lg">
          <input type="hidden" id="entregar-id">
          <div class="modal-header">
            <h5 class="modal-title fw-bold">Cobrar y Entregar Reparación</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-6 border-end">
                <p class="text-secondary small mb-3">La orden pasará al estado <strong>Entregado</strong> y se generará la factura correspondiente. Por favor confirme los datos del cobro.</p>
                <div class="mb-2">
                  <label class="form-label fw-bold">Orden N°</label>
                  <input type="text" id="entregar-numero" class="form-control-plaintext fw-bold text-blue py-0" readonly>
                </div>
                <div class="mb-2">
                  <label class="form-label fw-bold">Cliente</label>
                  <input type="text" id="entregar-cliente" class="form-control-plaintext py-0" readonly>
                </div>
                <div class="mt-4 alert alert-info py-2 mb-0">
                  <div class="fs-4 fw-bold">Total a Cobrar:</div>
                  <div class="h2 mb-0 fw-bold text-primary" id="entregar-total-txt">$ 0</div>
                </div>
                <label class="form-check form-switch mt-3 mb-0">
                  <input class="form-check-input" type="checkbox" id="entregar-credito">
                  <span class="form-check-label fw-bold text-primary">Entregar con saldo a crédito</span>
                </label>
                <div class="text-secondary small mt-1" id="entregar-credito-ayuda">El saldo pendiente se registrará en la cartera del cliente.</div>
              </div>
              <div class="col-md-6">
                <h4 class="mb-3 text-secondary">Desglose de Pago (Mixto)</h4>
                <div class="row g-2">
                  <div class="col-6 mb-2">
                    <label class="form-label small mb-1">Efectivo Recibido</label>
                    <input type="number" id="entregar-pay-efectivo" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                  <div class="col-6 mb-2">
                    <label class="form-label small mb-1">Nequi</label>
                    <input type="number" id="entregar-pay-nequi" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                  <div class="col-6 mb-2">
                    <label class="form-label small mb-1">Daviplata</label>
                    <input type="number" id="entregar-pay-daviplata" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                  <div class="col-6 mb-2">
                    <label class="form-label small mb-1">Tarjeta</label>
                    <input type="number" id="entregar-pay-tarjeta" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                  <div class="col-12 mb-2">
                    <label class="form-label small mb-1">Transferencia Bancaria</label>
                    <input type="number" id="entregar-pay-transferencia" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                </div>
              </div>
            </div>
            
            <div class="alert alert-secondary mt-3 mb-0 py-2">
              <div class="row align-items-center">
                <div class="col">
                  <div class="fs-5 text-secondary">Total Ingresado:</div>
                  <div class="h3 mb-0" id="entregar-total-ingresado">$ 0</div>
                </div>
                <div class="col-auto text-end">
                  <div class="fs-5 text-secondary" id="entregar-label-cambio">Cambio (Vuelto):</div>
                  <div class="h3 mb-0 text-success fw-bold" id="entregar-cambio">$ 0</div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-success ms-auto" id="entregar-submit-btn" disabled><i class="ti ti-check me-1"></i>Cobrar y Entregar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Montar modales en body para que el footer no quede cortado por overflow del módulo
  ['modal-orden-reparacion', 'modal-detalle-orden', 'modal-entregar-reparacion', 'modal-buscar-cliente-orden'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  });

  document.body.insertAdjacentHTML('beforeend', `<div class="modal modal-blur fade" id="modal-buscar-cliente-orden" tabindex="-1"><div class="modal-dialog modal-dialog-centered modal-dialog-scrollable pos-client-search-dialog"><div class="modal-content pos-client-search-modal"><div class="modal-header pos-client-search-header"><div class="d-flex align-items-center gap-2"><span class="avatar avatar-sm bg-primary-lt text-primary"><i class="ti ti-users"></i></span><div><h5 class="modal-title">Buscar cliente</h5><div class="text-secondary small">Selecciona quién trae el equipo</div></div></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pos-client-search-body"><div class="input-icon"><span class="input-icon-addon"><i class="ti ti-search"></i></span><input type="search" id="orden-cliente-busqueda" class="form-control form-control-lg" placeholder="Nombre, documento o teléfono"></div><div class="d-flex justify-content-between mt-4 mb-2"><span class="text-secondary small fw-semibold text-uppercase">Resultados</span><span id="orden-clientes-contador" class="text-secondary small"></span></div><div id="orden-clientes-resultados" class="pos-client-results"></div></div></div></div></div>`);
  const modalOrden = new bootstrap.Modal(requireElement('modal-orden-reparacion', HTMLDivElement));
  const modalDetalle = new bootstrap.Modal(requireElement('modal-detalle-orden', HTMLDivElement));
  const modalEntregar = new bootstrap.Modal(requireElement('modal-entregar-reparacion', HTMLDivElement));
  const modalBuscarCliente = new bootstrap.Modal(requireElement('modal-buscar-cliente-orden', HTMLDivElement));

  // Renderizar columnas de Kanban
  function renderKanbanColumn(title: string, statusKey: string, colorClass: string, phase = 'active', icon = 'ti-circle') {
    return `
      <div class="rep-kanban-col ${colorClass}" data-phase="${phase}" data-status-col="${statusKey}">
        <div class="rep-kanban-col__head">
          <h3 class="rep-kanban-col__title"><i class="ti ${icon}" aria-hidden="true"></i>${title}</h3>
          <span class="rep-kanban-col__count" id="badge-count-${statusKey}">0</span>
        </div>
        <div class="rep-kanban-col__body kanban-col" data-status="${statusKey}">
        </div>
      </div>
    `;
  }

  let boardView = 'activas';

  function applyBoardView() {
    const board = document.querySelector('.rep-kanban-board');
    if (!board) return;

    board.classList.remove('rep-kanban-board--view-activas', 'rep-kanban-board--view-todas', 'rep-kanban-board--view-archivo');
    board.classList.add(`rep-kanban-board--view-${boardView}`);

    document.querySelectorAll<HTMLElement>('.rep-kanban-col').forEach((col) => {
      const phase = col.dataset.phase;
      let visible = true;
      if (boardView === 'activas') visible = phase === 'active';
      else if (boardView === 'archivo') visible = phase === 'archive';
      col.classList.toggle('d-none', !visible);
      col.setAttribute('aria-hidden', String(!visible));
    });

    document.querySelectorAll<HTMLElement>('.rep-view-btn').forEach((btn) => {
      const active = btn.dataset.view === boardView;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  function updateBoardStats(counts: Record<ReparacionServicio['estado'], number>) {
    const statsEl = requireElement('rep-board-stats', HTMLDivElement);
    if (!statsEl) return;

    const enTaller = counts.recibido + counts.diagnostico + counts.en_reparacion;
    const activas = enTaller + counts.listo;

    statsEl.innerHTML = `
      <span class="rep-stat-pill"><strong>${activas}</strong> activas</span>
      <span class="rep-stat-pill rep-stat-pill--bench"><strong>${enTaller}</strong> en proceso</span>
      <span class="rep-stat-pill rep-stat-pill--ready"><strong>${counts.listo}</strong> por entregar</span>
      <span class="rep-stat-pill rep-stat-pill--done"><strong>${counts.entregado}</strong> cerradas</span>
    `;
  }

  // Cargar las tarjetas en el Kanban
  function fillKanban(searchQuery = '') {
    // Reset lists
    document.querySelectorAll<HTMLElement>('.kanban-col').forEach(col => col.innerHTML = '');
    const counts = { recibido: 0, diagnostico: 0, en_reparacion: 0, listo: 0, entregado: 0, cancelado: 0 };

    const query = searchQuery.toLowerCase().trim();

    ordenes.forEach(o => {
      // Filtrar
      if (query) {
        const num = o.numeroOrden.toLowerCase();
        const client = o.cliente ? o.cliente.nombre.toLowerCase() : '';
        const imei = o.imei ? o.imei.toLowerCase() : '';
        const equipo = `${o.tipoEquipo} ${o.marca} ${o.modelo}`.toLowerCase();
        if (!num.includes(query) && !client.includes(query) && !imei.includes(query) && !equipo.includes(query)) {
          return;
        }
      }

      const col = document.querySelector(`.kanban-col[data-status="${o.estado}"]`);
      if (col) {
        counts[o.estado]++;
        const card = document.createElement('div');
        card.className = 'rep-card drag-card';
        card.draggable = true;
        card.dataset.id = o.id;

        const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

        const clienteNombre = o.cliente ? o.cliente.nombre : 'Cliente general';
        const equipoLabel = `${o.tipoEquipo} ${o.marca} ${o.modelo}`.trim();

        card.innerHTML = `
          <div class="rep-card__top">
            <span class="rep-card__orden">${o.numeroOrden}</span>
            <span class="rep-card__fecha">${new Date(o.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
          </div>
          <div class="rep-card__equipo" title="${equipoLabel}">${equipoLabel}</div>
          <div class="rep-card__meta" title="${clienteNombre}">
            <i class="ti ti-user" aria-hidden="true"></i>
            <span>${clienteNombre}</span>
          </div>
          ${o.imei ? `<div class="rep-card__meta" title="IMEI/Serie: ${o.imei}"><i class="ti ti-device-mobile" aria-hidden="true"></i><span>${o.imei}</span></div>` : ''}
          <div class="rep-card__footer">
            <div class="rep-card__tec ${o.tecnico ? '' : 'rep-card__tec--unassigned'}">
              <i class="ti ti-tool" aria-hidden="true"></i>
              ${o.tecnico ? o.tecnico.nombre.split(' ')[0] : 'Sin asignar'}
            </div>
            <div class="rep-card__total">${formatter.format(Number(o.totalCobrado))}</div>
          </div>
          <div class="rep-card__actions">
            ${erpAction('view', { className: 'btn-ver-orden-rep', attrs: { 'data-id': o.id }, label: 'Ver' })}
          </div>
        `;

        card.addEventListener('click', (e) => {
          if (eventElement(e).closest<HTMLElement>('.erp-action-btn')) return;
          openDetalle(o.id);
        });

        card.querySelector('.btn-ver-orden-rep')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openDetalle(o.id);
        });

        // Drag events
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer?.setData('text/plain', o.id);
          card.classList.add('opacity-50');
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('opacity-50');
        });

        col.appendChild(card);
      }
    });

    // Update badges
    for (const [status, count] of Object.entries(counts)) {
      const badge = document.getElementById(`badge-count-${status}`);
      if (badge) badge.textContent = String(count);
    }

    document.querySelectorAll<HTMLElement>('.kanban-col').forEach((col) => {
      const kanbanColumn = col.closest('.rep-kanban-col');
      const hasOrders = Boolean(col.querySelector('.rep-card'));
      kanbanColumn?.classList.toggle('is-empty', !hasOrders);
      if (hasOrders) return;
      col.innerHTML = '<div class="rep-kanban-empty"><i class="ti ti-inbox-off" aria-hidden="true"></i><span>Sin órdenes en esta etapa</span></div>';
    });

    updateBoardStats(counts);
  }

  // Setup drag & drop columns
  document.querySelectorAll<HTMLElement>('.kanban-col').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('rep-kanban-col__body--dragover');
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('rep-kanban-col__body--dragover');
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('rep-kanban-col__body--dragover');
      const orderId = e.dataTransfer?.getData('text/plain') || '';
      const newStatus = col.dataset.status;

      if (newStatus === 'entregado') {
        openEntregarReparacionModal(orderId);
        return;
      }

      try {
        const res = await apiFetch(`/reparaciones/${orderId}/estado`, {
          method: 'PUT',
          body: JSON.stringify({ estado: newStatus })
        });
        // Actualizar local y recargar
        const idx = ordenes.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          if (newStatus && ['recibido','diagnostico','en_reparacion','listo','entregado','cancelado'].includes(newStatus)) ordenes[idx].estado = newStatus as ReparacionServicio['estado'];
        }
        fillKanban(requireElement('kanban-search', HTMLInputElement).value);
      } catch (err) {
        alert('Error al cambiar de estado: ' + errorMessage(err));
      }
    });
  });

  fillKanban();
  applyBoardView();

  document.querySelectorAll<HTMLElement>('.rep-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      boardView = btn.dataset.view || 'activas';
      applyBoardView();
    });
  });

  // Search input
  requireElement('kanban-search', HTMLInputElement).addEventListener('input', (e) => {
    fillKanban(eventField(e).value);
  });

  // Toggle quick client input based on select
  const clientSelect = requireElement('orden-cliente-select', HTMLInputElement);
  const quickClientCard = requireElement('quick-client-card', HTMLDivElement);
  const cliNombre = requireElement('cli-nombre', HTMLInputElement);

  const renderClientesOrden = (query = '') => {
    const term = query.trim().toLowerCase();
    const results = clientes.filter((c) => !term || `${c.nombre || ''} ${c.documento || ''} ${c.telefono || ''}`.toLowerCase().includes(term)).slice(0, 50);
    requireElement('orden-clientes-contador', HTMLSpanElement).textContent = `${results.length} ${results.length === 1 ? 'cliente' : 'clientes'}`;
    const list = requireElement('orden-clientes-resultados', HTMLDivElement);
    list.innerHTML = results.map((c) => `<button type="button" class="checkout-cliente-opcion orden-cliente-opcion" data-id="${c.id}"><span class="avatar avatar-sm checkout-cliente-avatar">${(c.nombre || '?').trim().charAt(0).toUpperCase()}</span><span class="checkout-cliente-info"><span class="checkout-cliente-titulo">${c.nombre || 'Sin nombre'}</span><span class="checkout-cliente-meta"><i class="ti ti-id-badge"></i>${c.documento || 'Sin documento'}</span></span><i class="ti ti-chevron-right checkout-cliente-arrow"></i></button>`).join('') || '<div class="pos-client-empty"><i class="ti ti-user-off"></i><span>No se encontraron clientes.</span></div>';
    list.querySelectorAll<HTMLElement>('.orden-cliente-opcion').forEach((btn) => btn.addEventListener('click', () => {
      const client = clientes.find((c) => String(c.id) === btn.dataset.id);
      clientSelect.value = client?.id || '';
      requireElement('orden-cliente-nombre', HTMLSpanElement).textContent = client?.nombre || 'Seleccionar o crear nuevo abajo';
      clientSelect.dispatchEvent(new Event('change'));
      modalBuscarCliente.hide();
    }));
  };
  requireElement('btn-buscar-cliente-orden', HTMLButtonElement).addEventListener('click', () => {
    const input = requireElement('orden-cliente-busqueda', HTMLInputElement); input.value = ''; renderClientesOrden(); modalBuscarCliente.show(); setTimeout(() => input.focus(), 150);
  });
  requireElement('orden-cliente-busqueda', HTMLInputElement).addEventListener('input', (event) => renderClientesOrden(eventField(event).value));

  clientSelect.addEventListener('change', () => {
    if (clientSelect.value) {
      quickClientCard.style.display = 'none';
      cliNombre.removeAttribute('required');
    } else {
      quickClientCard.style.display = '';
      cliNombre.setAttribute('required', 'true');
    }
  });

  const syncModalidadUi = () => {
    const isDomicilio = document.querySelector<HTMLInputElement>('#eq-mod-domicilio')?.checked;
    const wrap = requireElement('eq-direccion-wrap', HTMLDivElement);
    const input = requireElement('eq-direccion', HTMLInputElement);
    if (!wrap || !input) return;
    wrap.classList.toggle('d-none', !isDomicilio);
    if (isDomicilio) input.setAttribute('required', 'true');
    else {
      input.removeAttribute('required');
      input.value = '';
    }
  };
  document.getElementById('eq-mod-taller')?.addEventListener('change', syncModalidadUi);
  document.querySelector<HTMLInputElement>('#eq-mod-domicilio')?.addEventListener('change', syncModalidadUi);

  // Open Nueva Orden Modal
  const btnNueva = document.querySelector<HTMLButtonElement>('#btn-nueva-orden');
  if (btnNueva) {
    btnNueva.addEventListener('click', () => {
      requireElement('form-nueva-orden', HTMLFormElement).reset();
      requireElement('orden-cliente-nombre', HTMLSpanElement).textContent = 'Seleccionar o crear nuevo abajo';
      quickClientCard.style.display = '';
      cliNombre.setAttribute('required', 'true');
      syncModalidadUi();
      modalOrden.show();
    });
  }

  // Submit Nueva Orden
  requireElement('form-nueva-orden', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = e.submitter;
    if (!(btnSubmit instanceof HTMLButtonElement)) return;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Registrando…`;

    try {
      let clienteId = clientSelect.value;

      // 1. Si no hay cliente seleccionado, crearlo primero
      if (!clienteId) {
        const nombre = cliNombre.value;
        const documento = requireElement('cli-documento', HTMLInputElement).value;
        const telefono = requireElement('cli-telefono', HTMLInputElement).value;
        const email = requireElement('cli-email', HTMLInputElement).value;

        if (!nombre) throw new Error('Nombre del cliente es requerido.');

        const cliPayload: {nombre: string; documento: string; telefono: string; email: string; sedeId?: string} = { nombre, documento, telefono, email };
        if (needsSedePicker) {
          const sedeVal = document.querySelector<HTMLSelectElement>('#eq-sede')?.value;
          if (sedeVal) cliPayload.sedeId = sedeVal;
        }

        const cli = await apiRequired<ClienteDTO>('/clientes', {
          method: 'POST',
          body: JSON.stringify(cliPayload)
        });
        clienteId = cli.id;
      }

      // 2. Crear orden
      const modalidad = document.querySelector<HTMLInputElement>('input[name="eq-modalidad"]:checked')?.value || 'taller';
      const direccionServicio = document.querySelector<HTMLInputElement>('#eq-direccion')?.value?.trim() || '';
      if (modalidad === 'domicilio' && !direccionServicio) {
        throw new Error('La dirección es obligatoria para servicio a domicilio.');
      }

      const payload = { sedeId: undefined as string | undefined,
        clienteId,
        tipoEquipo: requireElement('eq-tipo', HTMLInputElement).value,
        marca: requireElement('eq-marca', HTMLInputElement).value,
        modelo: requireElement('eq-modelo', HTMLInputElement).value,
        imei: requireElement('eq-imei', HTMLInputElement).value,
        problemaReportado: requireElement('eq-problema', HTMLTextAreaElement).value,
        costoManoObra: requireElement('eq-mano-obra', HTMLInputElement).value || 0,
        diasGarantia: requireElement('eq-garantia', HTMLInputElement).value || 30,
        fechaEstimadaEntrega: requireElement('eq-fecha-entrega', HTMLInputElement).value || null,
        tecnicoId: requireElement('eq-tecnico', HTMLSelectElement).value || null,
        observaciones: requireElement('eq-observaciones', HTMLInputElement).value || '',
        modalidad,
        direccionServicio: modalidad === 'domicilio' ? direccionServicio : null
      };

      if (needsSedePicker) {
        const sedeVal = document.querySelector<HTMLSelectElement>('#eq-sede')?.value;
        if (!sedeVal) throw new Error('Debe seleccionar la sede de ingreso.');
        payload.sedeId = sedeVal;
      }

      const ordenNueva = await apiRequired<ReparacionServicio>('/reparaciones', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // 3. Subir fotos si se seleccionaron
      const fileInput = requireElement('eq-fotos', HTMLInputElement);
      if (fileInput.files && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('momento', 'recepcion');
        for (let i = 0; i < (fileInput.files?.length || 0); i++) {
          formData.append('fotos', fileInput.files[i]);
        }
        await apiFetch(`/reparaciones/${ordenNueva.id}/fotos`, {
          method: 'POST',
          body: formData
        });
      }

      modalOrden.hide();
      await loadData();
      fillKanban(requireElement('kanban-search', HTMLInputElement).value);
    } catch (err) {
      alert('Error al registrar orden: ' + errorMessage(err));
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<i class="ti ti-clipboard-check me-1" aria-hidden="true"></i>Registrar ingreso`;
    }
  });

  // Modal Detalle
  async function openDetalle(id: string) {
    const content = requireElement('detalle-orden-content', HTMLDivElement);
    content.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-secondary">Cargando detalles de la orden…</div></div>`;
    modalDetalle.show();

    try {
      const orden = await apiRequired<ReparacionServicio>(`/reparaciones/${id}`);
      const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
      const canEditRepuestos = (isAdminOrGerente || esTecnico) && !['entregado', 'cancelado'].includes(orden.estado);
      const captureFields = (): CampoGuardado[] => [...requireElement('form-update-detalle', HTMLFormElement).elements]
        .filter((input): input is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)
        .filter(input => input.id).map(input => ({id: input.id, value: input.value, checked: input instanceof HTMLInputElement ? input.checked : undefined}));
      const refreshDetalle = async (fields: CampoGuardado[]) => {
        await loadData();
        if (window.location.hash.split('?')[0] !== '#/reparaciones') return;
        fillKanban(requireElement('kanban-search', HTMLInputElement).value);
        await openDetalle(id);
        for (const field of fields) {
          const input = document.getElementById(field.id);
          if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) { input.value = field.value; if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = !!field.checked; }
        }
      };
      const guardarCosto = async (button: HTMLButtonElement) => {
        const input = requireSelector('.repuesto-costo', HTMLInputElement, button.closest('td') || button);
        if (!input.reportValidity()) return;
        const fields = captureFields();
        button.disabled = true;
        input.disabled = true;
        try {
          const result = await apiRequired<{message: string}>(`/reparaciones/${id}/repuestos/${encodeURIComponent(button.dataset.repuestoId || '')}`, {
            method: 'PUT', body: JSON.stringify({ costoUnitario: Number(input.value) })
          });
          showToast('Costo actualizado', result.message, 'success');
          await refreshDetalle(fields);
        } catch (error) {
          button.disabled = false;
          input.disabled = false;
          showToast('No se pudo actualizar el costo', errorMessage(error), 'error');
        }
      };
      const retirarRepuesto = async (button: HTMLButtonElement, closePicker?: () => void) => {
        if (!await showConfirm('Retirar repuesto', 'Se devolverá la cantidad asignada al inventario de esta sede y se ajustará el total de la reparación.')) return;
        const fields = captureFields();
        button.disabled = true;
        try {
          const result = await apiRequired<{message: string}>(`/reparaciones/${id}/repuestos/${encodeURIComponent(button.dataset.repuestoId || '')}`, { method: 'DELETE' });
          closePicker?.();
          showToast('Repuesto retirado', result.message, 'success');
          await refreshDetalle(fields);
        } catch (error) {
          button.disabled = false;
          showToast('No se pudo retirar el repuesto', errorMessage(error), 'error');
        }
      };

      content.innerHTML = `
        <div class="modal-header">
          <h5 class="modal-title">Detalle de Reparación: <span class="badge bg-blue text-white">${orden.numeroOrden}</span></h5>
          <div class="ms-auto d-flex align-items-center">
            <button id="det-pdf-btn" class="btn btn-outline-primary btn-sm me-2">
              <i class="ti ti-file-text me-1"></i> Recibo PDF
            </button>
            <button id="det-qr-btn" class="btn btn-outline-secondary btn-sm me-2">
              <i class="ti ti-qrcode me-1"></i> Etiqueta QR
            </button>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body">
          <div class="row">
            <!-- Columna Ficha e Info -->
            <div class="col-md-5 border-end">
              <h4 class="text-primary mb-3"><i class="ti ti-info-circle me-1"></i>Ficha del Equipo</h4>
              <table class="table table-sm table-striped">
                <tbody>
                  <tr><th style="width: 130px;">Cliente</th><td>${orden.cliente ? orden.cliente.nombre : 'Cliente General'}</td></tr>
                  <tr><th>Teléfono</th><td>${orden.cliente ? orden.cliente.telefono || 'No registrado' : 'N/A'}</td></tr>
                  <tr><th>Equipo</th><td>${orden.tipoEquipo} ${orden.marca} ${orden.modelo}</td></tr>
                  <tr><th>IMEI/Serie</th><td><strong>${orden.imei || 'N/A'}</strong></td></tr>
                  <tr><th>Sede de Ingreso</th><td>${orden.sede ? orden.sede.nombre : 'Sede Centro'}</td></tr>
                  <tr><th>Modalidad</th><td>${orden.modalidad === 'domicilio' ? `A domicilio${orden.direccionServicio ? ` — ${orden.direccionServicio}` : ''}` : 'En taller'}</td></tr>
                  <tr><th>Fecha Ingreso</th><td>${new Date(orden.createdAt).toLocaleString()}</td></tr>
                </tbody>
              </table>

              <h4 class="text-primary mb-3 mt-4"><i class="ti ti-device-heart me-1"></i>Actualizar Estado</h4>
              <div class="mb-3">
                <label class="form-label">Estado Actual</label>
                <select id="det-estado" class="form-select">
                  <option value="recibido" ${orden.estado === 'recibido' ? 'selected' : ''}>Recibido</option>
                  <option value="diagnostico" ${orden.estado === 'diagnostico' ? 'selected' : ''}>En Diagnóstico</option>
                  <option value="en_reparacion" ${orden.estado === 'en_reparacion' ? 'selected' : ''}>En Reparación</option>
                  <option value="listo" ${orden.estado === 'listo' ? 'selected' : ''}>Listo para entrega</option>
                  <option value="entregado" ${orden.estado === 'entregado' ? 'selected' : ''}>Entregado</option>
                  <option value="cancelado" ${orden.estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>

              <h4 class="text-primary mb-3 mt-4"><i class="ti ti-cash me-1"></i>Finanzas de la Orden</h4>
              <div class="row border p-2 bg-light-lt rounded">
                <div class="col-6 mb-2">
                  <span class="text-secondary small">Costo Mano Obra:</span>
                  <div class="fw-bold">${formatter.format(Number(orden.costoManoObra))}</div>
                </div>
                <div class="col-6 mb-2">
                  <span class="text-secondary small">Costo Repuestos:</span>
                  <div class="fw-bold text-danger">${formatter.format(Number(orden.costoRepuestos))}</div>
                </div>
                <div class="col-12 border-top pt-2">
                  <span class="text-secondary small">Total a Cobrar:</span>
                  <div class="h3 fw-bold text-primary mb-0">${formatter.format(Number(orden.totalCobrado))}</div>
                </div>
              </div>
            </div>

            <!-- Columna Reparación, Repuestos y Galería -->
            <div class="col-md-7">
              <form id="form-update-detalle">
                <div class="mb-3">
                  <label class="form-label required">Problema Reportado</label>
                  <textarea class="form-control form-control-plaintext bg-light px-2" readonly rows="1">${orden.problemaReportado}</textarea>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Técnico Asignado</label>
                    <select id="det-tecnico" class="form-select">
                      <option value="">-- Por asignar --</option>
                      ${tecnicos.map(t => `<option value="${t.id}" ${orden.tecnicoId === t.id ? 'selected' : ''}>${t.nombre}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Días de Garantía</label>
                    <input type="number" id="det-garantia" class="form-control" value="${orden.diasGarantia}">
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Fecha Est. Entrega</label>
                    <input type="date" id="det-fecha-entrega" class="form-control" value="${orden.fechaEstimadaEntrega ? orden.fechaEstimadaEntrega.split('T')[0] : ''}">
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Costo Mano de Obra ($ COP)</label>
                    <input type="number" id="det-mano-obra" class="form-control" value="${orden.costoManoObra}">
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Diagnóstico Técnico</label>
                  <textarea id="det-diagnostico" class="form-control" rows="2" placeholder="Describa el diagnóstico final o avance…" spellcheck="false">${orden.diagnostico || ''}</textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Observaciones</label>
                  <input type="text" id="det-observaciones" class="form-control" value="${orden.observaciones || ''}">
                </div>
                <div class="d-flex justify-content-end mb-3">
                  <button type="submit" class="btn btn-success">
                    <i class="ti ti-check me-1"></i> Guardar Ficha
                  </button>
                </div>
              </form>

              <!-- Repuestos Usados -->
              <h4 class="text-primary mb-3 mt-4 border-top pt-3"><i class="ti ti-components me-1"></i>Repuestos Asignados</h4>
              <div class="table-responsive mb-2">
                <table class="table table-sm table-vcenter repair-parts-table">
                  <colgroup>
                    <col>
                    <col class="repair-parts-quantity">
                    <col class="repair-parts-cost">
                    <col class="repair-parts-total">
                    ${canEditRepuestos ? '<col class="repair-parts-actions">' : ''}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Repuesto</th>
                      <th class="text-center" title="Cantidad">Cant.</th>
                      <th>Costo unit.</th>
                      <th class="text-end">Total</th>
                      ${canEditRepuestos ? '<th><span class="visually-hidden">Acciones</span></th>' : ''}
                    </tr>
                  </thead>
                  <tbody id="det-repuestos-body">
                    ${orden.repuestos && orden.repuestos.length > 0 ? orden.repuestos.map(r => `
                      <tr>
                        <td>${r.producto ? r.producto.nombre : 'Repuesto'}</td>
                        <td class="text-center">${r.cantidad}</td>
                        <td>${canEditRepuestos ? `<div class="repair-part-cost-editor">
                          <div class="repair-part-cost-field">
                            <span aria-hidden="true">$</span>
                            <input type="number" class="form-control form-control-sm repuesto-costo" value="${Number(r.costoUnitario)}" min="0" max="9999999999999.99" step="0.01" required aria-label="Costo unitario del repuesto en pesos">
                          </div>
                          <button type="button" class="btn btn-sm btn-icon btn-outline-primary btn-guardar-costo" data-repuesto-id="${r.id}" aria-label="Guardar costo del repuesto" title="Guardar costo"><i class="ti ti-check" aria-hidden="true"></i></button>
                        </div>` : formatter.format(Number(r.costoUnitario))}</td>
                        <td class="text-end text-nowrap">${formatter.format(Number(r.costoUnitario) * r.cantidad)}</td>
                        ${canEditRepuestos ? `<td class="text-end"><button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-retirar-repuesto" data-repuesto-id="${r.id}" aria-label="Retirar repuesto" title="Retirar repuesto"><i class="ti ti-trash" aria-hidden="true"></i></button></td>` : ''}
                      </tr>
                    `).join('') : `<tr><td colspan="${canEditRepuestos ? 5 : 4}" class="text-center py-2 text-secondary">No se han utilizado repuestos en esta orden.</td></tr>`}
                  </tbody>
                </table>
              </div>

              ${canEditRepuestos ? `
                <form id="form-add-repuesto" class="row g-2 mb-4 border p-2 bg-light rounded">
                  <div class="col-md-7">
                    <div class="position-relative" id="repuesto-dropdown-container">
                      <input type="hidden" id="repuesto-select" value="" required>
                      <input type="text" id="repuesto-search" class="form-control form-control-sm" placeholder="🔍 Seleccionar o buscar repuesto…" autocomplete="off" spellcheck="false">
                      <div id="repuesto-dropdown-menu" class="dropdown-menu w-100 shadow-sm" style="max-height: 200px; overflow-y: auto; display: none; position: absolute; top: 100%; left: 0; z-index: 1050; background: var(--tblr-bg-surface, #fff); border: 1px solid var(--tblr-border-color, #e6e8eb); border-radius: 4px;">
                        <!-- Opciones dinámicas -->
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3">
                    <input type="number" id="repuesto-cantidad" class="form-control form-control-sm" value="1" min="1" required>
                  </div>
                  <div class="col-md-2">
                    <button type="submit" class="btn btn-primary btn-sm w-100">Agregar</button>
                  </div>
                </form>
              ` : ''}

              <!-- Galería de Fotos -->
              <h4 class="text-primary mb-3 mt-4 border-top pt-3"><i class="ti ti-photo me-1"></i>Galería de Evidencias</h4>
              <div class="row row-cards mb-3" id="galeria-fotos">
                ${orden.fotos && orden.fotos.length > 0 ? orden.fotos.map(f => `
                  <div class="col-3">
                    <div class="card card-sm">
                      <a href="${f.url}" target="_blank" class="d-block">
                        <img src="${f.url}" class="card-img-top" style="height: 80px; object-fit: cover;">
                      </a>
                      <div class="card-body p-1 text-center small text-secondary">
                        ${f.momento === 'recepcion' ? 'Recepción' : 'Entrega'}
                      </div>
                    </div>
                  </div>
                `).join('') : '<div class="col-12 text-center text-secondary small py-2">No hay imágenes de prueba en la orden.</div>'}
              </div>

              <form id="form-add-fotos" class="border p-2 bg-light rounded mb-2">
                <div class="row g-2">
                  <div class="col-md-5">
                    <input type="file" id="det-fotos-file" class="form-control form-control-sm" multiple required accept="image/*">
                  </div>
                  <div class="col-md-4">
                    <select id="det-fotos-momento" class="form-select form-select-sm" required>
                      <option value="recepcion">Fotos de Recepción</option>
                      <option value="entrega">Fotos de Entrega</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <button type="submit" class="btn btn-primary btn-sm w-100">Subir Imágenes</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;

      // Event handlers inside details modal
      content.querySelectorAll<HTMLButtonElement>('.btn-guardar-costo').forEach(button => {
        button.addEventListener('click', () => guardarCosto(button));
        requireSelector('.repuesto-costo', HTMLInputElement, button.closest('td') || button).addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); if (!button.disabled) guardarCosto(button); }
        });
      });
      content.querySelectorAll<HTMLButtonElement>('.btn-retirar-repuesto').forEach(button => {
        button.addEventListener('click', () => retirarRepuesto(button));
      });
      // 1. Update Estado directly
      requireElement('det-estado', HTMLSelectElement).addEventListener('change', async (e) => {
        const newStatus = eventField(e).value;
        if (newStatus === 'entregado') {
          eventField(e).value = orden.estado;
          modalDetalle.hide();
          openEntregarReparacionModal(id);
          return;
        }
        try {
          await apiFetch(`/reparaciones/${id}/estado`, {
            method: 'PUT',
            body: JSON.stringify({ estado: newStatus })
          });
          await loadData();
          fillKanban(requireElement('kanban-search', HTMLInputElement).value);
          // Refrescar modal
          openDetalle(id);
        } catch (err) {
          alert('Error al cambiar de estado: ' + errorMessage(err));
        }
      });

      // 2. Submit Ficha update
      requireElement('form-update-detalle', HTMLFormElement).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const payload = { sedeId: undefined as string | undefined,
            tecnicoId: requireElement('det-tecnico', HTMLSelectElement).value || null,
            diasGarantia: requireElement('det-garantia', HTMLInputElement).value || 30,
            fechaEstimadaEntrega: requireElement('det-fecha-entrega', HTMLInputElement).value || null,
            costoManoObra: requireElement('det-mano-obra', HTMLInputElement).value || 0,
            diagnostico: requireElement('det-diagnostico', HTMLTextAreaElement).value || '',
            observaciones: requireElement('det-observaciones', HTMLInputElement).value || ''
          };

          await apiFetch(`/reparaciones/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          await loadData();
          fillKanban(requireElement('kanban-search', HTMLInputElement).value);
          openDetalle(id);
        } catch (err) {
          alert('Error al guardar ficha: ' + errorMessage(err));
        }
      });

      // 3. Add Repuesto
      const formRepuesto = requireElement('form-add-repuesto', HTMLFormElement);
      if (formRepuesto) {
        formRepuesto.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const payload = { sedeId: undefined as string | undefined,
              productoId: requireElement('repuesto-select', HTMLInputElement).value,
              cantidad: requireElement('repuesto-cantidad', HTMLInputElement).value
            };

            await apiFetch(`/reparaciones/${id}/repuestos`, {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            await loadData();
            fillKanban(requireElement('kanban-search', HTMLInputElement).value);
            openDetalle(id);
          } catch (err) {
            alert('Error al agregar repuesto: ' + errorMessage(err));
          }
        });
      }

      // Buscador unificado y dropdown dinámico de repuestos
      const container = requireElement('repuesto-dropdown-container', HTMLDivElement);
      const searchInput = requireElement('repuesto-search', HTMLInputElement);
      const hiddenInput = requireElement('repuesto-select', HTMLInputElement);
      const dropdownMenu = requireElement('repuesto-dropdown-menu', HTMLDivElement);

      if (container && searchInput && hiddenInput && dropdownMenu) {
        // Filtrar productos seriales
        const repuestosDisponibles = productos.filter(p => p.tieneNumeroSerie === false).map(p => ({
          id: p.id,
          nombre: p.nombre,
          texto: `${p.nombre} (Costo: ${formatter.format(Number(p.precioCosto))})`
        }));

        // Renderizar opciones en el menú dropdown
        const renderDropdownOptions = (filterText = '') => {
          const query = filterText.toLowerCase().trim();
          const filtered = repuestosDisponibles.filter(item => 
            item.nombre.toLowerCase().includes(query)
          );

          if (filtered.length === 0) {
            dropdownMenu.innerHTML = `<div class="dropdown-item text-secondary disabled py-2 px-3 small">No se encontraron resultados</div>`;
            return;
          }

          dropdownMenu.innerHTML = filtered.map(item => `
            <button type="button" class="dropdown-item py-2 px-3 text-start btn-select-repuesto w-100 border-0 bg-transparent" data-id="${item.id}" data-text="${item.nombre}">
              ${item.texto}
            </button>
          `).join('');

          // Click en una opción
          dropdownMenu.querySelectorAll<HTMLElement>('.btn-select-repuesto').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              const id = btn.getAttribute('data-id');
              const text = btn.getAttribute('data-text');
              hiddenInput.value = id || '';
              searchInput.value = text || '';
              dropdownMenu.style.display = 'none';
            });
          });
        };

        // Mostrar menú al hacer focus o click
        searchInput.addEventListener('focus', () => {
          renderDropdownOptions(searchInput.value);
          dropdownMenu.style.display = 'block';
        });

        // Filtrar al escribir
        searchInput.addEventListener('input', (e) => {
          if (eventField(e).value.trim() === '') {
            hiddenInput.value = '';
          }
          renderDropdownOptions(eventField(e).value);
          dropdownMenu.style.display = 'block';
        });

        // Cerrar al hacer click fuera
        document.addEventListener('click', (e) => {
          if (!container.contains(eventElement(e))) {
            dropdownMenu.style.display = 'none';
          }
        });
      }

      // El catálogo de repuestos usa la misma superficie de trabajo que Compras.
      const repuestoModalTrigger = requireElement('repuesto-search', HTMLInputElement);
      if (repuestoModalTrigger) {
        repuestoModalTrigger.addEventListener('click', async () => {
          try { productos = (await apiRequired<ProductoDTO[]>('/productos')).filter(p => p.activo !== false); }
          catch (error) { alert('No se pudo actualizar el catálogo: ' + errorMessage(error)); return; }
          if (!container.isConnected || window.location.hash.split('?')[0] !== '#/reparaciones') return;
          document.getElementById('repuesto-dropdown-menu')?.style.setProperty('display', 'none');
          document.getElementById('modal-repuesto-picker')?.remove();
          const repuestos = productos.filter((p) => p.tieneNumeroSerie === false);
          const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const normal = (value: unknown) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const catName = (p: ProductoDTO) => p?.categoria?.nombre || p?.categoriaNombre || '';
          const catId = (p: ProductoDTO) => String(p?.categoriaId || p?.categoria?.id || '');
          const shortCat = (name: string) => String(name || '').split('/').map((part) => part.trim()).filter(Boolean).pop() || '';
          let selected: ProductoDTO | null = null;
          let activeCategory = '';
          const picker = document.createElement('div');
          picker.className = 'modal modal-blur fade';
          picker.id = 'modal-repuesto-picker';
          picker.tabIndex = -1;
          picker.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-centered" role="document"><div class="modal-content oc-product-modal">
              <div class="modal-header oc-product-modal__header"><div><h5 class="modal-title">Buscar repuesto</h5><p class="oc-product-modal__lede mb-0">Busque, indique la cantidad y agréguelo a esta reparación.</p></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
              <div class="modal-body oc-product-modal__body p-0">
                <aside class="oc-product-modal__cats"><p class="oc-product-modal__rail-label">Categorías</p><div id="rep-modal-categories" class="oc-product-modal__cat-list"></div></aside>
                <div class="oc-product-modal__main"><div class="oc-product-modal__search input-group"><span class="input-group-text"><i class="ti ti-search"></i></span><input id="rep-modal-search" class="form-control" placeholder="Nombre o código…" autocomplete="off"></div><div id="rep-modal-list" class="oc-product-modal__list" role="listbox"></div></div>
                <aside class="oc-product-modal__added"><div class="oc-product-modal__ticket-head"><p class="oc-product-modal__rail-label mb-0">En esta reparación</p><span class="oc-product-modal__ticket-hint">${(orden.repuestos || []).length || 'Vacía'}</span></div><div id="rep-modal-compose"></div><div id="rep-modal-assigned" class="oc-product-modal__added-list"></div></aside>
              </div>
              <div class="modal-footer oc-product-modal__footer"><div class="oc-product-modal__cart-summary">${(orden.repuestos || []).length} repuesto${(orden.repuestos || []).length === 1 ? '' : 's'} · ${formatter.format(Number(orden.costoRepuestos || 0))}</div><button type="button" class="btn btn-primary" data-bs-dismiss="modal">Listo</button></div>
            </div></div>`;
          document.body.appendChild(picker);
          const modal = bootstrap.Modal.getOrCreateInstance(picker);
          const categoryEl = requireElement('rep-modal-categories', HTMLDivElement, picker);
          const listEl = requireElement('rep-modal-list', HTMLDivElement, picker);
          const searchEl = requireElement('rep-modal-search', HTMLInputElement, picker);
          const composeEl = requireElement('rep-modal-compose', HTMLDivElement, picker);
          const assignedEl = requireElement('rep-modal-assigned', HTMLDivElement, picker);
          const renderAssigned = () => {
            const rows = orden.repuestos || [];
            assignedEl.innerHTML = rows.length ? rows.map((row) => `<div class="oc-product-modal__added-item"><div class="oc-product-modal__added-top"><strong class="oc-product-modal__added-name">${esc(row.producto?.nombre || 'Repuesto')}</strong>${canEditRepuestos ? `<button type="button" class="btn btn-sm btn-outline-danger btn-retirar-repuesto" data-repuesto-id="${esc(row.id)}" aria-label="Retirar repuesto"><i class="ti ti-trash" aria-hidden="true"></i> Retirar</button>` : ''}</div><div class="oc-product-modal__added-meta"><span>× ${row.cantidad}</span><span>${formatter.format(Number(row.costoUnitario || 0))}</span><span class="oc-product-modal__added-sub">${formatter.format(Number(row.costoUnitario || 0) * row.cantidad)}</span></div></div>`).join('') : '<div class="oc-product-modal__added-empty"><span class="oc-product-modal__added-empty-title">Sin repuestos aún</span><span class="oc-product-modal__added-empty-hint">Elija un repuesto de la lista para agregarlo.</span></div>';
          };
          const renderCategories = () => {
            const categories = Array.from(new Map(repuestos.map((p): [string,string] => [catId(p), catName(p)]).filter(([key, name]) => key && name)).entries()).sort((a, b) => a[1].localeCompare(b[1], 'es'));
            categoryEl.innerHTML = `<button type="button" class="oc-product-modal__cat${!activeCategory ? ' is-active' : ''}" data-category="">Todas</button>${categories.map(([key, name]) => `<button type="button" class="oc-product-modal__cat${activeCategory === key ? ' is-active' : ''}" data-category="${esc(key)}" title="${esc(name)}">${esc(shortCat(name))}</button>`).join('')}`;
          };
          const renderList = () => {
            const query = normal(searchEl.value);
            const matches = repuestos.filter((p) => (!activeCategory || catId(p) === activeCategory) && normal(`${p.nombre || ''} ${p.codigoBarras || ''} ${catName(p)}`).includes(query)).sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')).slice(0, 80);
            listEl.innerHTML = matches.length ? `<div class="oc-product-picker__count">${matches.length}${matches.length === 80 ? ' · filtre para acotar' : ''} repuesto${matches.length === 1 ? '' : 's'}</div>${matches.map((p) => `<button type="button" class="oc-product-picker__item" role="option" data-product="${esc(p.id)}"><span class="oc-product-picker__main"><span class="oc-product-picker__name">${esc(p.nombre || 'Repuesto')}</span><span class="oc-product-picker__meta"><span class="oc-product-picker__sku">${esc(p.codigoBarras || 's/c')}</span>${catName(p) ? `<span class="oc-product-picker__dot">·</span><span class="oc-product-picker__cat">${esc(shortCat(catName(p)))}</span>` : ''}</span></span><span class="oc-product-picker__cost">${formatter.format(Number(p.precioCosto || 0))}</span></button>`).join('')}` : '<div class="oc-product-picker__empty">Sin coincidencias. Pruebe otro término o categoría.</div>';
          };
          const renderCompose = () => {
            if (!selected) { composeEl.innerHTML = ''; return; }
            composeEl.innerHTML = `<div class="oc-product-modal__compose"><div class="oc-product-modal__compose-head"><div class="oc-product-modal__compose-name"><span class="oc-product-modal__compose-label">Para agregar</span><strong>${esc(selected.nombre)}</strong></div></div><div class="oc-product-modal__compose-fields"><div><label class="form-label">Costo</label><div class="form-control-plaintext py-1 fw-semibold">${formatter.format(Number(selected.precioCosto || 0))}</div></div><div><label class="form-label" for="rep-modal-quantity">Cant.</label><input type="number" id="rep-modal-quantity" class="form-control" value="1" min="1"></div><div class="d-flex align-items-end"><button type="button" id="rep-modal-add" class="btn btn-primary w-100">Agregar</button></div></div></div>`;
            requireSelector('#rep-modal-add', HTMLButtonElement, composeEl).addEventListener('click', async () => {
              const cantidad = parseInt(requireSelector('#rep-modal-quantity', HTMLInputElement, composeEl).value, 10);
              if (!Number.isInteger(cantidad) || cantidad < 1) return;
              const button = requireSelector('#rep-modal-add', HTMLButtonElement, composeEl); button.disabled = true;
              try { await apiFetch(`/reparaciones/${id}/repuestos`, { method: 'POST', body: JSON.stringify({ productoId: selected?.id, cantidad }) }); modal.hide(); await loadData(); fillKanban(requireElement('kanban-search', HTMLInputElement).value); openDetalle(id); } catch (err) { button.disabled = false; alert('Error al agregar repuesto: ' + errorMessage(err)); }
            });
          };
          renderAssigned(); renderCategories(); renderList();
          searchEl.addEventListener('input', renderList);
          categoryEl.addEventListener('click', (event) => { const chip = eventElement(event).closest<HTMLElement>('[data-category]'); if (!chip) return; activeCategory = chip.dataset.category || ''; renderCategories(); renderList(); });
          assignedEl.querySelectorAll<HTMLButtonElement>('.btn-retirar-repuesto').forEach(button => button.addEventListener('click', () => retirarRepuesto(button, () => modal.hide())));
          listEl.addEventListener('click', (event) => { const item = eventElement(event).closest<HTMLElement>('[data-product]'); if (!item) return; selected = repuestos.find((p) => String(p.id) === item.dataset.product) || null; renderCompose(); });
          picker.addEventListener('shown.bs.modal', () => { picker.style.zIndex = '1065'; const backdrops = document.querySelectorAll<HTMLElement>('.modal-backdrop'); backdrops[backdrops.length - 1]?.style.setProperty('z-index', '1060'); searchEl.focus(); });
          picker.addEventListener('hidden.bs.modal', () => picker.remove());
          modal.show();
        });
      }

      // 4. Upload Fotos
      requireElement('form-add-fotos', HTMLFormElement).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const files = requireElement('det-fotos-file', HTMLInputElement).files;
          const momento = requireElement('det-fotos-momento', HTMLSelectElement).value;
          if (!files || files.length === 0) return;

          const formData = new FormData();
          formData.append('momento', momento);
          for (let i = 0; i < files.length; i++) {
            formData.append('fotos', files[i]);
          }

          await apiFetch(`/reparaciones/${id}/fotos`, {
            method: 'POST',
            body: formData
          });
          await loadData();
          fillKanban(requireElement('kanban-search', HTMLInputElement).value);
          openDetalle(id);
        } catch (err) {
          alert('Error al subir fotos: ' + errorMessage(err));
        }
      });

      // 5. Download Recibo PDF
      requireElement('det-pdf-btn', HTMLButtonElement).addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('token');
          // Descargar directamente abriendo el endpoint en una nueva pestaña (el middleware valida token por query param, o fetch con stream)
          // Usaremos fetch para descargarlo de forma segura con headers
          const response = await fetch(`/api/reparaciones/${id}/orden-pdf`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!response.ok) throw new Error('No se pudo generar el PDF');
          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `orden_${orden.numeroOrden}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (err) {
          alert('Error al descargar recibo: ' + errorMessage(err));
        }
      });

      // 6. View QR Code label in a mini window or modal
      requireElement('det-qr-btn', HTMLButtonElement).addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('token');
          const sysConfig = await apiRequired<ConfigSistema>('/config/sistema').catch(() => null);
          const empresaNombre = sysConfig?.empresa || 'TechStore Colombia';
          const response = await fetch(`/api/reparaciones/${id}/etiqueta-qr`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!response.ok) throw new Error('No se pudo generar el código QR');
          const blob = await response.blob();
          const imgUrl = window.URL.createObjectURL(blob);

          // Crear popup para impresión premium de etiqueta
          const popup = window.open('', '_blank', 'width=350,height=300');
          if (!popup) throw new Error('Permita las ventanas emergentes para imprimir.');
          popup.document.write(`
            <html>
              <head>
                <title>Etiqueta OR #${orden.numeroOrden}</title>
                <style>
                  body { font-family: 'Inter', sans-serif; text-align: center; padding: 10px; margin: 0; }
                  h3 { margin: 5px 0; }
                  p { margin: 2px 0; font-size: 12px; }
                  img { margin: 10px auto; display: block; }
                  button { display: block; margin: 15px auto; padding: 5px 15px; font-weight: bold; cursor: pointer; }
                  @media print { button { display: none; } }
                </style>
              </head>
              <body>
                <h3>${empresaNombre}</h3>
                <p><strong>ORDEN DE REPARACIÓN</strong></p>
                <p>Orden #: <strong>${orden.numeroOrden}</strong></p>
                <p>Cliente: ${orden.cliente ? orden.cliente.nombre : 'Cliente General'}</p>
                <p>Equipo: ${orden.tipoEquipo} ${orden.marca} ${orden.modelo}</p>
                <img src="${imgUrl}" width="120" height="120">
                <p style="font-size:10px;color:#666;margin-top:4px">Escaneo del cliente · sin login</p>
                <button onclick="window.print()">Imprimir Etiqueta</button>
              </body>
            </html>
          `);
          popup.document.close();
        } catch (err) {
          alert('Error al generar etiqueta QR: ' + errorMessage(err));
        }
      });

    } catch (err) {
      content.innerHTML = `<div class="alert alert-danger m-3">${errorMessage(err)}</div>`;
    }
  }

  let currentTotalCobrar = 0;

  // Open Entregar/Cobrar Modal
  function openEntregarReparacionModal(orderId: string) {
    const o = ordenes.find(item => item.id === orderId);
    if (!o) return;

    requireElement('entregar-id', HTMLInputElement).value = String(o.id);
    requireElement('entregar-numero', HTMLInputElement).value = String(o.numeroOrden);
    requireElement('entregar-cliente', HTMLInputElement).value = String(o.cliente ? o.cliente.nombre : 'Cliente General');
    
    currentTotalCobrar = Number(o.totalCobrado || 0);

    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    requireElement('entregar-total-txt', HTMLDivElement).textContent = formatter.format(Number(currentTotalCobrar));
    
    // Reset payment inputs
    requireElement('entregar-pay-efectivo', HTMLInputElement).value = String(0);
    requireElement('entregar-pay-nequi', HTMLInputElement).value = String(0);
    requireElement('entregar-pay-daviplata', HTMLInputElement).value = String(0);
    requireElement('entregar-pay-tarjeta', HTMLInputElement).value = String(0);
    requireElement('entregar-pay-transferencia', HTMLInputElement).value = String(0);
    const creditoInput = requireElement('entregar-credito', HTMLInputElement);
    const esConsumidorFinal = !o.cliente || o.cliente.nombre === 'Consumidor Final' ||
      ['222222222', '222222222-0', '222222222222'].includes(o.cliente.documento || '');
    creditoInput.checked = false;
    creditoInput.disabled = esConsumidorFinal;
    requireElement('entregar-credito-ayuda', HTMLDivElement).textContent = esConsumidorFinal
      ? 'Asigne un cliente registrado a la orden para poder dejar saldo a crédito.'
      : 'El saldo pendiente se registrará en la cartera del cliente.';

    calcularTotalesEntrega();

    modalEntregar.show();
  }

  function calcularTotalesEntrega() {
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    
    const efectivo = parseFloat(requireElement('entregar-pay-efectivo', HTMLInputElement).value || '0');
    const nequi = parseFloat(requireElement('entregar-pay-nequi', HTMLInputElement).value || '0');
    const daviplata = parseFloat(requireElement('entregar-pay-daviplata', HTMLInputElement).value || '0');
    const tarjeta = parseFloat(requireElement('entregar-pay-tarjeta', HTMLInputElement).value || '0');
    const transferencia = parseFloat(requireElement('entregar-pay-transferencia', HTMLInputElement).value || '0');

    const totalIngresado = efectivo + nequi + daviplata + tarjeta + transferencia;
    requireElement('entregar-total-ingresado', HTMLDivElement).textContent = formatter.format(Number(totalIngresado));

    const cambioVal = requireElement('entregar-cambio', HTMLDivElement);
    const labelCambio = requireElement('entregar-label-cambio', HTMLDivElement);
    const submitBtn = requireElement('entregar-submit-btn', HTMLButtonElement);
    const esCredito = requireElement('entregar-credito', HTMLInputElement).checked;

    const diferencia = totalIngresado - currentTotalCobrar;

    if (diferencia < 0) {
      labelCambio.textContent = esCredito ? 'Saldo a Crédito:' : 'Faltante (Pendiente):';
      cambioVal.textContent = formatter.format(Math.abs(diferencia));
      cambioVal.classList.toggle('text-danger', !esCredito);
      cambioVal.classList.toggle('text-primary', esCredito);
      cambioVal.classList.remove('text-success');
      submitBtn.disabled = !esCredito;
      submitBtn.innerHTML = esCredito
        ? '<i class="ti ti-file-invoice me-1"></i>Entregar a Crédito'
        : '<i class="ti ti-check me-1"></i>Cobrar y Entregar';
    } else {
      labelCambio.textContent = 'Cambio (Vuelto):';
      cambioVal.textContent = formatter.format(Number(diferencia));
      cambioVal.classList.add('text-success');
      cambioVal.classList.remove('text-danger', 'text-primary');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-check me-1"></i>Cobrar y Entregar';
    }
  }

  // Bind change/input events to all payment inputs
  document.querySelectorAll<HTMLElement>('.input-entregar-pago').forEach(input => {
    input.addEventListener('input', calcularTotalesEntrega);
  });
  requireElement('entregar-credito', HTMLInputElement).addEventListener('change', calcularTotalesEntrega);

  // Submit Entregar/Cobrar Form
  requireElement('form-entregar-reparacion', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = requireElement('entregar-id', HTMLInputElement).value;

    const pagos = {
      efectivo: parseFloat(requireElement('entregar-pay-efectivo', HTMLInputElement).value || '0'),
      nequi: parseFloat(requireElement('entregar-pay-nequi', HTMLInputElement).value || '0'),
      daviplata: parseFloat(requireElement('entregar-pay-daviplata', HTMLInputElement).value || '0'),
      tarjeta: parseFloat(requireElement('entregar-pay-tarjeta', HTMLInputElement).value || '0'),
      transferencia: parseFloat(requireElement('entregar-pay-transferencia', HTMLInputElement).value || '0')
    };

    try {
      const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
      
      await apiFetch(`/reparaciones/${id}/estado`, {
        method: 'PUT',
        body: JSON.stringify({
          estado: 'entregado',
          pagos,
          esCredito: requireElement('entregar-credito', HTMLInputElement).checked
        })
      });

      modalEntregar.hide();
      
      // Actualizar local
      const idx = ordenes.findIndex(o => o.id === id);
      if (idx !== -1) {
        ordenes[idx].estado = 'entregado';
      }
      
      await loadData();
      fillKanban(requireElement('kanban-search', HTMLInputElement).value);
      const totalPagado = Object.values(pagos).reduce((total, monto) => total + monto, 0);
      const fueCredito = requireElement('entregar-credito', HTMLInputElement).checked && totalPagado < currentTotalCobrar;
      showToast('Éxito', fueCredito
        ? 'Reparación entregada y saldo registrado en cartera.'
        : 'Reparación cobrada y entregada correctamente.', 'success');
    } catch (err) {
      const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
      showToast('Error', errorMessage(err), 'error');
    }
  });

  // Si hay un query param 'buscar' en la URL (por el QR), autocompletar buscador y abrir detalle si corresponde
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const buscarQr = urlParams.get('buscar');
  if (buscarQr) {
    requireElement('kanban-search', HTMLInputElement).value = String(buscarQr);
    fillKanban(buscarQr);
    // Buscar si existe para abrir el detalle
    const match = ordenes.find(o => o.numeroOrden === buscarQr);
    if (match) {
      openDetalle(match.id);
    }
  }
  watchDataChanges(container, ["productos","clientes","reparaciones"], async () => {
    await loadData(); fillKanban(document.querySelector<HTMLInputElement>('#kanban-search')?.value || '');
  });

}



import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';

export async function initDashboard(container) {
  let usuario = getUsuario();
  const isAdmin = ['admin', 'superadmin'].includes(usuario.rol);
  const requiresSede = !isAdmin;

  if (requiresSede) {
    try {
      const me = await apiFetch('/auth/me');
      if (me?.usuario) {
        usuario = { ...usuario, ...me.usuario };
        localStorage.setItem('usuario', JSON.stringify(usuario));
      }
    } catch (e) {
      console.warn('No se pudo refrescar la sede del usuario:', e);
    }
  }

  // Obtener sedes y configuración del sistema
  let sedes = [];
  let config = { empresa: 'TechStore Colombia' };
  try {
    if (isAdmin) {
      sedes = await apiFetch('/config/sedes');
    }
    config = await apiFetch('/config/sistema');
  } catch (e) {
    console.error('Error al obtener datos iniciales del dashboard:', e);
  }

  const PERIODOS_VALIDOS = ['hoy', 'semana', 'mes', 'año'];
  const PERIODO_LABELS_EARLY = {
    hoy: 'Hoy',
    semana: 'Últimos 7 días',
    mes: 'Último mes',
    año: 'Último año'
  };

  const hashParamsInit = new URLSearchParams(window.location.hash.split('?')[1] || '');
  let initialPeriodo = hashParamsInit.get('periodo') || localStorage.getItem('dashboard-periodo') || 'hoy';
  if (!PERIODOS_VALIDOS.includes(initialPeriodo)) initialPeriodo = 'hoy';

  let initialSede = hashParamsInit.get('sede') || localStorage.getItem('dashboard-sede') || '';
  if (initialSede && isAdmin && sedes.length > 0 && !sedes.some(s => String(s.id) === String(initialSede))) {
    initialSede = '';
  }

  function persistDashboardFilters(periodo, sedeId) {
    localStorage.setItem('dashboard-periodo', periodo);
    if (isAdmin) {
      localStorage.setItem('dashboard-sede', sedeId || '');
    }

    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    params.set('periodo', periodo);
    if (isAdmin && sedeId) {
      params.set('sede', sedeId);
    } else {
      params.delete('sede');
    }
    params.delete('scroll');

    const qs = params.toString();
    const newHash = qs ? `#/dashboard?${qs}` : '#/dashboard';
    if (window.location.hash !== newHash) {
      history.replaceState(null, '', newHash);
    }
  }

  // Renderizar Estructura del Dashboard y Filtros
  const dashFiltersHtml = `
    <div class="dash-filters" role="group" aria-label="Filtros del panel">
      ${isAdmin ? `
        <label class="dash-filter">
          <span class="dash-filter__label">Sede</span>
          <select id="filter-sede" class="form-select form-select-sm" aria-label="Filtrar por sede">
            <option value="" ${!initialSede ? 'selected' : ''}>Todas</option>
            ${sedes.map(s => `<option value="${s.id}" ${String(s.id) === String(initialSede) ? 'selected' : ''}>${s.nombre}</option>`).join('')}
          </select>
        </label>
      ` : ''}
      <label class="dash-filter">
        <span class="dash-filter__label">Período</span>
        <select id="filter-periodo" class="form-select form-select-sm" aria-label="Filtrar por período">
          ${PERIODOS_VALIDOS.map(p => `<option value="${p}" ${p === initialPeriodo ? 'selected' : ''}>${PERIODO_LABELS_EARLY[p]}</option>`).join('')}
        </select>
      </label>
    </div>
  `;

  container.innerHTML = `
    <div class="container-xl erp-module dash">
      ${erpHeader({
        eyebrow: 'Cierre de turno',
        title: config.empresa,
        subtitle: requiresSede && usuario.sedeNombre
          ? `${usuario.sedeNombre} · ${PERIODO_LABELS_EARLY[initialPeriodo] || 'período'}`
          : 'Resultado del período y lo que pide atención',
        actionsHtml: dashFiltersHtml
      })}

      <div class="dash-stage d-print-none">
        <section class="dash-pulse dash-pulse--ticket" id="dash-pulse" aria-label="Resultado del período y efectivo en caja">
          <header class="dash-pulse__receipt-head">
            <span class="dash-pulse__receipt-id">Nº cierre</span>
            <span class="dash-pulse__receipt-period" id="dash-pulse-periodo">Hoy</span>
          </header>
          <div class="dash-pulse__body">
            <div class="dash-pulse__main">
              <p class="dash-pulse__eyebrow">Resultado del período</p>
              <button type="button" class="dash-pulse__value-btn" data-dash-window="utilidad" aria-haspopup="dialog" title="Ver desglose de utilidad">
                <span class="dash-pulse__value" id="dash-pulse-resultado">—</span>
              </button>
              <p class="dash-pulse__sub">Ingresos menos gastos. Toca una cifra para abrir el detalle sin salir del panel.</p>
            </div>
            <div class="dash-pulse__tear" aria-hidden="true"></div>
            <div class="dash-pulse__side">
              <p class="dash-pulse__group-label" id="dash-pulse-periodo-group">Líneas del período</p>
              <ul class="dash-pulse__stats" aria-labelledby="dash-pulse-periodo-group">
                <li>
                  <button type="button" class="dash-pulse__stat dash-pulse__stat--in" data-dash-window="ingresos" aria-haspopup="dialog">
                    <span class="dash-pulse__stat-label">Ingresos</span>
                    <span class="dash-pulse__stat-value" id="dash-pulse-ingresos">—</span>
                  </button>
                </li>
                <li>
                  <button type="button" class="dash-pulse__stat dash-pulse__stat--out" data-dash-window="gasto_total" aria-haspopup="dialog">
                    <span class="dash-pulse__stat-label">Gastos</span>
                    <span class="dash-pulse__stat-value" id="dash-pulse-gastos">—</span>
                  </button>
                </li>
              </ul>
              <button type="button" class="dash-pulse__cash" data-dash-window="caja" aria-haspopup="dialog" aria-labelledby="dash-pulse-caja-label">
                <span class="dash-pulse__stat-label" id="dash-pulse-caja-label">Efectivo en caja ahora</span>
                <span class="dash-pulse__stat-value" id="dash-pulse-caja">—</span>
                <span class="dash-pulse__cash-hint">Saldo del registro abierto — no es el resultado del período.</span>
              </button>
            </div>
          </div>
          <div class="dash-pulse__bar-meta">
            <span>Ingresos</span>
            <span>vs gasto</span>
          </div>
          <div class="dash-pulse__bar-wrap" role="presentation" aria-hidden="true">
            <div class="dash-pulse__bar" id="dash-pulse-bar" style="width:50%"></div>
          </div>
        </section>

        <div class="dash-kpi-board" aria-label="Qué revisar">
          <header class="dash-kpi-board__head">
            <div>
              <h2 class="dash-kpi-board__title">Qué revisar</h2>
              <p class="dash-kpi-board__hint">Líneas del día · clic abre el detalle</p>
            </div>
          </header>
          <div class="dash-kpi-board__panes">
            <section class="dash-kpi-group dash-kpi-group--op" aria-labelledby="dash-sec-operacion">
              <header class="dash-kpi-group__head">
                <h3 class="dash-kpi-group__title" id="dash-sec-operacion">Operación</h3>
                <p class="dash-kpi-group__hint">Mostrador, taller e inventario</p>
              </header>
              <div id="dash-kpi-operacion" class="dash-kpi-grid dash-kpi-grid--op"></div>
            </section>
            <section class="dash-kpi-group dash-kpi-group--dinero" aria-labelledby="dash-sec-dinero">
              <header class="dash-kpi-group__head">
                <h3 class="dash-kpi-group__title" id="dash-sec-dinero">Dinero</h3>
                <p class="dash-kpi-group__hint">Caja, deudas, gastos y utilidad</p>
              </header>
              <div id="dash-kpi-dinero" class="dash-kpi-grid dash-kpi-grid--dinero"></div>
            </section>
          </div>
        </div>
      </div>

      <div class="modal fade" id="dash-window-modal" tabindex="-1" aria-labelledby="dash-window-title" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
          <div class="modal-content dash-window">
            <div class="modal-header dash-window__head">
              <div>
                <p class="dash-window__chip" id="dash-window-chip">Período</p>
                <h2 class="modal-title dash-window__title" id="dash-window-title">Detalle</h2>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body dash-window__body">
              <div class="dash-window__hero">
                <span class="dash-window__hero-label" id="dash-window-valor-label">Valor</span>
                <span class="dash-window__hero-value" id="dash-window-valor">—</span>
              </div>
              <div id="dash-window-loading" class="dash-window__loading d-none">
                <span class="spinner-border spinner-border-sm text-primary" role="status"></span> Cargando…
              </div>
              <div id="dash-window-empty" class="dash-window__empty d-none"></div>
              <ul class="dash-window__list" id="dash-window-list"></ul>
            </div>
            <div class="modal-footer dash-window__foot">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
              <a href="#/dashboard" class="btn btn-primary" id="dash-window-cta">Abrir módulo</a>
            </div>
          </div>
        </div>
      </div>

      <section class="dash-deck dash-deck--bitacora d-print-none" aria-label="Bitácora del período">
        <header class="dash-deck__head">
          <h2 class="dash-deck__title">Bitácora del período</h2>
          <p class="dash-deck__hint">Qué entró, qué salió y qué pide atención</p>
        </header>
        <div class="dash-deck__grid dash-deck__grid--bitacora">
          <div class="dash-panel dash-panel--quiet dash-bitacora" id="dash-bitacora">
            <div class="dash-bitacora__alerts" id="dash-bitacora-alerts" hidden></div>
            <ul class="dash-bitacora__list" id="dash-bitacora-list" aria-live="polite"></ul>
            <div class="dash-bitacora-idle d-none" id="dash-bitacora-idle">
              <p class="dash-bitacora-idle__title">Sin movimientos en este período</p>
              <p class="dash-bitacora-idle__text">Cuando recibas mercancía, vendas o registres un egreso, aparece aquí.</p>
              <div class="dash-bitacora-idle__actions">
                <a href="#/pos" class="btn btn-sm btn-primary">Abrir POS</a>
                <a href="#/compras" class="btn btn-sm btn-outline-primary">Registrar compra</a>
                <a href="#/caja?accion=egreso" class="btn btn-sm btn-outline-secondary">Registrar egreso</a>
              </div>
            </div>
          </div>
          <aside class="dash-deck__rail" aria-label="Tendencia y atajos">
            <div class="dash-panel dash-panel--quiet" id="dashboard-chart">
              <div class="dash-panel__head">
                <h3 class="dash-panel__title" id="chart-ventas-title">Ingresos vs gasto</h3>
              </div>
              <div class="dash-panel__body dash-panel__body--chart">
                <div class="dash-chart-wrap dash-chart-wrap--deck">
                  <canvas id="chart-ventas"></canvas>
                </div>
              </div>
            </div>
            <div class="dash-panel dash-panel--quiet dash-panel--rail">
              <div class="dash-panel__head">
                <h3 class="dash-panel__title">Atajos</h3>
              </div>
              <nav class="dash-quick" aria-label="Accesos rápidos">
                <a href="#/pos" class="dash-quick__item">
                  <span class="dash-quick__key">POS</span>
                  <div>
                    <div class="dash-quick__label">Punto de venta</div>
                    <div class="dash-quick__desc">Facturar en mostrador</div>
                  </div>
                </a>
                <a href="#/reparaciones" class="dash-quick__item">
                  <span class="dash-quick__key">TLR</span>
                  <div>
                    <div class="dash-quick__label">Taller</div>
                    <div class="dash-quick__desc">Órdenes y entregas</div>
                  </div>
                </a>
                <a href="#/caja" class="dash-quick__item">
                  <span class="dash-quick__key">CJA</span>
                  <div>
                    <div class="dash-quick__label">Caja</div>
                    <div class="dash-quick__desc">Apertura y egresos</div>
                  </div>
                </a>
                <a href="#/reportes" class="dash-quick__item">
                  <span class="dash-quick__key">RPT</span>
                  <div>
                    <div class="dash-quick__label">Reportes</div>
                    <div class="dash-quick__desc">Cartera y flujo</div>
                  </div>
                </a>
                <a href="#/compras" class="dash-quick__item">
                  <span class="dash-quick__key">CMP</span>
                  <div>
                    <div class="dash-quick__label">Compras</div>
                    <div class="dash-quick__desc">Órdenes y pagos</div>
                  </div>
                </a>
              </nav>
            </div>
          </aside>
        </div>
      </section>

      <section class="dash-analisis d-print-none" aria-labelledby="dash-analisis-title">
        <header class="dash-analisis__head">
          <div>
            <h2 class="dash-analisis__title" id="dash-analisis-title">Análisis de gasto y compras</h2>
            <p class="dash-analisis__hint">De dónde salió el dinero frente a lo que entró</p>
          </div>
          <span class="dash-analisis__periodo" id="analisis-periodo-label"></span>
        </header>

        <div class="dash-panel dash-panel--quiet dash-analisis__board">
          <div class="dash-analisis__compose">
            <div class="dash-analisis__hero">
              <span class="dash-analisis__label">Gasto total del período</span>
              <button type="button" class="dash-analisis__total" id="analisis-gasto-total" data-dash-window="gasto_total" aria-haspopup="dialog">—</button>
              <p class="dash-analisis__vs" id="analisis-vs-ingresos">—</p>
            </div>

            <div class="dash-analisis__split" aria-label="Composición del gasto">
              <div class="dash-analisis__bar" id="analisis-split-bar" role="img" aria-label="Caja versus compras">
                <span class="dash-analisis__seg dash-analisis__seg--caja" id="analisis-seg-caja"></span>
                <span class="dash-analisis__seg dash-analisis__seg--compras" id="analisis-seg-compras"></span>
              </div>
              <div class="dash-analisis__legend">
                <button type="button" class="dash-analisis__leg" data-dash-window="gastos" aria-haspopup="dialog">
                  <span class="dash-analisis__leg-key">CJA</span>
                  <span class="dash-analisis__leg-name">Egresos de caja</span>
                  <span class="dash-analisis__leg-val" id="analisis-caja-val">—</span>
                  <span class="dash-analisis__leg-pct" id="analisis-caja-pct"></span>
                </button>
                <button type="button" class="dash-analisis__leg" data-dash-window="compras_pagadas" aria-haspopup="dialog">
                  <span class="dash-analisis__leg-key">CMP</span>
                  <span class="dash-analisis__leg-name">Pagos a proveedores</span>
                  <span class="dash-analisis__leg-val" id="analisis-compras-val">—</span>
                  <span class="dash-analisis__leg-pct" id="analisis-compras-pct"></span>
                </button>
              </div>
            </div>

            <div class="dash-analisis__side">
              <button type="button" class="dash-analisis__side-row" data-dash-window="cuentas_por_pagar" aria-haspopup="dialog">
                <span class="dash-analisis__side-label">Por pagar</span>
                <span class="dash-analisis__side-val" id="analisis-por-pagar">—</span>
              </button>
              <button type="button" class="dash-analisis__side-row" data-dash-window="compras_pagadas" aria-haspopup="dialog">
                <span class="dash-analisis__side-label">Órdenes del período</span>
                <span class="dash-analisis__side-val" id="analisis-ordenes">—</span>
              </button>
            </div>
          </div>

          <div class="dash-analisis__ranks">
            <div class="dash-analisis__rank">
              <h3 class="dash-analisis__rank-title">Egresos por categoría</h3>
              <ol class="dash-analisis__rank-list" id="analisis-rank-cat"></ol>
              <p class="dash-analisis__rank-empty d-none" id="analisis-rank-cat-empty">Sin egresos de caja en el período.</p>
            </div>
            <div class="dash-analisis__rank">
              <h3 class="dash-analisis__rank-title">Pagos por proveedor</h3>
              <ol class="dash-analisis__rank-list" id="analisis-rank-prov"></ol>
              <p class="dash-analisis__rank-empty d-none" id="analisis-rank-prov-empty">Sin pagos a proveedores en el período.</p>
            </div>
          </div>
        </div>

        <div class="dash-analisis__detail d-none" id="analisis-detail">
          <section id="gasto-total-section" class="dash-section dash-ledger__block" aria-labelledby="dash-gasto-title">
            <div class="dash-section__head">
              <h2 class="dash-section__title" id="dash-gasto-title">Detalle de pagos</h2>
              <span class="dash-section__hint" id="gasto-total-periodo-label"></span>
            </div>
            <div class="dash-ledger__detail dash-ledger__detail--solo" id="gasto-total-detail">
              <div class="dash-panel dash-panel--quiet dash-panel--table" id="compras-pagadas-wrap">
                <div class="dash-panel__head">
                  <h3 class="dash-panel__title">Pagos a proveedores</h3>
                  <a href="#/compras" class="btn btn-sm btn-outline-primary">Ver órdenes</a>
                </div>
                <div class="dash-table-wrap">
                  <table class="table table-vcenter table-hover table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Orden</th>
                        <th>Proveedor</th>
                        <th>Origen</th>
                        <th>Referencia</th>
                        <th class="text-end">Monto</th>
                      </tr>
                    </thead>
                    <tbody id="compras-pagadas-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section class="dash-section dash-ledger__block d-none" id="dash-section-egresos" aria-labelledby="dash-cat-title">
            <div class="dash-section__head">
              <h2 class="dash-section__title" id="dash-cat-title">Detalle de egresos</h2>
              <span class="dash-section__hint" id="gastos-total-label"></span>
            </div>
            <div class="dash-ledger__detail dash-ledger__detail--solo">
              <div class="dash-panel dash-panel--quiet dash-panel--table">
                <div class="dash-table-wrap">
                  <table class="table table-vcenter table-hover table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Categoría</th>
                        <th>Motivo</th>
                        <th>Cajero</th>
                        <th class="text-end">Monto</th>
                      </tr>
                    </thead>
                    <tbody id="gastos-detalle-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;

  const PERIODO_LABELS = {
    hoy: 'Hoy',
    semana: 'Últimos 7 días',
    mes: 'Último mes',
    año: 'Último año'
  };

  let chartVentasInstance = null;

  const ORIGEN_COLORS = {
    caja_efectivo: '#e11d48',
    efectivo_externo: '#d97706',
    transferencia_empresa: '#0891b2',
    otro: '#64748b'
  };

  const CHART_INGRESO = '#0891b2';
  const CHART_GASTO = '#e11d48';

  function getDashboardSedeId() {
    if (isAdmin) {
      return document.getElementById('filter-sede')?.value || '';
    }
    return usuario.sedeId || '';
  }

  function buildDashboardQuery(periodo, sedeId) {
    const params = new URLSearchParams({ periodo });
    if (sedeId) params.set('sede', sedeId);
    return params.toString();
  }

  function showDashboardError(message) {
    const pulse = document.getElementById('dash-pulse');
    if (pulse && !document.getElementById('dash-load-error')) {
      pulse.insertAdjacentHTML('afterend', `
        <div id="dash-load-error" class="alert alert-danger d-print-none mb-3" role="alert">
          <div class="fw-semibold">No se pudieron cargar los datos del dashboard</div>
          <div class="small">${message}</div>
        </div>
      `);
    }
  }

  const formatterCOP = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  });
  let dashWindowModal = null;
  let lastKpis = null;
  // Cargar datos del Dashboard
  const loadDashboardData = async () => {
    document.getElementById('dash-load-error')?.remove();

    const sedeId = getDashboardSedeId();
    const periodo = document.getElementById('filter-periodo').value;

    if (requiresSede && !sedeId) {
      showDashboardError('Tu usuario no tiene una sede asignada. Contacta al administrador para vincular tu cuenta a una sede.');
      return;
    }

    const query = buildDashboardQuery(periodo, sedeId);

    try {
      const [kpis, graficaRes, gastosData, actividad] = await Promise.all([
        apiFetch(`/dashboard/kpis?${query}`),
        apiFetch(`/dashboard/graficas/ventas?${query}`),
        apiFetch(`/dashboard/gastos-por-categoria?${query}`),
        apiFetch(`/dashboard/actividad?${query}`)
      ]);

      renderKPIs(kpis);
      renderBalance(kpis, periodo);
      renderBitacora(actividad);
      renderAnalisisGasto(kpis, gastosData, periodo);

      const graficaData = Array.isArray(graficaRes) ? graficaRes : (graficaRes.data || []);
      document.getElementById('chart-ventas-title').textContent =
        `Ingresos vs Gasto total (${PERIODO_LABELS[periodo] || periodo})`;
      renderChart(graficaData, graficaRes.bucket);
    } catch (e) {
      console.error('Error al cargar datos del dashboard:', e);
      showDashboardError(e.message || 'Error de conexión con el servidor.');
    }
  };

  // Asignar listeners de filtros
  const onFilterChange = () => {
    const periodo = document.getElementById('filter-periodo').value;
    const sedeId = isAdmin ? document.getElementById('filter-sede').value : '';
    persistDashboardFilters(periodo, sedeId);
    loadDashboardData();
  };

  if (isAdmin) {
    document.getElementById('filter-sede').addEventListener('change', onFilterChange);
  }
  document.getElementById('filter-periodo').addEventListener('change', onFilterChange);

  // Primera carga (respeta filtros guardados)
  const scrollTarget = hashParamsInit.get('scroll');
  const navEntry = performance.getEntriesByType('navigation')[0];
  const isPageReload = navEntry && (navEntry.type === 'reload' || navEntry.type === 'back_forward');

  persistDashboardFilters(initialPeriodo, initialSede);
  await loadDashboardData();

  if (scrollTarget && !isPageReload) {
    if (scrollTarget === 'chart') {
      document.getElementById('dashboard-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (scrollTarget === 'gasto') {
      document.getElementById('gasto-total-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else if (isPageReload) {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function kpiCard({ window: win, title, iconClass, value, label, valueClass = '', tone = '' }) {
    const toneClass = tone ? ` dash-kpi--${tone}` : '';
    const valueTone = valueClass ? ` ${valueClass}` : '';
    return `
      <button type="button" class="dash-kpi${toneClass}" data-dash-window="${win}" aria-haspopup="dialog" title="${title}">
        <span class="dash-kpi__icon" aria-hidden="true"><i class="ti ${iconClass}"></i></span>
        <span class="dash-kpi__label">${label}</span>
        <span class="dash-kpi__value${valueTone}">${value}</span>
        <span class="dash-kpi__arrow" aria-hidden="true"><i class="ti ti-chevron-right"></i></span>
      </button>
    `;
  }

  function formatWindowMonto(row) {
    if (row.monto === null || row.monto === undefined) return '';
    if (row.montoEsCantidad) {
      return `${row.monto}${row.montoSufijo || ''}`;
    }
    return formatterCOP.format(row.monto);
  }

  async function openDashWindow(tipo) {
    const modalEl = document.getElementById('dash-window-modal');
    if (!modalEl) return;
    // Evita que un ancestro con stacking context recorte/desplace el modal
    if (modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }
    if (!dashWindowModal) dashWindowModal = new bootstrap.Modal(modalEl);

    const periodo = document.getElementById('filter-periodo')?.value || 'hoy';
    const sedeId = getDashboardSedeId();
    const periodoLabel = PERIODO_LABELS[periodo] || periodo;
    const sedeLabel = isAdmin
      ? (document.getElementById('filter-sede')?.selectedOptions?.[0]?.textContent || 'Todas')
      : (usuario.sedeNombre || 'Sede');

    document.getElementById('dash-window-chip').textContent = `${periodoLabel} · ${sedeLabel}`;
    document.getElementById('dash-window-title').textContent = 'Cargando…';
    document.getElementById('dash-window-valor').textContent = '—';
    document.getElementById('dash-window-valor-label').textContent = '';
    document.getElementById('dash-window-list').innerHTML = '';
    document.getElementById('dash-window-empty')?.classList.add('d-none');
    document.getElementById('dash-window-loading')?.classList.remove('d-none');

    const cta = document.getElementById('dash-window-cta');
    cta.href = '#/dashboard';
    cta.textContent = 'Abrir módulo';
    cta.onclick = null;

    dashWindowModal.show();

    try {
      const query = buildDashboardQuery(periodo, sedeId);
      const data = await apiFetch(`/dashboard/detalle/${encodeURIComponent(tipo)}?${query}`);

      document.getElementById('dash-window-loading')?.classList.add('d-none');
      document.getElementById('dash-window-title').textContent = data.titulo || 'Detalle';
      document.getElementById('dash-window-valor-label').textContent = data.valorLabel || '';

      const valorEl = document.getElementById('dash-window-valor');
      if (typeof data.valor === 'number') {
        const esCantidad = ['unidades', 'reparaciones_activas', 'stock_bajo', 'clientes_nuevos', 'tiempo_promedio'].includes(tipo);
        valorEl.textContent = esCantidad
          ? (tipo === 'tiempo_promedio' ? `${data.valor} d` : String(data.valor))
          : formatterCOP.format(data.valor);
        valorEl.classList.toggle('is-negative', !esCantidad && data.valor < 0);
        valorEl.classList.toggle('is-positive', !esCantidad && data.valor >= 0 && tipo === 'utilidad');
      } else {
        valorEl.textContent = '—';
      }

      const filas = data.filas || [];
      const listEl = document.getElementById('dash-window-list');
      const emptyEl = document.getElementById('dash-window-empty');

      if (!filas.length) {
        emptyEl.textContent = data.vacio || 'Sin datos.';
        emptyEl.classList.remove('d-none');
        listEl.innerHTML = '';
      } else {
        emptyEl.classList.add('d-none');
        listEl.innerHTML = filas.map((row) => `
          <li class="dash-window__row">
            <div class="dash-window__row-main">
              <span class="dash-window__row-primary">${row.primaria || '—'}</span>
              <span class="dash-window__row-secondary">${row.secundaria || ''}</span>
            </div>
            ${row.monto !== null && row.monto !== undefined
              ? `<span class="dash-window__row-monto">${formatWindowMonto(row)}</span>`
              : ''}
          </li>
        `).join('');
      }

      cta.textContent = data.linkLabel || 'Abrir módulo';
      if (data.scrollTarget) {
        cta.href = '#/dashboard';
        cta.onclick = (e) => {
          e.preventDefault();
          dashWindowModal.hide();
          const el = document.getElementById(data.scrollTarget);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('dash-panel--highlight');
            window.setTimeout(() => el.classList.remove('dash-panel--highlight'), 1600);
          }
        };
      } else if (tipo === 'gasto_total' || tipo === 'gastos' || tipo === 'compras_pagadas') {
        cta.href = '#/dashboard';
        cta.onclick = (e) => {
          e.preventDefault();
          dashWindowModal.hide();
          document.querySelector('.dash-analisis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      } else {
        cta.href = data.link || '#/dashboard';
        cta.onclick = () => dashWindowModal.hide();
      }
    } catch (err) {
      document.getElementById('dash-window-loading')?.classList.add('d-none');
      document.getElementById('dash-window-title').textContent = 'No se pudo cargar';
      const emptyEl = document.getElementById('dash-window-empty');
      emptyEl.textContent = err.message || 'Error de conexión.';
      emptyEl.classList.remove('d-none');
    }
  }

  function bindDashWindows(root = document) {
    root.querySelectorAll('[data-dash-window]').forEach((el) => {
      if (el.dataset.dashBound) return;
      el.dataset.dashBound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const tipo = el.dataset.dashWindow;
        if (!tipo) return;
        el.classList.add('dash-kpi--active');
        window.setTimeout(() => el.classList.remove('dash-kpi--active'), 280);
        openDashWindow(tipo);
      });
    });
  }

  function formatBitacoraHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function renderBitacora(data) {
    const alertsEl = document.getElementById('dash-bitacora-alerts');
    const listEl = document.getElementById('dash-bitacora-list');
    const idleEl = document.getElementById('dash-bitacora-idle');
    if (!listEl || !idleEl) return;

    const alertas = data?.alertas || [];
    const eventos = data?.eventos || [];

    if (alertsEl) {
      if (alertas.length) {
        alertsEl.hidden = false;
        alertsEl.innerHTML = alertas.map((a) => `
          <button type="button"
            class="dash-bitacora__chip${a.tipo === 'stock_bajo' ? ' dash-bitacora__chip--alert' : ''}"
            data-dash-window="${a.detalleTipo}"
            aria-haspopup="dialog">
            <span class="dash-bitacora__chip-key">${a.clave || ''}</span>
            <span class="dash-bitacora__chip-label">${a.label}</span>
          </button>
        `).join('');
        bindDashWindows(alertsEl);
      } else {
        alertsEl.hidden = true;
        alertsEl.innerHTML = '';
      }
    }

    const showIdle = eventos.length === 0 && alertas.length === 0;
    idleEl.classList.toggle('d-none', !showIdle);
    listEl.classList.toggle('d-none', showIdle);

    if (showIdle) {
      listEl.innerHTML = '';
      return;
    }

    if (!eventos.length) {
      listEl.innerHTML = '';
      listEl.classList.add('d-none');
      return;
    }

    listEl.classList.remove('d-none');
    listEl.innerHTML = eventos.map((ev) => {
      const monto = ev.monto != null && ev.monto !== ''
        ? `<span class="dash-bitacora__monto">${formatterCOP.format(ev.monto)}</span>`
        : '';
      const hora = formatBitacoraHora(ev.cuando);
      return `
        <li>
          <a href="${ev.href || '#/dashboard'}" class="dash-bitacora__row">
            <span class="dash-bitacora__clave" aria-hidden="true">${ev.clave || '—'}</span>
            <span class="dash-bitacora__body">
              <span class="dash-bitacora__titulo">${ev.titulo || '—'}</span>
              <span class="dash-bitacora__detalle">${ev.detalle || ''}</span>
            </span>
            <span class="dash-bitacora__meta">
              ${monto}
              <time class="dash-bitacora__hora" datetime="${ev.cuando || ''}">${hora}</time>
            </span>
          </a>
        </li>
      `;
    }).join('');
  }

  function renderKPIs(kpis) {
    lastKpis = kpis;
    const operacion = document.getElementById('dash-kpi-operacion');
    const dinero = document.getElementById('dash-kpi-dinero');
    if (!operacion || !dinero) return;

    operacion.innerHTML = [
      kpiCard({
        window: 'ventas',
        title: 'Abrir ventas del período',
        iconClass: 'ti-receipt-2',
        value: formatterCOP.format(kpis.ventasTotal),
        label: 'Ventas'
      }),
      kpiCard({
        window: 'unidades',
        title: 'Abrir unidades vendidas',
        iconClass: 'ti-box',
        value: kpis.unidadesVendidas,
        label: 'Unidades'
      }),
      kpiCard({
        window: 'reparaciones_activas',
        title: 'Abrir reparaciones activas',
        iconClass: 'ti-tool',
        value: kpis.reparacionesActivas,
        label: 'Taller abierto',
        tone: kpis.reparacionesActivas > 0 ? 'warn' : ''
      }),
      kpiCard({
        window: 'tiempo_promedio',
        title: 'Abrir tiempos de reparación',
        iconClass: 'ti-clock',
        value: `${kpis.tiempoPromedio} d`,
        label: 'Tiempo medio'
      }),
      kpiCard({
        window: 'stock_bajo',
        title: 'Abrir stock bajo',
        iconClass: 'ti-alert-triangle',
        value: kpis.stockBajoCount,
        label: 'Stock bajo',
        tone: kpis.stockBajoCount > 0 ? 'alert' : '',
        valueClass: kpis.stockBajoCount > 0 ? 'is-alert' : ''
      }),
      kpiCard({
        window: 'clientes_nuevos',
        title: 'Abrir clientes nuevos',
        iconClass: 'ti-user-plus',
        value: kpis.clientesNuevos,
        label: 'Clientes nuevos'
      })
    ].join('');

    dinero.innerHTML = [
      kpiCard({
        window: 'caja',
        title: 'Abrir efectivo en caja',
        iconClass: 'ti-cash',
        value: formatterCOP.format(kpis.dineroEnCaja),
        label: 'En caja'
      }),
      kpiCard({
        window: 'cartera',
        title: 'Abrir cartera pendiente',
        iconClass: 'ti-file-invoice',
        value: formatterCOP.format(kpis.totalCartera),
        label: 'Cartera',
        tone: (kpis.totalCartera ?? 0) > 0 ? 'warn' : ''
      }),
      kpiCard({
        window: 'cartera_vencida',
        title: 'Abrir cartera vencida',
        iconClass: 'ti-alert-triangle',
        value: formatterCOP.format(kpis.totalCarteraVencida ?? 0),
        label: 'Vencida',
        tone: (kpis.totalCarteraVencida ?? 0) > 0 ? 'alert' : '',
        valueClass: (kpis.totalCarteraVencida ?? 0) > 0 ? 'is-alert' : ''
      }),
      kpiCard({
        window: 'cuentas_por_pagar',
        title: 'Abrir cuentas por pagar',
        iconClass: 'ti-building-bank',
        value: formatterCOP.format(kpis.cuentasPorPagar ?? 0),
        label: 'Por pagar',
        tone: (kpis.cuentasPorPagar ?? 0) > 0 ? 'alert' : '',
        valueClass: (kpis.cuentasPorPagar ?? 0) > 0 ? 'is-alert' : ''
      }),
      kpiCard({
        window: 'gastos',
        title: 'Abrir gastos de caja',
        iconClass: 'ti-receipt',
        value: formatterCOP.format(kpis.totalGastosOperativos ?? kpis.totalGastos),
        label: 'Gastos caja'
      }),
      kpiCard({
        window: 'compras_pagadas',
        title: 'Abrir compras pagadas',
        iconClass: 'ti-truck',
        value: formatterCOP.format(kpis.totalComprasPagadas ?? 0),
        label: 'Compras'
      }),
      kpiCard({
        window: 'gasto_total',
        title: 'Abrir gasto total',
        iconClass: 'ti-report-money',
        value: formatterCOP.format(kpis.totalGastoEmpresa ?? kpis.totalEgresos ?? 0),
        label: 'Gasto total',
        valueClass: 'is-out'
      }),
      kpiCard({
        window: 'utilidad',
        title: 'Abrir utilidad neta',
        iconClass: 'ti-chart-line',
        value: formatterCOP.format(kpis.resultadoNeto),
        label: 'Utilidad',
        tone: kpis.resultadoNeto >= 0 ? 'ok' : 'alert',
        valueClass: kpis.resultadoNeto >= 0 ? 'is-ok' : 'is-alert'
      })
    ].join('');

    bindDashWindows();
  }

  bindDashWindows();

  function renderBalance(kpis, periodo) {
    const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    const periodoText = PERIODO_LABELS[periodo] || periodo;

    const resultado = kpis.resultadoNeto ?? 0;
    const ventas = kpis.ventasTotal ?? 0;
    const gastoTotal = kpis.totalGastoEmpresa ?? kpis.totalEgresos ?? 0;
    const enCaja = kpis.dineroEnCaja ?? 0;

    const periodoEl = document.getElementById('dash-pulse-periodo');
    const resultadoEl = document.getElementById('dash-pulse-resultado');
    const ingresosEl = document.getElementById('dash-pulse-ingresos');
    const gastosEl = document.getElementById('dash-pulse-gastos');
    const cajaEl = document.getElementById('dash-pulse-caja');
    const barEl = document.getElementById('dash-pulse-bar');

    if (periodoEl) periodoEl.textContent = periodoText;
    if (resultadoEl) {
      resultadoEl.textContent = formatterCOP.format(resultado);
      resultadoEl.classList.remove('is-positive', 'is-negative');
      resultadoEl.classList.add(resultado >= 0 ? 'is-positive' : 'is-negative');
    }
    if (ingresosEl) ingresosEl.textContent = formatterCOP.format(ventas);
    if (gastosEl) gastosEl.textContent = formatterCOP.format(gastoTotal);
    if (cajaEl) cajaEl.textContent = formatterCOP.format(enCaja);

    if (barEl) {
      const suma = ventas + gastoTotal;
      const pct = suma > 0 ? Math.round((ventas / suma) * 100) : 50;
      barEl.style.width = `${Math.max(4, Math.min(96, pct))}%`;
    }
  }

  function aggregateProveedores(pagos) {
    const map = new Map();
    for (const p of pagos || []) {
      const key = p.proveedor || 'Proveedor';
      const prev = map.get(key) || { nombre: key, total: 0, count: 0 };
      prev.total += parseFloat(p.monto) || 0;
      prev.count += 1;
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  function renderAnalisisRank(listEl, emptyEl, rows, totalBase) {
    if (!listEl || !emptyEl) return;
    if (!rows.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('d-none');
      return;
    }
    emptyEl.classList.add('d-none');
    listEl.innerHTML = rows.slice(0, 5).map((row, i) => {
      const pct = totalBase > 0 ? Math.round((row.total / totalBase) * 1000) / 10 : 0;
      const barW = totalBase > 0 ? Math.max(4, Math.min(100, (row.total / totalBase) * 100)) : 0;
      return `
        <li class="dash-analisis__rank-row">
          <span class="dash-analisis__rank-idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="dash-analisis__rank-body">
            <span class="dash-analisis__rank-name" title="${row.nombre}">${row.nombre}</span>
            <span class="dash-analisis__rank-track" aria-hidden="true">
              <span class="dash-analisis__rank-fill" style="width:${barW}%"></span>
            </span>
          </span>
          <span class="dash-analisis__rank-meta">
            <span class="dash-analisis__rank-val">${formatterCOP.format(row.total)}</span>
            <span class="dash-analisis__rank-pct">${pct}%</span>
          </span>
        </li>
      `;
    }).join('');
  }

  function renderAnalisisGasto(kpis, gastosData, periodo) {
    const board = document.querySelector('.dash-analisis__board');
    if (!board) return;

    const gastoTotal = parseFloat(kpis.totalGastoEmpresa ?? 0);
    const caja = parseFloat(kpis.totalGastosOperativos ?? kpis.totalGastos ?? 0);
    const compras = parseFloat(kpis.totalComprasPagadas ?? 0);
    const ingresos = parseFloat(kpis.ventasTotal ?? 0);
    const porPagar = parseFloat(kpis.cuentasPorPagar ?? 0);
    const ordenes = parseFloat(kpis.totalOrdenesCompra ?? kpis.totalCompras ?? 0);
    const pagos = kpis.pagosComprasDetalle || [];
    const categorias = (gastosData?.porCategoria || [])
      .filter((c) => (c.total || 0) > 0)
      .map((c) => ({ nombre: c.nombre, total: parseFloat(c.total) || 0 }));
    const proveedores = aggregateProveedores(pagos);
    const detalleEgresos = gastosData?.detalle || [];

    const pctIngresos = ingresos > 0
      ? Math.round((gastoTotal / ingresos) * 1000) / 10
      : (gastoTotal > 0 ? null : 0);
    const pctCaja = gastoTotal > 0 ? Math.round((caja / gastoTotal) * 1000) / 10 : 0;
    const pctCompras = gastoTotal > 0 ? Math.round((compras / gastoTotal) * 1000) / 10 : 0;
    const barCaja = gastoTotal > 0 ? (caja / gastoTotal) * 100 : 0;
    const barCompras = gastoTotal > 0 ? (compras / gastoTotal) * 100 : 0;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('analisis-periodo-label', PERIODO_LABELS[periodo] || periodo);
    setText('analisis-gasto-total', formatterCOP.format(gastoTotal));
    setText('analisis-caja-val', formatterCOP.format(caja));
    setText('analisis-compras-val', formatterCOP.format(compras));
    setText('analisis-caja-pct', gastoTotal > 0 ? `${pctCaja}%` : '');
    setText('analisis-compras-pct', gastoTotal > 0 ? `${pctCompras}%` : '');
    setText('analisis-por-pagar', formatterCOP.format(porPagar));
    setText('analisis-ordenes', formatterCOP.format(ordenes));

    const vsEl = document.getElementById('analisis-vs-ingresos');
    if (vsEl) {
      if (pctIngresos == null) {
        vsEl.textContent = 'Sin ingresos en el período — solo salidas';
      } else if (gastoTotal === 0) {
        vsEl.textContent = '0% de los ingresos · sin salidas registradas';
      } else {
        vsEl.textContent = `${pctIngresos}% de los ingresos (${formatterCOP.format(ingresos)})`;
      }
    }

    const segCaja = document.getElementById('analisis-seg-caja');
    const segCompras = document.getElementById('analisis-seg-compras');
    if (segCaja) segCaja.style.width = `${gastoTotal > 0 ? barCaja : 0}%`;
    if (segCompras) segCompras.style.width = `${gastoTotal > 0 ? barCompras : 0}%`;
    document.getElementById('analisis-split-bar')?.classList.toggle('is-empty', gastoTotal <= 0);

    renderAnalisisRank(
      document.getElementById('analisis-rank-cat'),
      document.getElementById('analisis-rank-cat-empty'),
      categorias,
      caja || categorias.reduce((s, c) => s + c.total, 0)
    );
    renderAnalisisRank(
      document.getElementById('analisis-rank-prov'),
      document.getElementById('analisis-rank-prov-empty'),
      proveedores,
      compras || proveedores.reduce((s, p) => s + p.total, 0)
    );

    const detailWrap = document.getElementById('analisis-detail');
    const egresoSec = document.getElementById('dash-section-egresos');
    const gastoSec = document.getElementById('gasto-total-section');
    const showPagos = pagos.length > 0;
    const showEgresos = detalleEgresos.length > 0;
    detailWrap?.classList.toggle('d-none', !showPagos && !showEgresos);
    gastoSec?.classList.toggle('d-none', !showPagos);
    egresoSec?.classList.toggle('d-none', !showEgresos);

    const periodoLabel = document.getElementById('gasto-total-periodo-label');
    if (periodoLabel) periodoLabel.textContent = PERIODO_LABELS[periodo] || periodo;
    const totalLabel = document.getElementById('gastos-total-label');
    if (totalLabel) totalLabel.textContent = `Total: ${formatterCOP.format(gastosData?.totalGeneral || 0)}`;

    const tbodyPagos = document.getElementById('compras-pagadas-tbody');
    if (tbodyPagos) {
      tbodyPagos.innerHTML = showPagos
        ? pagos.map((p) => `
            <tr>
              <td class="text-nowrap">${new Date(p.fecha).toLocaleDateString('es-CO')}</td>
              <td><code class="small">${p.ordenRef}</code></td>
              <td class="text-truncate" style="max-width:140px" title="${p.proveedor}">${p.proveedor}</td>
              <td><span class="badge" style="background:${ORIGEN_COLORS[p.fuenteFondos] || '#64748b'}20;color:${ORIGEN_COLORS[p.fuenteFondos] || '#64748b'}">${p.fuenteLabel}</span></td>
              <td class="small text-secondary text-truncate" style="max-width:120px" title="${[p.pagadoPor, p.referencia].filter(Boolean).join(' — ')}">${[p.pagadoPor, p.referencia].filter(Boolean).join(' · ') || '—'}</td>
              <td class="text-end fw-bold text-danger text-nowrap">${formatterCOP.format(p.monto)}</td>
            </tr>
          `).join('')
        : '';
    }

    const tbodyEgresos = document.getElementById('gastos-detalle-tbody');
    if (tbodyEgresos) {
      tbodyEgresos.innerHTML = showEgresos
        ? detalleEgresos.map((e) => `
            <tr>
              <td class="text-nowrap">${new Date(e.fecha).toLocaleDateString('es-CO')}</td>
              <td><span class="badge bg-secondary-lt">${e.categoria}</span></td>
              <td class="text-truncate" style="max-width:180px" title="${e.motivo}">${e.motivo}</td>
              <td class="small">${e.usuario}</td>
              <td class="text-end fw-bold text-danger text-nowrap">${formatterCOP.format(e.monto)}</td>
            </tr>
          `).join('')
        : '';
    }

    bindDashWindows(board);
  }

  function renderChart(graficaData, bucket = 'day') {
    const ctx = document.getElementById('chart-ventas').getContext('2d');

    const labels = graficaData.map(d => {
      if (bucket === 'month') {
        const [y, m] = d.fecha.split('-');
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${meses[parseInt(m, 10) - 1]} ${y}`;
      }
      const dt = new Date(d.fecha + 'T12:00:00');
      return dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    });
    const ventasData = graficaData.map(d => d.ventas ?? d.total ?? 0);
    const egresosData = graficaData.map(d => d.gastoTotal ?? d.egresos ?? 0);

    if (chartVentasInstance) {
      chartVentasInstance.destroy();
    }

    const isDarkMode = document.body.getAttribute('data-bs-theme') === 'dark';
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
    const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';
    const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    chartVentasInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Ingresos (ventas)',
            data: ventasData,
            borderColor: CHART_INGRESO,
            backgroundColor: 'rgba(8, 145, 178, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: CHART_INGRESO
          },
          {
            label: 'Gasto total empresa',
            data: egresosData,
            borderColor: CHART_GASTO,
            backgroundColor: 'rgba(225, 29, 72, 0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: CHART_GASTO
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: textColor }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return ` ${context.dataset.label}: ${copFormatter.format(context.parsed.y)}`;
              }
            }
          }
        },
        scales: {
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: function(value) {
                if (value >= 1000000) return '$' + (value / 1000000) + 'M';
                if (value >= 1000) return '$' + (value / 1000) + 'K';
                return '$' + value;
              }
            }
          },
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor }
          }
        }
      }
    });
  }
}

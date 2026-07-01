import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

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
  container.innerHTML = `
    <div class="container-xl erp-module dash">
      <header class="dash-header d-print-none">
        <div>
          <div class="dash-header__eyebrow">Centro de control</div>
          <h1 class="dash-header__title">${config.empresa}</h1>
          <p class="dash-header__sub">${requiresSede && usuario.sedeNombre
            ? `Resumen de ${usuario.sedeNombre} · ${PERIODO_LABELS_EARLY[initialPeriodo] || 'período seleccionado'}`
            : 'Resumen operativo y financiero del período seleccionado'}</p>
        </div>
        <div class="dash-filters">
          ${isAdmin ? `
            <select id="filter-sede" class="form-select" aria-label="Filtrar por sede">
              <option value="" ${!initialSede ? 'selected' : ''}>Todas las sedes</option>
              ${sedes.map(s => `<option value="${s.id}" ${String(s.id) === String(initialSede) ? 'selected' : ''}>${s.nombre}</option>`).join('')}
            </select>
          ` : ''}
          <select id="filter-periodo" class="form-select" aria-label="Filtrar por período">
            ${PERIODOS_VALIDOS.map(p => `<option value="${p}" ${p === initialPeriodo ? 'selected' : ''}>${PERIODO_LABELS_EARLY[p]}</option>`).join('')}
          </select>
        </div>
      </header>

      <!-- Pulso financiero -->
      <section class="dash-pulse d-print-none" id="dash-pulse" aria-label="Balance del período">
        <div class="dash-pulse__main">
          <span class="dash-pulse__eyebrow">Balance neto · <span id="dash-pulse-periodo">Hoy</span></span>
          <div class="dash-pulse__value" id="dash-pulse-resultado">—</div>
          <div class="dash-pulse__sub">Ingresos por ventas menos gasto total de la empresa</div>
        </div>
        <div class="dash-pulse__stats">
          <div class="dash-pulse__stat">
            <span class="dash-pulse__stat-label">Ingresos</span>
            <span class="dash-pulse__stat-value" id="dash-pulse-ingresos" style="color:var(--dash-cyan)">—</span>
          </div>
          <div class="dash-pulse__stat">
            <span class="dash-pulse__stat-label">Gasto total</span>
            <span class="dash-pulse__stat-value" id="dash-pulse-gastos" style="color:var(--dash-negative)">—</span>
          </div>
          <div class="dash-pulse__stat">
            <span class="dash-pulse__stat-label">En caja</span>
            <span class="dash-pulse__stat-value" id="dash-pulse-caja">—</span>
          </div>
        </div>
        <div class="dash-pulse__bar-wrap" role="presentation" aria-hidden="true">
          <div class="dash-pulse__bar" id="dash-pulse-bar" style="width:50%"></div>
        </div>
      </section>

      <!-- KPIs agrupados -->
      <div class="dash-columns dash-columns--2 d-print-none">
        <section class="dash-section" aria-labelledby="dash-sec-operacion">
          <div class="dash-section__head">
            <h2 class="dash-section__title" id="dash-sec-operacion">Operación</h2>
            <span class="dash-section__hint">Ventas, taller e inventario</span>
          </div>
          <div id="dash-kpi-operacion" class="dash-kpi-grid dash-kpi-grid--6"></div>
        </section>
        <section class="dash-section" aria-labelledby="dash-sec-finanzas">
          <div class="dash-section__head">
            <h2 class="dash-section__title" id="dash-sec-finanzas">Finanzas</h2>
            <span class="dash-section__hint">Caja, cartera y egresos</span>
          </div>
          <div id="dash-kpi-finanzas" class="dash-kpi-grid dash-kpi-grid--6"></div>
        </section>
      </div>

      <!-- Gráfica + accesos rápidos -->
      <div class="row g-3 mb-4 d-print-none">
        <div class="col-lg-8">
          <div class="dash-panel" id="dashboard-chart">
            <div class="dash-panel__head">
              <h3 class="dash-panel__title" id="chart-ventas-title">Ingresos vs gasto total</h3>
            </div>
            <div class="dash-panel__body dash-panel__body--chart">
              <div class="dash-chart-wrap">
                <canvas id="chart-ventas"></canvas>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="dash-panel">
            <div class="dash-panel__head">
              <h3 class="dash-panel__title">Ir a módulo</h3>
            </div>
            <nav class="dash-quick" aria-label="Accesos rápidos">
              <a href="#/pos" class="dash-quick__item">
                <span class="dash-quick__dot" style="background:#0891b2"></span>
                <div>
                  <div class="dash-quick__label">Punto de venta</div>
                  <div class="dash-quick__desc">Facturar y cobrar en mostrador</div>
                </div>
              </a>
              <a href="#/reparaciones" class="dash-quick__item">
                <span class="dash-quick__dot" style="background:#d97706"></span>
                <div>
                  <div class="dash-quick__label">Taller de reparación</div>
                  <div class="dash-quick__desc">Órdenes activas y entregas</div>
                </div>
              </a>
              <a href="#/caja" class="dash-quick__item">
                <span class="dash-quick__dot" style="background:#e11d48"></span>
                <div>
                  <div class="dash-quick__label">Caja y egresos</div>
                  <div class="dash-quick__desc">Apertura, cierre y retiros</div>
                </div>
              </a>
              <a href="#/compras" class="dash-quick__item">
                <span class="dash-quick__dot" style="background:#7c3aed"></span>
                <div>
                  <div class="dash-quick__label">Compras a proveedores</div>
                  <div class="dash-quick__desc">Órdenes, recepción y pagos</div>
                </div>
              </a>
            </nav>
          </div>
        </div>
      </div>

      <!-- Gasto total desglosado -->
      <section id="gasto-total-section" class="dash-section d-none d-print-none" aria-labelledby="dash-gasto-title">
        <div class="dash-section__head">
          <h2 class="dash-section__title" id="dash-gasto-title">Gasto total de la empresa</h2>
          <span class="dash-section__hint" id="gasto-total-periodo-label"></span>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-4 col-lg-3">
            <div class="dash-gasto-hero h-100">
              <div class="dash-gasto-hero__label">Total en el período</div>
              <div id="gasto-total-monto" class="dash-gasto-hero__value">—</div>
              <div class="text-secondary" style="font-size:0.75rem">Caja + compras pagadas, sin doble conteo</div>
            </div>
          </div>
          <div class="col-md-8 col-lg-9">
            <div class="row g-2" id="gasto-origen-cards"></div>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-lg-4">
            <div class="dash-panel h-100">
              <div class="dash-panel__head">
                <h3 class="dash-panel__title">Por origen del dinero</h3>
              </div>
              <div class="dash-panel__body dash-panel__body--chart">
                <div class="dash-chart-wrap dash-chart-wrap--sm">
                  <canvas id="chart-gasto-origen"></canvas>
                </div>
                <div id="gasto-origen-empty" class="dash-empty d-none">Sin gastos en el período.</div>
              </div>
            </div>
          </div>
          <div class="col-lg-8">
            <div class="dash-panel h-100">
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
                  <tbody id="compras-pagadas-tbody">
                    <tr><td colspan="6" class="text-center py-4 text-secondary">Cargando…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Gastos por categoría -->
      <section class="dash-section d-print-none" id="dash-section-egresos" aria-labelledby="dash-cat-title">
        <div class="dash-section__head">
          <h2 class="dash-section__title" id="dash-cat-title">Egresos de caja por categoría</h2>
          <span class="dash-section__hint" id="gastos-total-label"></span>
        </div>
        <div class="row g-3">
          <div class="col-lg-5">
            <div class="dash-panel" id="dashboard-gastos-chart-card">
              <div class="dash-panel__body dash-panel__body--chart">
                <div class="dash-chart-wrap dash-chart-wrap--sm">
                  <canvas id="chart-gastos-categoria"></canvas>
                </div>
                <div id="gastos-categoria-empty" class="dash-empty d-none">
                  No hay egresos en este período. Registra uno en <a href="#/caja?accion=egreso">Caja → Egreso</a>.
                </div>
              </div>
            </div>
          </div>
          <div class="col-lg-7">
            <div class="dash-panel">
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
                  <tbody id="gastos-detalle-tbody">
                    <tr><td colspan="5" class="text-center py-4 text-secondary">Cargando…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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

  const GASTOS_CHART_COLORS = [
    '#0891b2', '#e11d48', '#d97706', '#059669', '#7c3aed', '#22d3ee', '#db2777', '#64748b'
  ];

  let chartVentasInstance = null;
  let chartGastosInstance = null;
  let chartGastoOrigenInstance = null;

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
      const kpis = await apiFetch(`/dashboard/kpis?${query}`);
      renderKPIs(kpis);
      renderBalance(kpis, periodo);
      renderGastoTotalDesglosado(kpis, periodo);

      const graficaRes = await apiFetch(`/dashboard/graficas/ventas?${query}`);
      const graficaData = Array.isArray(graficaRes) ? graficaRes : (graficaRes.data || []);
      document.getElementById('chart-ventas-title').textContent =
        `Ingresos vs Gasto total (${PERIODO_LABELS[periodo] || periodo})`;
      renderChart(graficaData, graficaRes.bucket);

      const gastosData = await apiFetch(`/dashboard/gastos-por-categoria?${query}`);
      renderGastosPorCategoria(gastosData);
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

  function kpiCard({ href, action, title, iconClass, iconBg, value, label, valueClass = '', hint = '', cta = '' }) {
    const ctaLabel = cta || (action ? 'Ver detalle' : 'Abrir módulo');
    return `
      <a href="${href}" class="dash-kpi" ${action ? `data-dash-action="${action}"` : ''} title="${title}">
        <span class="dash-kpi__icon ${iconBg}"><i class="ti ${iconClass}"></i></span>
        <span class="dash-kpi__body">
          <span class="dash-kpi__label">${label}</span>
          <span class="dash-kpi__value ${valueClass}">${value}</span>
          ${hint ? `<span class="dash-kpi__hint">${hint}</span>` : ''}
          <span class="dash-kpi__cta">${ctaLabel}<i class="ti ti-arrow-up-right" aria-hidden="true"></i></span>
        </span>
      </a>
    `;
  }

  function bindKpiInteractions() {
    const scrollTargets = {
      'scroll-gasto': 'gasto-total-section',
      'scroll-chart': 'dashboard-chart',
      'scroll-egresos': 'dash-section-egresos'
    };

    document.querySelectorAll('.dash-kpi[data-dash-action]').forEach((card) => {
      card.addEventListener('click', (e) => {
        const action = card.dataset.dashAction;
        const targetId = scrollTargets[action];
        if (!targetId) return;

        e.preventDefault();
        card.classList.add('dash-kpi--active');
        window.setTimeout(() => card.classList.remove('dash-kpi--active'), 350);

        const el = document.getElementById(targetId);
        if (el) {
          const highlightEl = el.closest('.dash-section') || el.closest('.dash-panel') || el;
          highlightEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          highlightEl.classList.add('dash-panel--highlight');
          window.setTimeout(() => highlightEl.classList.remove('dash-panel--highlight'), 1600);
        }
      });
    });
  }

  function renderKPIs(kpis) {
    const formatterCOP = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    });

    const operacion = document.getElementById('dash-kpi-operacion');
    const finanzas = document.getElementById('dash-kpi-finanzas');

    operacion.innerHTML = [
      kpiCard({
        href: '#/ventas',
        title: 'Ver historial de ventas',
        iconClass: 'ti-wallet',
        iconBg: 'bg-primary-lt text-primary',
        value: formatterCOP.format(kpis.ventasTotal),
        label: 'Ventas totales'
      }),
      kpiCard({
        href: '#/ventas',
        title: 'Ver unidades vendidas',
        iconClass: 'ti-shopping-cart',
        iconBg: 'bg-green-lt text-green',
        value: kpis.unidadesVendidas,
        label: 'Unidades vendidas'
      }),
      kpiCard({
        href: '#/reparaciones',
        title: 'Ver reparaciones activas',
        iconClass: 'ti-tool',
        iconBg: 'bg-yellow-lt text-yellow',
        value: kpis.reparacionesActivas,
        label: 'Reparaciones activas'
      }),
      kpiCard({
        href: '#/reparaciones',
        title: 'Ver tiempos de reparación',
        iconClass: 'ti-clock',
        iconBg: 'bg-purple-lt text-purple',
        value: `${kpis.tiempoPromedio} días`,
        label: 'Tiempo promedio'
      }),
      kpiCard({
        href: '#/inventario?alerta=bajo',
        title: 'Ver productos con stock bajo',
        iconClass: 'ti-alert-triangle',
        iconBg: 'bg-red-lt text-red',
        value: kpis.stockBajoCount,
        label: 'Stock bajo',
        valueClass: kpis.stockBajoCount > 0 ? 'text-danger' : ''
      }),
      kpiCard({
        href: '#/clientes',
        title: 'Ver clientes nuevos',
        iconClass: 'ti-users',
        iconBg: 'bg-cyan-lt text-cyan',
        value: kpis.clientesNuevos,
        label: 'Clientes nuevos'
      })
    ].join('');

    finanzas.innerHTML = [
      kpiCard({
        href: '#/caja',
        title: 'Ir a control de caja',
        iconClass: 'ti-cash',
        iconBg: 'bg-teal-lt text-teal',
        value: formatterCOP.format(kpis.dineroEnCaja),
        label: 'Dinero en caja'
      }),
      kpiCard({
        href: '#/cartera',
        title: 'Ver cartera pendiente',
        iconClass: 'ti-file-invoice',
        iconBg: 'bg-orange-lt text-orange',
        value: formatterCOP.format(kpis.totalCartera),
        label: 'Cartera pendiente'
      }),
      kpiCard({
        href: '#/caja?accion=egreso',
        action: 'scroll-egresos',
        title: 'Ver egresos por categoría',
        iconClass: 'ti-receipt',
        iconBg: 'bg-danger-lt text-danger',
        value: formatterCOP.format(kpis.totalGastosOperativos ?? kpis.totalGastos),
        label: 'Gastos de caja',
        cta: 'Ver categorías'
      }),
      kpiCard({
        href: '#/compras',
        title: 'Ver compras pagadas en el período',
        iconClass: 'ti-truck',
        iconBg: 'bg-indigo-lt text-indigo',
        value: formatterCOP.format(kpis.totalComprasPagadas ?? 0),
        label: 'Compras pagadas',
        cta: 'Ver órdenes'
      }),
      kpiCard({
        href: '#gasto-total-section',
        action: 'scroll-gasto',
        title: 'Ver desglose por origen del dinero',
        iconClass: 'ti-report-money',
        iconBg: 'bg-orange-lt text-orange',
        value: formatterCOP.format(kpis.totalGastoEmpresa ?? kpis.totalEgresos ?? 0),
        label: 'Gasto total empresa',
        valueClass: 'text-danger',
        cta: 'Ver desglose'
      }),
      kpiCard({
        href: '#dashboard-chart',
        action: 'scroll-chart',
        title: 'Ver gráfica de ingresos vs gastos',
        iconClass: 'ti-chart-line',
        iconBg: kpis.resultadoNeto >= 0 ? 'bg-green-lt text-green' : 'bg-red-lt text-red',
        value: formatterCOP.format(kpis.resultadoNeto),
        label: 'Resultado neto',
        valueClass: kpis.resultadoNeto >= 0 ? 'text-success' : 'text-danger',
        cta: 'Ver gráfica'
      })
    ].join('');

    bindKpiInteractions();
  }

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

  function renderGastoTotalDesglosado(kpis, periodo) {
    const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    const section = document.getElementById('gasto-total-section');
    if (!section) return;

    const total = kpis.totalGastoEmpresa ?? 0;
    const origenes = (kpis.gastosPorOrigen || []).filter(o => o.total > 0);
    const pagos = kpis.pagosComprasDetalle || [];

    section.classList.remove('d-none');
    const periodoLabel = document.getElementById('gasto-total-periodo-label');
    if (periodoLabel) periodoLabel.textContent = PERIODO_LABELS[periodo] || periodo;

    const totalEl = document.getElementById('gasto-total-monto');
    if (totalEl) totalEl.textContent = formatterCOP.format(total);

    const cardsEl = document.getElementById('gasto-origen-cards');
    if (cardsEl) {
      const allOrigenes = kpis.gastosPorOrigen || [];
      cardsEl.innerHTML = allOrigenes.map(o => `
        <div class="col-sm-6 col-lg-3">
          <div class="dash-origen-card" style="border-top-color:${ORIGEN_COLORS[o.clave] || '#64748b'}">
            <div class="dash-origen-card__name" title="${o.nombre}">${o.nombre}</div>
            <div class="dash-origen-card__value">${formatterCOP.format(o.total)}</div>
            <div class="dash-origen-card__pct">${o.porcentaje}% del total</div>
          </div>
        </div>
      `).join('');
    }

    const canvas = document.getElementById('chart-gasto-origen');
    const emptyEl = document.getElementById('gasto-origen-empty');
    const tieneDatos = origenes.length > 0 && total > 0;

    if (emptyEl) emptyEl.classList.toggle('d-none', tieneDatos);
    if (canvas) canvas.classList.toggle('d-none', !tieneDatos);

    if (chartGastoOrigenInstance) {
      chartGastoOrigenInstance.destroy();
      chartGastoOrigenInstance = null;
    }

    if (tieneDatos && canvas) {
      const isDarkMode = document.body.getAttribute('data-bs-theme') === 'dark';
      const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';
      chartGastoOrigenInstance = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: origenes.map(o => o.nombre),
          datasets: [{
            data: origenes.map(o => o.total),
            backgroundColor: origenes.map(o => ORIGEN_COLORS[o.clave] || '#64748b'),
            borderWidth: 2,
            borderColor: isDarkMode ? '#0d121f' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                  return ` ${ctx.label}: ${formatterCOP.format(ctx.parsed)} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }

    const tbody = document.getElementById('compras-pagadas-tbody');
    if (!tbody) return;
    if (pagos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-secondary">Sin pagos a proveedores en este período.</td></tr>`;
      return;
    }
    tbody.innerHTML = pagos.map(p => `
      <tr>
        <td class="text-nowrap">${new Date(p.fecha).toLocaleDateString('es-CO')}</td>
        <td><code class="small">${p.ordenRef}</code></td>
        <td class="text-truncate" style="max-width:140px" title="${p.proveedor}">${p.proveedor}</td>
        <td><span class="badge" style="background:${ORIGEN_COLORS[p.fuenteFondos] || '#64748b'}20;color:${ORIGEN_COLORS[p.fuenteFondos] || '#64748b'}">${p.fuenteLabel}</span></td>
        <td class="small text-secondary text-truncate" style="max-width:120px" title="${[p.pagadoPor, p.referencia].filter(Boolean).join(' — ')}">${[p.pagadoPor, p.referencia].filter(Boolean).join(' · ') || '—'}</td>
        <td class="text-end fw-bold text-danger text-nowrap">${formatterCOP.format(p.monto)}</td>
      </tr>
    `).join('');
  }

  function renderGastosPorCategoria(data) {
    const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    const tbody = document.getElementById('gastos-detalle-tbody');
    const emptyEl = document.getElementById('gastos-categoria-empty');
    const canvas = document.getElementById('chart-gastos-categoria');
    const totalLabel = document.getElementById('gastos-total-label');

    if (totalLabel) {
      totalLabel.textContent = `Total: ${formatterCOP.format(data.totalGeneral || 0)}`;
    }

    const categorias = data.porCategoria || [];
    const tieneDatos = categorias.length > 0 && (data.totalGeneral || 0) > 0;

    if (emptyEl) emptyEl.classList.toggle('d-none', tieneDatos);
    if (canvas) canvas.classList.toggle('d-none', !tieneDatos);

    if (chartGastosInstance) {
      chartGastosInstance.destroy();
      chartGastosInstance = null;
    }

    if (tieneDatos && canvas) {
      const isDarkMode = document.body.getAttribute('data-bs-theme') === 'dark';
      const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';

      chartGastosInstance = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: categorias.map(c => c.nombre),
          datasets: [{
            data: categorias.map(c => c.total),
            backgroundColor: categorias.map((_, i) => GASTOS_CHART_COLORS[i % GASTOS_CHART_COLORS.length]),
            borderWidth: 2,
            borderColor: isDarkMode ? '#0d121f' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor, boxWidth: 12, padding: 10, font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = data.totalGeneral > 0
                    ? ((ctx.parsed / data.totalGeneral) * 100).toFixed(1)
                    : 0;
                  return ` ${ctx.label}: ${formatterCOP.format(ctx.parsed)} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }

    if (!tbody) return;

    const detalle = data.detalle || [];
    if (detalle.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-secondary">Sin egresos en el período seleccionado.</td></tr>`;
      return;
    }

    tbody.innerHTML = detalle.map(e => `
      <tr>
        <td class="text-nowrap">${new Date(e.fecha).toLocaleDateString('es-CO')}</td>
        <td><span class="badge bg-secondary-lt">${e.categoria}</span></td>
        <td class="text-truncate" style="max-width:180px" title="${e.motivo}">${e.motivo}</td>
        <td class="small">${e.usuario}</td>
        <td class="text-end fw-bold text-danger text-nowrap">${formatterCOP.format(e.monto)}</td>
      </tr>
    `).join('');
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

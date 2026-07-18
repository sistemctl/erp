import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';

export async function initRentabilidad(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  const isContador = usuario.rol === 'contador';

  if (!isAdminOrGerente && !isContador) {
    container.innerHTML = `
      <div class="container-xl erp-module py-5">
        <div class="alert alert-danger">
          <h4 class="alert-title">Acceso denegado</h4>
          <div class="text-secondary">No tienes permisos para ver el análisis de rentabilidad.</div>
        </div>
      </div>
    `;
    return;
  }

  let tecnicos = [];
  let sedes = [];
  let vendedores = [];
  try {
    const allUsers = await apiFetch('/config/usuarios-operativos').catch(() => []);
    tecnicos = allUsers.filter(u => u.rol === 'tecnico');
    vendedores = allUsers;
    sedes = await apiFetch('/config/sedes').catch(() => []);
  } catch (e) {
    console.error('Error al precargar filtros:', e);
  }

  const formatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  });

  function clampPct(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function margenTone(pct) {
    if (pct < 0) return 'is-neg';
    if (pct < 20) return 'is-low';
    if (pct < 45) return 'is-mid';
    return 'is-high';
  }

  function renderMargenMeter(pct) {
    const p = Number.isFinite(pct) ? pct : 0;
    const width = clampPct(Math.abs(p));
    return `
      <div class="rentab-meter ${margenTone(p)}" title="${p.toFixed(1)}%">
        <div class="rentab-meter__track">
          <div class="rentab-meter__fill" style="--rentab-fill:${width}%"></div>
        </div>
        <span class="rentab-meter__label">${p.toFixed(1)}%</span>
      </div>
    `;
  }

  function renderMargenStrip(el, {
    ingresos,
    costos,
    margen,
    ingresoLabel = 'Ingresos',
    costoLabel = 'Costos',
    margenLabel = 'Margen neto'
  }) {
    const pct = ingresos > 0 ? (margen / ingresos) * 100 : 0;
    const costShare = ingresos > 0 ? clampPct((costos / ingresos) * 100) : 0;
    const gainShare = margen < 0 ? 0 : (ingresos > 0 ? clampPct((margen / ingresos) * 100) : 0);
    const barCost = margen < 0 ? 100 : costShare;

    el.innerHTML = `
      <div class="rentab-strip" data-tone="${margenTone(pct)}">
        <div class="rentab-strip__equation">
          <div class="rentab-strip__cell">
            <span class="rentab-strip__label">${ingresoLabel}</span>
            <span class="rentab-strip__value">${formatter.format(ingresos)}</span>
          </div>
          <span class="rentab-strip__op" aria-hidden="true">−</span>
          <div class="rentab-strip__cell rentab-strip__cell--cost">
            <span class="rentab-strip__label">${costoLabel}</span>
            <span class="rentab-strip__value">${formatter.format(costos)}</span>
          </div>
          <span class="rentab-strip__op" aria-hidden="true">=</span>
          <div class="rentab-strip__cell rentab-strip__cell--margen">
            <span class="rentab-strip__label">${margenLabel}</span>
            <span class="rentab-strip__value">${formatter.format(margen)}</span>
          </div>
          <div class="rentab-strip__pct">
            <span class="rentab-strip__label">Margen</span>
            <span class="rentab-strip__pct-value">${pct.toFixed(1)}%</span>
          </div>
        </div>
        <div class="rentab-strip__compose" role="img" aria-label="Composición del ingreso: costos y margen">
          <div class="rentab-strip__seg rentab-strip__seg--cost" style="--rentab-seg:${barCost}%"></div>
          <div class="rentab-strip__seg rentab-strip__seg--gain" style="--rentab-seg:${gainShare}%"></div>
        </div>
        <div class="rentab-strip__legend">
          <span><i class="rentab-dot rentab-dot--cost"></i> Costo sobre ingreso</span>
          <span><i class="rentab-dot rentab-dot--gain"></i> Margen sobre ingreso</span>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      el.querySelector('.rentab-strip')?.classList.add('is-ready');
    });
  }

  container.innerHTML = `
    <div class="container-xl erp-module rentab">
      ${erpHeader({
        eyebrow: 'Rentabilidad',
        title: 'Márgenes de reparaciones',
        subtitle: 'Solo órdenes entregadas: lo cobrado frente al costo real de repuestos',
        titleId: 'rentabilidad-title',
        subId: 'rentabilidad-subtitle'
      })}

      <div class="rentab-switch d-print-none" role="tablist" aria-label="Vista de rentabilidad">
        <button type="button" class="rentab-switch__btn is-active" id="btn-tab-reparaciones" role="tab" aria-selected="true">
          <i class="ti ti-tool" aria-hidden="true"></i>
          <span>Reparaciones</span>
        </button>
        <button type="button" class="rentab-switch__btn" id="btn-tab-ventas" role="tab" aria-selected="false">
          <i class="ti ti-shopping-cart" aria-hidden="true"></i>
          <span>Ventas POS</span>
        </button>
        <button type="button" class="rentab-switch__btn" id="btn-tab-caja" role="tab" aria-selected="false">
          <i class="ti ti-wallet" aria-hidden="true"></i>
          <span>Caja consolidada</span>
        </button>
      </div>

      <div id="sec-reparaciones" class="rentab-panel">
        <form id="form-filtros-reparaciones" class="rentab-filters d-print-none">
          <div class="rentab-filters__field">
            <label class="rentab-filters__label" for="filtro-tecnico">Técnico</label>
            <select id="filtro-tecnico" class="form-select">
              <option value="">Todos</option>
              ${tecnicos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="rentab-filters__field">
            <label class="rentab-filters__label" for="filtro-desde-rep">Desde</label>
            <input type="date" id="filtro-desde-rep" class="form-control">
          </div>
          <div class="rentab-filters__field">
            <label class="rentab-filters__label" for="filtro-hasta-rep">Hasta</label>
            <input type="date" id="filtro-hasta-rep" class="form-control">
          </div>
          <div class="rentab-filters__action">
            <button type="submit" class="btn btn-primary rentab-filters__submit">
              <i class="ti ti-filter me-1"></i>Aplicar
            </button>
          </div>
        </form>

        <div id="kpis-reparaciones" class="rentab-strip-host"></div>

        <section class="rentab-ledger">
          <header class="rentab-ledger__head">
            <div>
              <h2 class="rentab-ledger__title">Desglose · soporte técnico</h2>
              <p class="rentab-ledger__hint">Cada fila es una orden entregada</p>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm rentab-print" onclick="window.print()">
              <i class="ti ti-printer me-1"></i>Imprimir
            </button>
          </header>
          <div class="table-responsive">
            <table class="table table-vcenter rentab-table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Fecha</th>
                  <th>Equipo</th>
                  <th>Técnico</th>
                  <th class="text-end">Mano de obra</th>
                  <th class="text-end">Costo repuestos</th>
                  <th class="text-end">Total cobrado</th>
                  <th class="text-end">Margen</th>
                  <th>Margen %</th>
                </tr>
              </thead>
              <tbody id="reparaciones-table-body"></tbody>
            </table>
          </div>
        </section>
      </div>

      <div id="sec-ventas" class="rentab-panel d-none">
        <form id="form-filtros-ventas" class="rentab-filters d-print-none">
          <div class="rentab-filters__field">
            <label class="rentab-filters__label" for="filtro-sede">Sede</label>
            <select id="filtro-sede" class="form-select">
              <option value="">Todas</option>
              ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="rentab-filters__field rentab-filters__field--wide">
            <label class="rentab-filters__label" for="filtro-vendedor">Vendedor</label>
            <select id="filtro-vendedor" class="form-select">
              <option value="">Todos</option>
              ${vendedores.map(v => `<option value="${v.id}">${v.nombre} (${v.rol})</option>`).join('')}
            </select>
          </div>
          <div class="rentab-filters__field">
            <label class="rentab-filters__label" for="filtro-desde-vta">Desde</label>
            <input type="date" id="filtro-desde-vta" class="form-control">
          </div>
          <div class="rentab-filters__field">
            <label class="rentab-filters__label" for="filtro-hasta-vta">Hasta</label>
            <input type="date" id="filtro-hasta-vta" class="form-control">
          </div>
          <div class="rentab-filters__action">
            <button type="submit" class="btn btn-primary rentab-filters__submit">
              <i class="ti ti-filter me-1"></i>Aplicar
            </button>
          </div>
        </form>

        <div id="kpis-ventas" class="rentab-strip-host"></div>

        <section class="rentab-ledger">
          <header class="rentab-ledger__head">
            <div>
              <h2 class="rentab-ledger__title">Desglose · ventas POS</h2>
              <p class="rentab-ledger__hint">Costo de inventario frente al total de la venta</p>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm rentab-print" onclick="window.print()">
              <i class="ti ti-printer me-1"></i>Imprimir
            </button>
          </header>
          <div class="table-responsive">
            <table class="table table-vcenter rentab-table">
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Fecha</th>
                  <th>Sede</th>
                  <th>Cliente</th>
                  <th>Artículos</th>
                  <th>Vendedor</th>
                  <th class="text-end">Costo</th>
                  <th class="text-end">Total venta</th>
                  <th class="text-end">Margen</th>
                  <th>Margen %</th>
                </tr>
              </thead>
              <tbody id="ventas-table-body"></tbody>
            </table>
          </div>
        </section>
      </div>

      <div id="sec-caja" class="rentab-panel d-none">
        <form id="form-filtros-caja" class="rentab-filters d-print-none">
          <div class="rentab-filters__field rentab-filters__field--wide">
            <label class="rentab-filters__label" for="filtro-sede-caja">Sede</label>
            <select id="filtro-sede-caja" class="form-select">
              <option value="">Todas</option>
              ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="rentab-filters__field">
            <label class="rentab-filters__label" for="filtro-desde-caja">Desde</label>
            <input type="date" id="filtro-desde-caja" class="form-control">
          </div>
          <div class="rentab-filters__field">
            <label class="rentab-filters__label" for="filtro-hasta-caja">Hasta</label>
            <input type="date" id="filtro-hasta-caja" class="form-control">
          </div>
          <div class="rentab-filters__action">
            <button type="submit" class="btn btn-primary rentab-filters__submit">
              <i class="ti ti-filter me-1"></i>Aplicar
            </button>
          </div>
        </form>

        <div id="kpis-caja" class="rentab-strip-host"></div>

        <section class="rentab-ledger">
          <header class="rentab-ledger__head">
            <div>
              <h2 class="rentab-ledger__title">Desglose · caja consolidada</h2>
              <p class="rentab-ledger__hint">Ventas, reparaciones e instalaciones cobradas</p>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm rentab-print" onclick="window.print()">
              <i class="ti ti-printer me-1"></i>Imprimir
            </button>
          </header>
          <div class="table-responsive">
            <table class="table table-vcenter rentab-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Referencia</th>
                  <th>Fecha</th>
                  <th>Sede</th>
                  <th>Cliente</th>
                  <th class="text-end">Costo</th>
                  <th class="text-end">Recaudado</th>
                  <th class="text-end">Margen</th>
                  <th>Margen %</th>
                </tr>
              </thead>
              <tbody id="caja-table-body"></tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;

  const titleEl = document.getElementById('rentabilidad-title');
  const subtitleEl = document.getElementById('rentabilidad-subtitle');
  const btnReparaciones = document.getElementById('btn-tab-reparaciones');
  const btnVentas = document.getElementById('btn-tab-ventas');
  const btnCaja = document.getElementById('btn-tab-caja');
  const secReparaciones = document.getElementById('sec-reparaciones');
  const secVentas = document.getElementById('sec-ventas');
  const secCaja = document.getElementById('sec-caja');

  const tbodyReparaciones = document.getElementById('reparaciones-table-body');
  const kpisReparaciones = document.getElementById('kpis-reparaciones');
  const tbodyVentas = document.getElementById('ventas-table-body');
  const kpisVentas = document.getElementById('kpis-ventas');
  const tbodyCaja = document.getElementById('caja-table-body');
  const kpisCaja = document.getElementById('kpis-caja');

  function setTab(active) {
    const map = [
      { btn: btnReparaciones, sec: secReparaciones, key: 'rep' },
      { btn: btnVentas, sec: secVentas, key: 'vta' },
      { btn: btnCaja, sec: secCaja, key: 'caja' }
    ];
    map.forEach(({ btn, sec, key }) => {
      const on = key === active;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      sec.classList.toggle('d-none', !on);
    });
  }

  btnReparaciones.addEventListener('click', () => {
    setTab('rep');
    titleEl.textContent = 'Márgenes de reparaciones';
    subtitleEl.textContent = 'Solo órdenes entregadas: lo cobrado frente al costo real de repuestos';
    loadReparacionesReport();
  });

  btnVentas.addEventListener('click', () => {
    setTab('vta');
    titleEl.textContent = 'Márgenes de ventas POS';
    subtitleEl.textContent = 'Precio de venta frente al costo de adquisición del inventario';
    loadVentasReport();
  });

  btnCaja.addEventListener('click', () => {
    setTab('caja');
    titleEl.textContent = 'Márgenes de caja';
    subtitleEl.textContent = 'Margen neto consolidado de ventas, reparaciones e instalaciones';
    loadCajaReport();
  });

  async function loadReparacionesReport() {
    tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="rentab-table__loading"><span class="spinner-border spinner-border-sm text-primary" role="status"></span> Cargando…</td></tr>`;
    kpisReparaciones.innerHTML = '';

    try {
      const tecnico = document.getElementById('filtro-tecnico').value;
      const desde = document.getElementById('filtro-desde-rep').value;
      const hasta = document.getElementById('filtro-hasta-rep').value;

      const params = [];
      if (tecnico) params.push(`tecnico=${tecnico}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      const query = params.length ? `?${params.join('&')}` : '';

      const data = await apiFetch(`/reparaciones/rentabilidad/reporte${query}`);

      if (data.length === 0) {
        tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="rentab-table__empty">No hay reparaciones entregadas en este período. El cobro se registra al entregar el equipo.</td></tr>`;
        kpisReparaciones.innerHTML = '';
        return;
      }

      let totalCobradoAcum = 0;
      let totalCostoAcum = 0;
      let totalMargenAcum = 0;

      tbodyReparaciones.innerHTML = data.map((r, i) => {
        const orden = r.orden || {};
        const manoObra = parseFloat(orden.costoManoObra || 0);
        const costoRepuestos = parseFloat(orden.costoRepuestos || 0);
        const cobrado = parseFloat(r.totalCobrado || 0);
        const costoReal = parseFloat(r.costoReal || 0);
        const margen = cobrado - costoReal;
        const pctMargen = cobrado > 0 ? (margen / cobrado) * 100 : 0;

        totalCobradoAcum += cobrado;
        totalCostoAcum += costoReal;
        totalMargenAcum += margen;

        return `
          <tr style="--rentab-row:${i}">
            <td><strong class="rentab-ref">${orden.numeroOrden || 'N/A'}</strong></td>
            <td class="rentab-muted">${orden.createdAt ? new Date(orden.createdAt).toLocaleDateString('es-CO') : '—'}</td>
            <td>${[orden.tipoEquipo, orden.marca, orden.modelo].filter(Boolean).join(' ') || '—'}</td>
            <td>${orden.tecnico ? orden.tecnico.nombre : '—'}</td>
            <td class="text-end rentab-num">${formatter.format(manoObra)}</td>
            <td class="text-end rentab-num rentab-num--cost">${formatter.format(costoRepuestos)}</td>
            <td class="text-end rentab-num rentab-num--ink">${formatter.format(cobrado)}</td>
            <td class="text-end rentab-num ${margen >= 0 ? 'rentab-num--gain' : 'rentab-num--loss'}">${formatter.format(margen)}</td>
            <td>${renderMargenMeter(pctMargen)}</td>
          </tr>
        `;
      }).join('');

      renderMargenStrip(kpisReparaciones, {
        ingresos: totalCobradoAcum,
        costos: totalCostoAcum,
        margen: totalMargenAcum,
        ingresoLabel: 'Ingresos',
        costoLabel: 'Costo repuestos',
        margenLabel: 'Margen neto'
      });
    } catch (err) {
      tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="rentab-table__empty text-danger">Error al cargar: ${err.message}</td></tr>`;
      kpisReparaciones.innerHTML = '';
    }
  }

  async function loadVentasReport() {
    tbodyVentas.innerHTML = `<tr><td colspan="10" class="rentab-table__loading"><span class="spinner-border spinner-border-sm text-primary" role="status"></span> Cargando…</td></tr>`;
    kpisVentas.innerHTML = '';

    try {
      const SedeId = document.getElementById('filtro-sede').value;
      const vendedor = document.getElementById('filtro-vendedor').value;
      const desde = document.getElementById('filtro-desde-vta').value;
      const hasta = document.getElementById('filtro-hasta-vta').value;

      const params = [];
      if (SedeId) params.push(`sede=${SedeId}`);
      if (vendedor) params.push(`usuario=${vendedor}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      const query = params.length ? `?${params.join('&')}` : '';

      const ventas = await apiFetch(`/ventas${query}`);
      const ventasValidas = ventas.filter(v => v.estado !== 'anulada');

      if (ventasValidas.length === 0) {
        tbodyVentas.innerHTML = `<tr><td colspan="10" class="rentab-table__empty">No hay ventas en este período.</td></tr>`;
        kpisVentas.innerHTML = '';
        return;
      }

      let totalVentasAcum = 0;
      let totalCostoAcum = 0;
      let totalMargenAcum = 0;

      tbodyVentas.innerHTML = ventasValidas.map((v, i) => {
        const totalVenta = parseFloat(v.total || 0);
        let costoVenta = 0;
        const itemsInfo = (v.items || []).map(item => {
          const costoUnit = parseFloat(item.producto ? item.producto.precioCosto : 0);
          costoVenta += costoUnit * parseInt(item.cantidad || 0, 10);
          return `${item.cantidad}× ${item.producto ? item.producto.nombre : 'N/A'}`;
        }).join(', ');

        const margen = totalVenta - costoVenta;
        const pctMargen = totalVenta > 0 ? (margen / totalVenta) * 100 : 0;

        totalVentasAcum += totalVenta;
        totalCostoAcum += costoVenta;
        totalMargenAcum += margen;

        return `
          <tr style="--rentab-row:${i}">
            <td><strong class="rentab-ref">${v.numeroVenta || 'N/A'}</strong></td>
            <td class="rentab-muted">${v.createdAt ? new Date(v.createdAt).toLocaleDateString('es-CO') : '—'}</td>
            <td>${v.sede ? v.sede.nombre : '—'}</td>
            <td>${v.cliente ? v.cliente.nombre : 'Cliente general'}</td>
            <td class="rentab-items" title="${itemsInfo}">${itemsInfo || '—'}</td>
            <td>${v.usuario ? v.usuario.nombre : '—'}</td>
            <td class="text-end rentab-num rentab-num--cost">${formatter.format(costoVenta)}</td>
            <td class="text-end rentab-num rentab-num--ink">${formatter.format(totalVenta)}</td>
            <td class="text-end rentab-num ${margen >= 0 ? 'rentab-num--gain' : 'rentab-num--loss'}">${formatter.format(margen)}</td>
            <td>${renderMargenMeter(pctMargen)}</td>
          </tr>
        `;
      }).join('');

      renderMargenStrip(kpisVentas, {
        ingresos: totalVentasAcum,
        costos: totalCostoAcum,
        margen: totalMargenAcum,
        ingresoLabel: 'Ventas',
        costoLabel: 'Costo inventario',
        margenLabel: 'Margen neto'
      });
    } catch (err) {
      tbodyVentas.innerHTML = `<tr><td colspan="10" class="rentab-table__empty text-danger">Error al cargar: ${err.message}</td></tr>`;
      kpisVentas.innerHTML = '';
    }
  }

  async function loadCajaReport() {
    tbodyCaja.innerHTML = `<tr><td colspan="9" class="rentab-table__loading"><span class="spinner-border spinner-border-sm text-primary" role="status"></span> Cargando…</td></tr>`;
    kpisCaja.innerHTML = '';

    try {
      const SedeId = document.getElementById('filtro-sede-caja').value;
      const desde = document.getElementById('filtro-desde-caja').value;
      const hasta = document.getElementById('filtro-hasta-caja').value;

      const params = [];
      if (SedeId) params.push(`sede=${SedeId}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      const query = params.length ? `?${params.join('&')}` : '';
      const queryInst = params.length
        ? `?estado=entregada&${params.join('&')}`
        : '?estado=entregada';

      const [ventas, reparaciones, instalaciones] = await Promise.all([
        apiFetch(`/ventas${query}`).catch(() => []),
        apiFetch(`/reparaciones${query}`).catch(() => []),
        apiFetch(`/instalaciones${queryInst}`).catch(() => [])
      ]);

      const ventasValidas = ventas.filter(v => v.estado !== 'anulada');
      const reparacionesEntregadas = reparaciones.filter(o => o.estado === 'entregado');
      const instalacionesEntregadas = (Array.isArray(instalaciones) ? instalaciones : [])
        .filter(o => o.estado === 'entregada');

      if (
        ventasValidas.length === 0 &&
        reparacionesEntregadas.length === 0 &&
        instalacionesEntregadas.length === 0
      ) {
        tbodyCaja.innerHTML = `<tr><td colspan="9" class="rentab-table__empty">No hay movimientos cobrados en este período.</td></tr>`;
        return;
      }

      const itemsCaja = [];
      let totalIngresos = 0;
      let totalCostos = 0;
      let totalMargen = 0;

      ventasValidas.forEach(v => {
        const totalVenta = parseFloat(v.total || 0);
        let costoVenta = 0;
        (v.items || []).forEach(item => {
          const costoUnit = parseFloat(item.producto ? item.producto.precioCosto : 0);
          costoVenta += costoUnit * parseInt(item.cantidad || 0, 10);
        });
        const margen = totalVenta - costoVenta;
        totalIngresos += totalVenta;
        totalCostos += costoVenta;
        totalMargen += margen;
        itemsCaja.push({
          tipo: 'VENTA',
          tipoClass: 'rentab-tipo--venta',
          referencia: v.numeroVenta || 'N/A',
          fecha: new Date(v.createdAt),
          sede: v.sede ? v.sede.nombre : '—',
          cliente: v.cliente ? v.cliente.nombre : 'Cliente general',
          costo: costoVenta,
          total: totalVenta,
          margen
        });
      });

      reparacionesEntregadas.forEach(o => {
        const cobrado = parseFloat(o.totalCobrado || 0);
        const costoRepuestos = parseFloat(o.costoRepuestos || 0);
        const margen = cobrado - costoRepuestos;
        totalIngresos += cobrado;
        totalCostos += costoRepuestos;
        totalMargen += margen;
        itemsCaja.push({
          tipo: 'REPARACIÓN',
          tipoClass: 'rentab-tipo--rep',
          referencia: o.numeroOrden || 'N/A',
          fecha: new Date(o.createdAt),
          sede: o.sede ? o.sede.nombre : '—',
          cliente: o.cliente ? o.cliente.nombre : 'Cliente general',
          costo: costoRepuestos,
          total: cobrado,
          margen
        });
      });

      instalacionesEntregadas.forEach(o => {
        const cobrado = parseFloat(o.totalCobrado || 0);
        const costoMateriales = parseFloat(o.costoMateriales || 0);
        const margen = cobrado - costoMateriales;
        totalIngresos += cobrado;
        totalCostos += costoMateriales;
        totalMargen += margen;
        itemsCaja.push({
          tipo: 'INSTALACIÓN',
          tipoClass: 'rentab-tipo--inst',
          referencia: o.numeroOrden || 'N/A',
          fecha: new Date(o.updatedAt || o.createdAt),
          sede: o.sede ? o.sede.nombre : '—',
          cliente: o.cliente ? o.cliente.nombre : 'Cliente general',
          costo: costoMateriales,
          total: cobrado,
          margen
        });
      });

      itemsCaja.sort((a, b) => b.fecha - a.fecha);

      tbodyCaja.innerHTML = itemsCaja.map((item, i) => {
        const pctMargen = item.total > 0 ? (item.margen / item.total) * 100 : 0;
        return `
          <tr style="--rentab-row:${i}">
            <td><span class="rentab-tipo ${item.tipoClass}">${item.tipo}</span></td>
            <td><strong class="rentab-ref">${item.referencia}</strong></td>
            <td class="rentab-muted">${item.fecha.toLocaleDateString('es-CO')}</td>
            <td>${item.sede}</td>
            <td>${item.cliente}</td>
            <td class="text-end rentab-num rentab-num--cost">${formatter.format(item.costo)}</td>
            <td class="text-end rentab-num rentab-num--ink">${formatter.format(item.total)}</td>
            <td class="text-end rentab-num ${item.margen >= 0 ? 'rentab-num--gain' : 'rentab-num--loss'}">${formatter.format(item.margen)}</td>
            <td>${renderMargenMeter(pctMargen)}</td>
          </tr>
        `;
      }).join('');

      renderMargenStrip(kpisCaja, {
        ingresos: totalIngresos,
        costos: totalCostos,
        margen: totalMargen,
        ingresoLabel: 'Recaudado',
        costoLabel: 'Costo operación',
        margenLabel: 'Margen neto'
      });
    } catch (err) {
      tbodyCaja.innerHTML = `<tr><td colspan="9" class="rentab-table__empty text-danger">Error al cargar: ${err.message}</td></tr>`;
      kpisCaja.innerHTML = '';
    }
  }

  document.getElementById('form-filtros-reparaciones').addEventListener('submit', (e) => {
    e.preventDefault();
    loadReparacionesReport();
  });
  document.getElementById('form-filtros-ventas').addEventListener('submit', (e) => {
    e.preventDefault();
    loadVentasReport();
  });
  document.getElementById('form-filtros-caja').addEventListener('submit', (e) => {
    e.preventDefault();
    loadCajaReport();
  });

  loadReparacionesReport();
}

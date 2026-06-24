import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

export async function initVentas(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'gerente_sede'].includes(usuario.rol);
  const isContador = usuario.rol === 'contador';

  let ventas = [];
  let vendedores = [];
  let sedes = [];

  async function loadInitialData() {
    try {
      ventas = await apiFetch('/ventas');
      vendedores = await apiFetch('/config/usuarios').then(users => users.filter(u => ['admin', 'gerente_sede', 'cajero'].includes(u.rol) && u.activo));
      sedes = await apiFetch('/config/sedes').catch(() => []);
    } catch (e) {
      console.error('Error precargando datos en ventas:', e);
    }
  }

  await loadInitialData();

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Módulo de Ventas & Comisiones</h2>
            <div class="text-secondary mt-1">Historial de transacciones, liquidación de comisiones y reporte de descuentos</div>
          </div>
        </div>
      </div>

      <!-- Navigation tabs -->
      <div class="card mb-4 d-print-none">
        <div class="card-header">
          <ul class="nav nav-tabs card-header-tabs" data-bs-toggle="tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <a href="#tab-historial" class="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab">
                <i class="ti ti-history me-1"></i> Historial de Ventas
              </a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-comisiones" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-percentage me-1"></i> Comisiones de Vendedores
              </a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-descuentos" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-discount-2 me-1"></i> Reporte de Descuentos (Price Override)
              </a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <!-- TAB 1: HISTORIAL DE VENTAS -->
            <div class="tab-pane active show" id="tab-historial" role="tabpanel">
              <form id="form-filtros-ventas" class="row g-3 mb-4">
                <div class="col-md-3">
                  <label class="form-label">Buscar Venta / Cliente</label>
                  <input type="text" id="filtro-buscar-venta" class="form-control" placeholder="No. Venta o Cliente...">
                </div>
                <div class="col-md-2">
                  <label class="form-label">Vendedor</label>
                  <select id="filtro-vendedor-venta" class="form-select">
                    <option value="">-- Todos --</option>
                    ${vendedores.map(v => `<option value="${v.id}">${v.nombre}</option>`).join('')}
                  </select>
                </div>
                ${isAdminOrGerente && usuario.rol === 'admin' ? `
                  <div class="col-md-2">
                    <label class="form-label">Sede</label>
                    <select id="filtro-sede-venta" class="form-select">
                      <option value="">-- Todas --</option>
                      ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                    </select>
                  </div>
                ` : '<input type="hidden" id="filtro-sede-venta" value="">'}
                <div class="col-md-2">
                  <label class="form-label">Desde</label>
                  <input type="date" id="filtro-desde-venta" class="form-control">
                </div>
                <div class="col-md-2">
                  <label class="form-label">Hasta</label>
                  <input type="date" id="filtro-hasta-venta" class="form-control">
                </div>
                <div class="col-md-1 d-flex align-items-end">
                  <button type="submit" class="btn btn-primary w-100"><i class="ti ti-filter"></i></button>
                </div>
              </form>

              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover table-striped">
                  <thead>
                    <tr>
                      <th>No. Venta</th>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Vendedor</th>
                      <th>Sede</th>
                      <th>Ítems</th>
                      <th>Método Pago</th>
                      <th class="text-end">Total</th>
                    </tr>
                  </thead>
                  <tbody id="ventas-table-body">
                    <!-- Dinámico -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 2: COMISIONES -->
            <div class="tab-pane" id="tab-comisiones" role="tabpanel">
              <form id="form-filtros-comisiones" class="row g-3 mb-4">
                <div class="col-md-3">
                  <label class="form-label">Vendedor / Cajero</label>
                  <select id="filtro-vendedor-comision" class="form-select">
                    <option value="">-- Todos --</option>
                    ${vendedores.map(v => `<option value="${v.id}">${v.nombre}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Desde</label>
                  <input type="date" id="filtro-desde-comision" class="form-control">
                </div>
                <div class="col-md-3">
                  <label class="form-label">Hasta</label>
                  <input type="date" id="filtro-hasta-comision" class="form-control">
                </div>
                <div class="col-md-3 d-flex align-items-end">
                  <button type="submit" class="btn btn-primary w-100"><i class="ti ti-calculator me-1"></i> Calcular Comisiones</button>
                </div>
              </form>

              <div class="row row-cards mb-4" id="kpi-comisiones-wrapper">
                <!-- KPI Card -->
              </div>

              <div class="table-responsive">
                <table class="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th>No. Venta</th>
                      <th>Fecha</th>
                      <th class="text-end">Total Venta</th>
                      <th class="text-end">Comisión (2%)</th>
                    </tr>
                  </thead>
                  <tbody id="comisiones-table-body">
                    <tr><td colspan="5" class="text-center py-4 text-secondary">Haga clic en Calcular para liquidar las comisiones del período.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 3: REPORTE DE DESCUENTOS (PRICE OVERRIDE) -->
            <div class="tab-pane" id="tab-descuentos" role="tabpanel">
              <div class="row mb-3 align-items-center">
                <div class="col">
                  <h3 class="card-title">Auditoría de Modificaciones de Precios</h3>
                  <div class="text-secondary">Registro de artículos vendidos con descuento o por debajo del costo real</div>
                </div>
              </div>
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover table-striped">
                  <thead>
                    <tr>
                      <th>No. Venta</th>
                      <th>Fecha</th>
                      <th>Producto</th>
                      <th>Vendedor</th>
                      <th class="text-end">Precio Base</th>
                      <th class="text-end">Precio Vendido</th>
                      <th class="text-center">Descuento (%)</th>
                      <th class="text-end">Ahorro</th>
                    </tr>
                  </thead>
                  <tbody id="descuentos-table-body">
                    <!-- Dinámico -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const tbodyVentas = document.getElementById('ventas-table-body');
  const tbodyComisiones = document.getElementById('comisiones-table-body');
  const tbodyDescuentos = document.getElementById('descuentos-table-body');
  const kpisComisiones = document.getElementById('kpi-comisiones-wrapper');

  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  function renderVentasTable(data) {
    if (data.length === 0) {
      tbodyVentas.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-secondary">No se encontraron ventas.</td></tr>`;
      return;
    }

    tbodyVentas.innerHTML = data.map(v => {
      const itemsStr = v.items ? v.items.map(i => `${i.producto ? i.producto.nombre : 'Producto'} (x${i.cantidad})`).join(', ') : 'N/A';
      const pagosStr = v.pagos ? v.pagos.map(p => p.metodo.toUpperCase()).join('/') : 'Efectivo';
      return `
        <tr>
          <td><strong class="text-blue">${v.numeroVenta}</strong></td>
          <td>${new Date(v.createdAt).toLocaleDateString()}</td>
          <td>${v.cliente ? v.cliente.nombre : 'Cliente General'}</td>
          <td>${v.usuario ? v.usuario.nombre : 'Desconocido'}</td>
          <td>${v.sede ? v.sede.nombre : 'N/A'}</td>
          <td class="small text-secondary" style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsStr}">${itemsStr}</td>
          <td>${pagosStr}</td>
          <td class="text-end fw-bold text-primary">${formatter.format(v.total)}</td>
        </tr>
      `;
    }).join('');
  }

  // Render initial ventas
  renderVentasTable(ventas);

  // Filters Ventas History
  document.getElementById('form-filtros-ventas').addEventListener('submit', async (e) => {
    e.preventDefault();
    tbodyVentas.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    try {
      const buscar = document.getElementById('filtro-buscar-venta').value;
      const usuario = document.getElementById('filtro-vendedor-venta').value;
      const sede = document.getElementById('filtro-sede-venta').value;
      const desde = document.getElementById('filtro-desde-venta').value;
      const hasta = document.getElementById('filtro-hasta-venta').value;

      const params = [];
      if (buscar) params.push(`buscar=${buscar}`);
      if (usuario) params.push(`usuario=${usuario}`);
      if (sede) params.push(`sede=${sede}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);

      const query = params.length > 0 ? '?' + params.join('&') : '';
      const filtradas = await apiFetch(`/ventas${query}`);
      renderVentasTable(filtradas);
    } catch (err) {
      tbodyVentas.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  });

  // Calculate & Render Comisiones
  document.getElementById('form-filtros-comisiones').addEventListener('submit', async (e) => {
    e.preventDefault();
    tbodyComisiones.innerHTML = `<tr><td colspan="5" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    kpisComisiones.innerHTML = '';

    try {
      const usuario = document.getElementById('filtro-vendedor-comision').value;
      const desde = document.getElementById('filtro-desde-comision').value;
      const hasta = document.getElementById('filtro-hasta-comision').value;

      const params = [];
      if (usuario) params.push(`usuario=${usuario}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);

      const query = params.length > 0 ? '?' + params.join('&') : '';
      const data = await apiFetch(`/ventas/comisiones${query}`);

      if (!data.comisiones || data.comisiones.length === 0) {
        tbodyComisiones.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-secondary">No hay comisiones para el rango y vendedor seleccionado.</td></tr>`;
        return;
      }

      kpisComisiones.innerHTML = `
        <div class="col-md-4">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto"><span class="bg-blue text-white avatar"><i class="ti ti-cash fs-1"></i></span></div>
                <div class="col">
                  <div class="font-weight-medium">Total Ventas Liquidables</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(data.comisiones.reduce((acc, curr) => acc + curr.totalVenta, 0))}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto"><span class="bg-green text-white avatar"><i class="ti ti-percentage fs-1"></i></span></div>
                <div class="col">
                  <div class="font-weight-medium">Total Comisiones (2%)</div>
                  <div class="text-secondary h3 mb-0 text-success fw-bold">${formatter.format(data.totalComisiones)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      tbodyComisiones.innerHTML = data.comisiones.map(c => `
        <tr>
          <td><strong>${c.vendedor}</strong></td>
          <td><span class="badge bg-blue text-white">${c.numeroVenta}</span></td>
          <td>${new Date(c.fecha).toLocaleDateString()}</td>
          <td class="text-end">${formatter.format(c.totalVenta)}</td>
          <td class="text-end fw-bold text-success">${formatter.format(c.comision)}</td>
        </tr>
      `).join('');

    } catch (err) {
      tbodyComisiones.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  });

  // Render Descuentos Tab (Price Override)
  async function loadDescuentos() {
    tbodyDescuentos.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    try {
      const data = await apiFetch('/ventas/descuentos');
      if (data.length === 0) {
        tbodyDescuentos.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-secondary">No se registran transacciones con Price Override (descuentos).</td></tr>`;
        return;
      }

      tbodyDescuentos.innerHTML = data.map(item => {
        const venta = item.venta || {};
        const base = parseFloat(item.precioBase);
        const modificado = parseFloat(item.precioModificado);
        const ahorro = (base - modificado) * item.cantidad;

        return `
          <tr>
            <td><strong class="text-blue">${venta.numeroVenta || 'N/A'}</strong></td>
            <td>${venta.createdAt ? new Date(venta.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td>${item.producto ? item.producto.nombre : 'Producto'}</td>
            <td>${venta.usuario ? venta.usuario.nombre : 'N/A'}</td>
            <td class="text-end">${formatter.format(base)}</td>
            <td class="text-end fw-bold text-primary">${formatter.format(modificado)}</td>
            <td class="text-center"><span class="badge bg-red-lt px-2 py-1">${item.descuentoPct}%</span></td>
            <td class="text-end text-danger">${formatter.format(ahorro)}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbodyDescuentos.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  }

  // Load descuentos upon tab activation
  const tabEl = document.querySelector('a[href="#tab-descuentos"]');
  if (tabEl) {
    tabEl.addEventListener('shown.bs.tab', () => {
      loadDescuentos();
    });
  }
}

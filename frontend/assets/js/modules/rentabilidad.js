import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

export async function initRentabilidad(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  const isContador = usuario.rol === 'contador';

  if (!isAdminOrGerente && !isContador) {
    container.innerHTML = `
      <div class="container-xl py-5">
        <div class="alert alert-danger">
          <h4 class="alert-title">Acceso Denegado</h4>
          <div class="text-secondary">Usted no tiene permisos para ver el análisis de rentabilidad.</div>
        </div>
      </div>
    `;
    return;
  }

  let tecnicos = [];
  let sedes = [];
  let vendedores = [];
  try {
    const allUsers = await apiFetch('/config/usuarios').catch(() => []);
    tecnicos = allUsers.filter(u => u.rol === 'tecnico');
    vendedores = allUsers;
    sedes = await apiFetch('/config/sedes').catch(() => []);
  } catch (e) {
    console.error('Error al precargar filtros:', e);
  }

  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-3">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title" id="rentabilidad-title">Análisis de Rentabilidad de Reparaciones</h2>
            <div class="text-secondary mt-1" id="rentabilidad-subtitle">Comparativa de ingresos de mano de obra y costos de repuestos por técnico y equipo</div>
          </div>
        </div>
      </div>

      <!-- Navegación por pestañas (Tabs) -->
      <div class="mb-3 d-print-none">
        <ul class="nav nav-pills">
          <li class="nav-item">
            <button class="nav-link active" id="btn-tab-reparaciones"><i class="ti ti-tool me-1"></i>Reparaciones</button>
          </li>
          <li class="nav-item">
            <button class="nav-link" id="btn-tab-ventas"><i class="ti ti-shopping-cart me-1"></i>Ventas de POS / Inventario</button>
          </li>
          <li class="nav-item">
            <button class="nav-link" id="btn-tab-caja"><i class="ti ti-wallet me-1"></i>Rentabilidad de la Caja</button>
          </li>
        </ul>
      </div>

      <!-- SECCIÓN: REPARACIONES -->
      <div id="sec-reparaciones">
        <!-- Filtros Reparaciones -->
        <div class="card mb-4 d-print-none">
          <div class="card-body">
            <form id="form-filtros-reparaciones" class="row g-3">
              <div class="col-md-3">
                <label class="form-label">Técnico</label>
                <select id="filtro-tecnico" class="form-select">
                  <option value="">-- Todos los Técnicos --</option>
                  ${tecnicos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">Desde</label>
                <input type="date" id="filtro-desde-rep" class="form-control">
              </div>
              <div class="col-md-3">
                <label class="form-label">Hasta</label>
                <input type="date" id="filtro-hasta-rep" class="form-control">
              </div>
              <div class="col-md-3 d-flex align-items-end">
                <button type="submit" class="btn btn-primary w-100"><i class="ti ti-filter me-1"></i> Filtrar</button>
              </div>
            </form>
          </div>
        </div>

        <!-- KPIs Reparaciones -->
        <div class="row row-cards mb-4" id="kpis-reparaciones">
          <!-- Dinámico -->
        </div>

        <!-- Tabla Reparaciones -->
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h3 class="card-title">Desglose de Márgenes en Soporte Técnico</h3>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
              <i class="ti ti-printer me-1"></i> Imprimir Reporte
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter card-table table-hover table-striped">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Fecha</th>
                  <th>Equipo</th>
                  <th>Técnico</th>
                  <th class="text-end">Mano de Obra</th>
                  <th class="text-end">Costo Repuestos</th>
                  <th class="text-end">Total Cobrado</th>
                  <th class="text-end">Margen (COP)</th>
                  <th class="text-center">Margen (%)</th>
                </tr>
              </thead>
              <tbody id="reparaciones-table-body">
                <!-- Dinámico -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SECCIÓN: VENTAS -->
      <div id="sec-ventas" class="d-none">
        <!-- Filtros Ventas -->
        <div class="card mb-4 d-print-none">
          <div class="card-body">
            <form id="form-filtros-ventas" class="row g-3">
              <div class="col-md-3">
                <label class="form-label">Sede</label>
                <select id="filtro-sede" class="form-select">
                  <option value="">-- Todas las Sedes --</option>
                  ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">Vendedor</label>
                <select id="filtro-vendedor" class="form-select">
                  <option value="">-- Todos los Vendedores --</option>
                  ${vendedores.map(v => `<option value="${v.id}">${v.nombre} (${v.rol})</option>`).join('')}
                </select>
              </div>
              <div class="col-md-2">
                <label class="form-label">Desde</label>
                <input type="date" id="filtro-desde-vta" class="form-control">
              </div>
              <div class="col-md-2">
                <label class="form-label">Hasta</label>
                <input type="date" id="filtro-hasta-vta" class="form-control">
              </div>
              <div class="col-md-2 d-flex align-items-end">
                <button type="submit" class="btn btn-primary w-100"><i class="ti ti-filter me-1"></i> Filtrar</button>
              </div>
            </form>
          </div>
        </div>

        <!-- KPIs Ventas -->
        <div class="row row-cards mb-4" id="kpis-ventas">
          <!-- Dinámico -->
        </div>

        <!-- Tabla Ventas -->
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h3 class="card-title">Desglose de Márgenes en Ventas Directas</h3>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
              <i class="ti ti-printer me-1"></i> Imprimir Reporte
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter card-table table-hover table-striped">
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Fecha</th>
                  <th>Sede</th>
                  <th>Cliente</th>
                  <th>Artículos Vendidos</th>
                  <th>Vendedor</th>
                  <th class="text-end">Costo Total</th>
                  <th class="text-end">Total Venta</th>
                  <th class="text-end">Margen (COP)</th>
                  <th class="text-center">Margen (%)</th>
                </tr>
              </thead>
              <tbody id="ventas-table-body">
                <!-- Dinámico -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SECCIÓN: CAJA -->
      <div id="sec-caja" class="d-none">
        <!-- Filtros Caja -->
        <div class="card mb-4 d-print-none">
          <div class="card-body">
            <form id="form-filtros-caja" class="row g-3">
              <div class="col-md-4">
                <label class="form-label">Sede</label>
                <select id="filtro-sede-caja" class="form-select">
                  <option value="">-- Todas las Sedes --</option>
                  ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">Desde</label>
                <input type="date" id="filtro-desde-caja" class="form-control">
              </div>
              <div class="col-md-3">
                <label class="form-label">Hasta</label>
                <input type="date" id="filtro-hasta-caja" class="form-control">
              </div>
              <div class="col-md-2 d-flex align-items-end">
                <button type="submit" class="btn btn-primary w-100"><i class="ti ti-filter me-1"></i> Filtrar</button>
              </div>
            </form>
          </div>
        </div>

        <!-- KPIs Caja -->
        <div class="row row-cards mb-4" id="kpis-caja">
          <!-- Dinámico -->
        </div>

        <!-- Tabla Caja -->
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h3 class="card-title">Desglose Consolidado de Márgenes en Caja (Ventas y Reparaciones)</h3>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
              <i class="ti ti-printer me-1"></i> Imprimir Reporte
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter card-table table-hover table-striped">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Referencia</th>
                  <th>Fecha</th>
                  <th>Sede</th>
                  <th>Cliente</th>
                  <th class="text-end">Costo de Operación</th>
                  <th class="text-end">Total Recaudado</th>
                  <th class="text-end">Margen (COP)</th>
                  <th class="text-center">Margen (%)</th>
                </tr>
              </thead>
              <tbody id="caja-table-body">
                <!-- Dinámico -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  // Referencias DOM
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

  // LÓGICA DE PESTAÑAS
  btnReparaciones.addEventListener('click', () => {
    btnReparaciones.classList.add('active');
    btnVentas.classList.remove('active');
    btnCaja.classList.remove('active');
    secReparaciones.classList.remove('d-none');
    secVentas.classList.add('d-none');
    secCaja.classList.add('d-none');
    titleEl.textContent = 'Análisis de Rentabilidad de Reparaciones';
    subtitleEl.textContent = 'Comparativa de ingresos de mano de obra y costos de repuestos por técnico y equipo';
    loadReparacionesReport();
  });

  btnVentas.addEventListener('click', () => {
    btnVentas.classList.add('active');
    btnReparaciones.classList.remove('active');
    btnCaja.classList.remove('active');
    secVentas.classList.remove('d-none');
    secReparaciones.classList.add('d-none');
    secCaja.classList.add('d-none');
    titleEl.textContent = 'Análisis de Rentabilidad de Ventas';
    subtitleEl.textContent = 'Comparativa de precios de venta y costos de adquisición de productos del inventario';
    loadVentasReport();
  });

  btnCaja.addEventListener('click', () => {
    btnCaja.classList.add('active');
    btnReparaciones.classList.remove('active');
    btnVentas.classList.remove('active');
    secCaja.classList.remove('d-none');
    secReparaciones.classList.add('d-none');
    secVentas.classList.add('d-none');
    titleEl.textContent = 'Análisis de Rentabilidad de la Caja';
    subtitleEl.textContent = 'Margen neto consolidado de todas las ventas y servicios técnicos cobrados';
    loadCajaReport();
  });

  // LÓGICA DE PESTAÑAS
  btnReparaciones.addEventListener('click', () => {
    btnReparaciones.classList.add('active');
    btnVentas.classList.remove('active');
    secReparaciones.classList.remove('d-none');
    secVentas.classList.add('d-none');
    titleEl.textContent = 'Análisis de Rentabilidad de Reparaciones';
    subtitleEl.textContent = 'Comparativa de ingresos de mano de obra y costos de repuestos por técnico y equipo';
    loadReparacionesReport();
  });

  btnVentas.addEventListener('click', () => {
    btnVentas.classList.add('active');
    btnReparaciones.classList.remove('active');
    secVentas.classList.remove('d-none');
    secReparaciones.classList.add('d-none');
    titleEl.textContent = 'Análisis de Rentabilidad de Ventas';
    subtitleEl.textContent = 'Comparativa de precios de venta y costos de adquisición de productos del inventario';
    loadVentasReport();
  });

  // CARGAR REPORTE DE REPARACIONES
  async function loadReparacionesReport() {
    tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const tecnico = document.getElementById('filtro-tecnico').value;
      const desde = document.getElementById('filtro-desde-rep').value;
      const hasta = document.getElementById('filtro-hasta-rep').value;

      let query = '';
      const params = [];
      if (tecnico) params.push(`tecnico=${tecnico}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      if (params.length > 0) {
        query = '?' + params.join('&');
      }

      const data = await apiFetch(`/reparaciones/rentabilidad/reporte${query}`);

      if (data.length === 0) {
        tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">No se encontraron registros de rentabilidad de reparaciones.</td></tr>`;
        kpisReparaciones.innerHTML = '';
        return;
      }

      let totalCobradoAcum = 0;
      let totalCostoAcum = 0;
      let totalMargenAcum = 0;

      tbodyReparaciones.innerHTML = data.map(r => {
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

        let badgeClass = 'bg-green-lt';
        if (pctMargen < 20) badgeClass = 'bg-danger-lt';
        else if (pctMargen < 45) badgeClass = 'bg-warning-lt';

        return `
          <tr>
            <td><strong class="text-blue">${orden.numeroOrden || 'N/A'}</strong></td>
            <td>${orden.createdAt ? new Date(orden.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td>${orden.tipoEquipo || ''} ${orden.marca || ''} ${orden.modelo || ''}</td>
            <td>${orden.tecnico ? orden.tecnico.nombre : 'N/A'}</td>
            <td class="text-end">${formatter.format(manoObra)}</td>
            <td class="text-end text-danger">${formatter.format(costoRepuestos)}</td>
            <td class="text-end fw-bold text-primary">${formatter.format(cobrado)}</td>
            <td class="text-end fw-bold ${margen >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(margen)}</td>
            <td class="text-center">
              <span class="badge ${badgeClass} px-2 py-1">${pctMargen.toFixed(1)}%</span>
            </td>
          </tr>
        `;
      }).join('');

      const pctMargenPromedio = totalCobradoAcum > 0 ? (totalMargenAcum / totalCobradoAcum) * 100 : 0;

      kpisReparaciones.innerHTML = `
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-blue text-white avatar"><i class="ti ti-cash fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Ingresos Totales</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalCobradoAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-red text-white avatar"><i class="ti ti-calculator fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Costos Operativos</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalCostoAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-green text-white avatar"><i class="ti ti-trending-up fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Margen Neto</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalMargenAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-purple text-white avatar"><i class="ti ti-chart-pie fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Margen Promedio</div>
                  <div class="text-secondary h3 mb-0">${pctMargenPromedio.toFixed(2)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error al cargar rentabilidad de reparaciones: ${err.message}</td></tr>`;
      kpisReparaciones.innerHTML = '';
    }
  }

  // CARGAR REPORTE DE VENTAS
  async function loadVentasReport() {
    tbodyVentas.innerHTML = `<tr><td colspan="10" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const SedeId = document.getElementById('filtro-sede').value;
      const vendedor = document.getElementById('filtro-vendedor').value;
      const desde = document.getElementById('filtro-desde-vta').value;
      const hasta = document.getElementById('filtro-hasta-vta').value;

      let query = '';
      const params = [];
      if (SedeId) params.push(`sede=${SedeId}`);
      if (vendedor) params.push(`usuario=${vendedor}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      if (params.length > 0) {
        query = '?' + params.join('&');
      }

      // Reutiliza el endpoint general de ventas que ya cuenta con los filtros y la carga de precioCosto
      const ventas = await apiFetch(`/ventas${query}`);
      const ventasValidas = ventas.filter(v => v.estado !== 'anulada');

      if (ventasValidas.length === 0) {
        tbodyVentas.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-secondary">No se encontraron registros de ventas concretadas.</td></tr>`;
        kpisVentas.innerHTML = '';
        return;
      }

      let totalVentasAcum = 0;
      let totalCostoAcum = 0;
      let totalMargenAcum = 0;

      tbodyVentas.innerHTML = ventasValidas.map(v => {
        const totalVenta = parseFloat(v.total || 0);
        
        // Calcular costo del inventario vendido en esta venta
        let costoVenta = 0;
        const itemsInfo = (v.items || []).map(item => {
          const costoUnit = parseFloat(item.producto ? item.producto.precioCosto : 0);
          costoVenta += (costoUnit * parseInt(item.cantidad || 0));
          return `${item.cantidad}x ${item.producto ? item.producto.nombre : 'N/A'}`;
        }).join(', ');

        const margen = totalVenta - costoVenta;
        const pctMargen = totalVenta > 0 ? (margen / totalVenta) * 100 : 0;

        totalVentasAcum += totalVenta;
        totalCostoAcum += costoVenta;
        totalMargenAcum += margen;

        let badgeClass = 'bg-green-lt';
        if (pctMargen < 15) badgeClass = 'bg-danger-lt';
        else if (pctMargen < 35) badgeClass = 'bg-warning-lt';

        return `
          <tr>
            <td><strong class="text-blue">${v.numeroVenta || 'N/A'}</strong></td>
            <td>${v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td>${v.sede ? v.sede.nombre : 'N/A'}</td>
            <td>${v.cliente ? v.cliente.nombre : 'Cliente General'}</td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsInfo}">
              ${itemsInfo || 'N/A'}
            </td>
            <td>${v.usuario ? v.usuario.nombre : 'N/A'}</td>
            <td class="text-end text-secondary">${formatter.format(costoVenta)}</td>
            <td class="text-end fw-bold text-primary">${formatter.format(totalVenta)}</td>
            <td class="text-end fw-bold ${margen >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(margen)}</td>
            <td class="text-center">
              <span class="badge ${badgeClass} px-2 py-1">${pctMargen.toFixed(1)}%</span>
            </td>
          </tr>
        `;
      }).join('');

      const pctMargenPromedio = totalVentasAcum > 0 ? (totalMargenAcum / totalVentasAcum) * 100 : 0;

      kpisVentas.innerHTML = `
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-blue text-white avatar"><i class="ti ti-cash fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Ingresos Totales</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalVentasAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-red text-white avatar"><i class="ti ti-calculator fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Costos Operativos</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalCostoAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-green text-white avatar"><i class="ti ti-trending-up fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Margen Neto</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalMargenAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-purple text-white avatar"><i class="ti ti-chart-pie fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Margen Promedio</div>
                  <div class="text-secondary h3 mb-0">${pctMargenPromedio.toFixed(2)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      tbodyVentas.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-danger">Error al cargar rentabilidad de ventas: ${err.message}</td></tr>`;
      kpisVentas.innerHTML = '';
    }
  }

  // EVENT LISTENERS DE FORMULARIOS
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

  // CARGAR REPORTE CONSOLIDADO DE CAJA (VENTAS + REPARACIONES)
  async function loadCajaReport() {
    tbodyCaja.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    kpisCaja.innerHTML = '';

    try {
      const SedeId = document.getElementById('filtro-sede-caja').value;
      const desde = document.getElementById('filtro-desde-caja').value;
      const hasta = document.getElementById('filtro-hasta-caja').value;

      const params = [];
      if (SedeId) params.push(`sede=${SedeId}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      const query = params.length > 0 ? '?' + params.join('&') : '';

      // Consolidar llamadas a los dos endpoints
      const [ventas, reparaciones] = await Promise.all([
        apiFetch(`/ventas${query}`).catch(() => []),
        apiFetch(`/reparaciones${query}`).catch(() => [])
      ]);

      const ventasValidas = ventas.filter(v => v.estado !== 'anulada');
      const reparacionesEntregadas = reparaciones.filter(o => o.estado === 'entregado');

      if (ventasValidas.length === 0 && reparacionesEntregadas.length === 0) {
        tbodyCaja.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">No se encontraron registros de caja en este período.</td></tr>`;
        return;
      }

      // Combinar los datos en una sola lista para el historial
      const itemsCaja = [];

      let totalIngresos = 0;
      let totalCostos = 0;
      let totalMargen = 0;

      // 1. Agregar Ventas
      ventasValidas.forEach(v => {
        const totalVenta = parseFloat(v.total || 0);
        let costoVenta = 0;
        (v.items || []).forEach(item => {
          const costoUnit = parseFloat(item.producto ? item.producto.precioCosto : 0);
          costoVenta += (costoUnit * parseInt(item.cantidad || 0));
        });

        const margen = totalVenta - costoVenta;
        totalIngresos += totalVenta;
        totalCostos += costoVenta;
        totalMargen += margen;

        itemsCaja.push({
          tipo: 'VENTA',
          referencia: v.numeroVenta || 'N/A',
          fecha: new Date(v.createdAt),
          sede: v.sede ? v.sede.nombre : 'N/A',
          cliente: v.cliente ? v.cliente.nombre : 'Cliente General',
          costo: costoVenta,
          total: totalVenta,
          margen: margen
        });
      });

      // 2. Agregar Reparaciones Entregadas
      reparacionesEntregadas.forEach(o => {
        const cobrado = parseFloat(o.totalCobrado || 0);
        const costoRepuestos = parseFloat(o.costoRepuestos || 0); // costo real de repuestos
        const margen = cobrado - costoRepuestos;

        totalIngresos += cobrado;
        totalCostos += costoRepuestos;
        totalMargen += margen;

        itemsCaja.push({
          tipo: 'REPARACIÓN',
          referencia: o.numeroOrden || 'N/A',
          fecha: new Date(o.createdAt),
          sede: o.sede ? o.sede.nombre : 'N/A',
          cliente: o.cliente ? o.cliente.nombre : 'Cliente General',
          costo: costoRepuestos,
          total: cobrado,
          margen: margen
        });
      });

      // Ordenar por fecha descendente
      itemsCaja.sort((a, b) => b.fecha - a.fecha);

      // Renderizar tabla
      tbodyCaja.innerHTML = itemsCaja.map(item => {
        const pctMargen = item.total > 0 ? (item.margen / item.total) * 100 : 0;
        let badgeClass = 'bg-green-lt';
        if (pctMargen < 20) badgeClass = 'bg-danger-lt';
        else if (pctMargen < 45) badgeClass = 'bg-warning-lt';

        return `
          <tr>
            <td><span class="badge ${item.tipo === 'VENTA' ? 'bg-blue-lt' : 'bg-purple-lt'} px-2 py-1">${item.tipo}</span></td>
            <td><strong class="text-blue">${item.referencia}</strong></td>
            <td>${item.fecha.toLocaleDateString()}</td>
            <td>${item.sede}</td>
            <td>${item.cliente}</td>
            <td class="text-end text-secondary">${formatter.format(item.costo)}</td>
            <td class="text-end fw-bold text-primary">${formatter.format(item.total)}</td>
            <td class="text-end fw-bold ${item.margen >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(item.margen)}</td>
            <td class="text-center">
              <span class="badge ${badgeClass} px-2 py-1">${pctMargen.toFixed(1)}%</span>
            </td>
          </tr>
        `;
      }).join('');

      const pctMargenPromedio = totalIngresos > 0 ? (totalMargen / totalIngresos) * 100 : 0;

      // Renderizar KPIs
      kpisCaja.innerHTML = `
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto"><span class="bg-blue text-white avatar"><i class="ti ti-cash fs-1"></i></span></div>
                <div class="col">
                  <div class="font-weight-medium">Ingresos Totales (Caja)</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalIngresos)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto"><span class="bg-red text-white avatar"><i class="ti ti-calculator fs-1"></i></span></div>
                <div class="col">
                  <div class="font-weight-medium">Costos Totales</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalCostos)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto"><span class="bg-green text-white avatar"><i class="ti ti-trending-up fs-1"></i></span></div>
                <div class="col">
                  <div class="font-weight-medium">Rentabilidad Neta (Margen)</div>
                  <div class="text-secondary h3 mb-0 text-success fw-bold">${formatter.format(totalMargen)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto"><span class="bg-purple text-white avatar"><i class="ti ti-chart-pie fs-1"></i></span></div>
                <div class="col">
                  <div class="font-weight-medium">Margen Promedio</div>
                  <div class="text-secondary h3 mb-0">${pctMargenPromedio.toFixed(2)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      tbodyCaja.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error al cargar rentabilidad de caja: ${err.message}</td></tr>`;
      kpisCaja.innerHTML = '';
    }
  }

  // Carga inicial
  loadReparacionesReport();
}

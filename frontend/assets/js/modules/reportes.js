import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';

function defaultDateRange(days = 30) {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - days);
  return {
    desde: desde.toISOString().split('T')[0],
    hasta: hasta.toISOString().split('T')[0]
  };
}

function buildQuery(params) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v != null) q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

function downloadCsv(filename, rows, columns) {
  const escape = (val) => {
    const str = val == null ? '' : String(val);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map(c => escape(c.label)).join(',');
  const lines = rows.map(row =>
    columns.map(c => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(',')
  );
  const blob = new Blob(['\uFEFF' + [header, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function initReportes(container) {
  const usuario = getUsuario();
  const allowed = ['admin', 'superadmin', 'gerente_sede', 'contador'].includes(usuario.rol);
  if (!allowed) {
    container.innerHTML = `<div class="container-xl erp-module py-5"><div class="alert alert-danger">No tiene permisos para ver reportes.</div></div>`;
    return;
  }

  const needsSede = !usuario.sedeId || ['admin', 'superadmin'].includes(usuario.rol);
  let sedes = [];
  if (needsSede) {
    sedes = await apiFetch('/config/sedes').catch(() => []);
  }

  const { desde, hasta } = defaultDateRange();
  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Reportes',
        title: 'Finanzas y operación',
        subtitle: 'Cartera, flujo de caja, ventas e inventario valorizado'
      })}

      <div class="card mb-2 erp-filter-card">
        <div class="card-body">
          <div class="row g-2 align-items-end">
            ${needsSede ? `
            <div class="col-md-3">
              <label class="form-label">Sede</label>
              <select id="rep-sede" class="form-select">
                <option value="">Todas</option>
                ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
              </select>
            </div>` : ''}
            <div class="col-md-2">
              <label class="form-label">Desde</label>
              <input type="date" id="rep-desde" class="form-control" value="${desde}">
            </div>
            <div class="col-md-2">
              <label class="form-label">Hasta</label>
              <input type="date" id="rep-hasta" class="form-control" value="${hasta}">
            </div>
            <div class="col-md-2">
              <button type="button" class="btn btn-primary w-100" id="btn-rep-refresh"><i class="ti ti-refresh me-1"></i>Actualizar</button>
            </div>
            <div class="col-md-2">
              <button type="button" class="btn btn-outline-secondary w-100" id="btn-rep-export"><i class="ti ti-download me-1"></i>Exportar CSV</button>
            </div>
          </div>
        </div>
      </div>

      <ul class="nav nav-tabs mb-2" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#rep-tab-cartera" type="button">Cartera</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rep-tab-cpp" type="button">Cuentas por pagar</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rep-tab-flujo" type="button">Flujo de caja</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rep-tab-ventas" type="button">Ventas</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rep-tab-inventario" type="button">Inventario</button></li>
      </ul>

      <div class="tab-content">
        <div class="tab-pane fade show active" id="rep-tab-cartera">
          <div class="row g-3 mb-3" id="rep-cartera-kpis"></div>
          <div class="card erp-table-panel"><div class="table-responsive"><table class="table table-vcenter card-table"><thead><tr>
            <th>Cliente</th><th>Factura</th><th>Vencimiento</th><th class="text-end">Saldo</th><th>Estado</th><th class="text-center">Mora</th>
          </tr></thead><tbody id="rep-cartera-body"><tr><td colspan="6" class="text-center py-4 text-secondary">Cargando…</td></tr></tbody></table></div></div>
        </div>
        <div class="tab-pane fade" id="rep-tab-cpp">
          <div class="card erp-table-panel"><div class="table-responsive"><table class="table table-vcenter card-table"><thead><tr>
            <th>OC</th><th>Proveedor</th><th>Vencimiento</th><th class="text-end">Saldo</th><th class="text-center">Mora</th>
          </tr></thead><tbody id="rep-cpp-body"><tr><td colspan="5" class="text-center py-4 text-secondary">Cargando…</td></tr></tbody></table></div></div>
        </div>
        <div class="tab-pane fade" id="rep-tab-flujo">
          <div class="row g-3 mb-3" id="rep-flujo-kpis"></div>
          <div class="card card-body"><canvas id="chart-rep-flujo" height="120"></canvas></div>
        </div>
        <div class="tab-pane fade" id="rep-tab-ventas">
          <div class="row g-3">
            <div class="col-lg-5"><div class="card"><div class="card-header"><h3 class="card-title">Por método de pago</h3></div><div class="card-body p-0"><table class="table table-vcenter mb-0"><thead><tr><th>Método</th><th class="text-end">Total</th></tr></thead><tbody id="rep-metodos-body"></tbody></table></div></div></div>
            <div class="col-lg-7"><div class="card"><div class="card-header"><h3 class="card-title">Top productos</h3></div><div class="card-body p-0"><table class="table table-vcenter mb-0"><thead><tr><th>Producto</th><th class="text-end">Unidades</th><th class="text-end">Ingresos</th></tr></thead><tbody id="rep-top-body"></tbody></table></div></div></div>
          </div>
        </div>
        <div class="tab-pane fade" id="rep-tab-inventario">
          <div class="row g-3 mb-3" id="rep-inv-kpis"></div>
          <div class="card erp-table-panel"><div class="table-responsive"><table class="table table-vcenter card-table table-sm"><thead><tr>
            <th>Producto</th><th>Sede</th><th class="text-end">Cant.</th><th class="text-end">Valor costo</th><th class="text-end">Valor venta</th>
          </tr></thead><tbody id="rep-inv-body"></tbody></table></div></div>
        </div>
      </div>
    </div>
  `;

  let chartFlujo = null;
  let lastCartera = [];
  let lastCpp = [];
  let activeTab = 'cartera';

  const filters = () => ({
    sede: document.getElementById('rep-sede')?.value || usuario.sedeId || '',
    desde: document.getElementById('rep-desde').value,
    hasta: document.getElementById('rep-hasta').value
  });

  document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
    tab.addEventListener('shown.bs.tab', (e) => {
      const id = e.target.getAttribute('data-bs-target') || '';
      if (id.includes('cartera')) activeTab = 'cartera';
      else if (id.includes('cpp')) activeTab = 'cpp';
      else if (id.includes('flujo')) activeTab = 'flujo';
      else if (id.includes('ventas')) activeTab = 'ventas';
      else if (id.includes('inventario')) activeTab = 'inventario';
    });
  });

  async function loadCartera(q) {
    const data = await apiFetch(`/analytics/finanzas/cartera${buildQuery({ sede: q.sede })}`);
    lastCartera = data.items || [];
    document.getElementById('rep-cartera-kpis').innerHTML = `
      <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Total pendiente</div><div class="h2 mb-0">${formatter.format(data.totalPendiente)}</div></div></div></div>
      <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Vencida</div><div class="h2 mb-0 text-danger">${formatter.format(data.totalVencida)}</div></div></div></div>
      <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Al día</div><div class="h2 mb-0 text-success">${formatter.format(data.totalAlDia)}</div></div></div></div>
    `;
    const tbody = document.getElementById('rep-cartera-body');
    if (!lastCartera.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-secondary">Sin cuentas pendientes.</td></tr>';
      return;
    }
    tbody.innerHTML = lastCartera.map(r => `
      <tr>
        <td>${r.cliente?.nombre || '—'}</td>
        <td>${r.factura?.numeroFactura || '—'}</td>
        <td>${new Date(r.fechaVencimiento).toLocaleDateString()}</td>
        <td class="text-end fw-bold">${formatter.format(r.saldoPendiente)}</td>
        <td><span class="badge ${r.estado === 'vencida' ? 'bg-red-lt' : 'bg-green-lt'}">${r.estado}</span></td>
        <td class="text-center">${r.diasVencido > 0 ? r.diasVencido + ' d' : '—'}</td>
      </tr>
    `).join('');
  }

  async function loadCpp(q) {
    const data = await apiFetch(`/analytics/finanzas/cuentas-por-pagar${buildQuery({ sede: q.sede })}`);
    lastCpp = data.items || [];
    const tbody = document.getElementById('rep-cpp-body');
    if (!lastCpp.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-secondary">Sin cuentas por pagar.</td></tr>';
      return;
    }
    tbody.innerHTML = lastCpp.map(r => `
      <tr>
        <td>${r.numeroOrden || r.id?.slice(0, 8)}</td>
        <td>${r.proveedor?.nombre || '—'}</td>
        <td class="${r.diasVencido > 0 ? 'text-danger fw-bold' : ''}">${r.fechaVencimientoPago ? new Date(r.fechaVencimientoPago).toLocaleDateString() : '—'}</td>
        <td class="text-end fw-bold text-danger">${formatter.format(r.saldoPendiente)}</td>
        <td class="text-center">${r.diasVencido > 0 ? r.diasVencido + ' d' : 'Al día'}</td>
      </tr>
    `).join('');
  }

  async function loadFlujo(q) {
    const data = await apiFetch(`/analytics/finanzas/flujo-caja${buildQuery(q)}`);
    document.getElementById('rep-flujo-kpis').innerHTML = `
      <div class="col-md-3"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Ingresos</div><div class="h3 text-success mb-0">${formatter.format(data.ingresos)}</div></div></div></div>
      <div class="col-md-3"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Egresos</div><div class="h3 text-danger mb-0">${formatter.format(data.egresosTotal)}</div></div></div></div>
      <div class="col-md-3"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Neto</div><div class="h3 mb-0 ${data.neto >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(data.neto)}</div></div></div></div>
    `;
    const canvas = document.getElementById('chart-rep-flujo');
    if (!canvas || typeof Chart === 'undefined') return;
    if (chartFlujo) chartFlujo.destroy();
    chartFlujo = new Chart(canvas, {
      type: 'line',
      data: {
        labels: (data.serie || []).map(s => s.fecha),
        datasets: [{
          label: 'Ingresos',
          data: (data.serie || []).map(s => s.ingresos),
          borderColor: '#2fb344',
          tension: 0.3,
          fill: false
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  async function loadVentas(q) {
    const [metodos, top] = await Promise.all([
      apiFetch(`/analytics/ventas/por-metodo-pago${buildQuery(q)}`),
      apiFetch(`/analytics/ventas/top-productos${buildQuery(q)}`)
    ]);
    document.getElementById('rep-metodos-body').innerHTML = (metodos.length ? metodos : []).map(m => `
      <tr><td>${m.metodo}</td><td class="text-end fw-bold">${formatter.format(m.total)}</td></tr>
    `).join('') || '<tr><td colspan="2" class="text-center py-3 text-secondary">Sin datos</td></tr>';
    document.getElementById('rep-top-body').innerHTML = (top.length ? top : []).map(p => `
      <tr><td>${p.nombre}</td><td class="text-end">${p.unidades}</td><td class="text-end fw-bold">${formatter.format(p.ingresos)}</td></tr>
    `).join('') || '<tr><td colspan="3" class="text-center py-3 text-secondary">Sin datos</td></tr>';
  }

  async function loadInventario(q) {
    const data = await apiFetch(`/analytics/inventario/valorizado${buildQuery({ sede: q.sede })}`);
    document.getElementById('rep-inv-kpis').innerHTML = `
      <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Valor costo</div><div class="h3 mb-0">${formatter.format(data.valorCosto)}</div></div></div></div>
      <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Valor venta</div><div class="h3 mb-0">${formatter.format(data.valorVenta)}</div></div></div></div>
      <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Margen potencial</div><div class="h3 mb-0 text-primary">${formatter.format(data.margenPotencial)}</div></div></div></div>
    `;
    const tbody = document.getElementById('rep-inv-body');
    const items = (data.items || []).filter(i => i.cantidad > 0).slice(0, 100);
    tbody.innerHTML = items.length ? items.map(i => `
      <tr><td>${i.nombre}</td><td>${i.sede}</td><td class="text-end">${i.cantidad}</td><td class="text-end">${formatter.format(i.valorCosto)}</td><td class="text-end">${formatter.format(i.valorVenta)}</td></tr>
    `).join('') : '<tr><td colspan="5" class="text-center py-4 text-secondary">Sin stock.</td></tr>';
  }

  async function refreshAll() {
    const q = filters();
    try {
      await Promise.all([loadCartera(q), loadCpp(q), loadFlujo(q), loadVentas(q), loadInventario(q)]);
    } catch (err) {
      alert(err.message);
    }
  }

  document.getElementById('btn-rep-refresh').addEventListener('click', refreshAll);
  document.getElementById('btn-rep-export').addEventListener('click', () => {
    const fecha = new Date().toISOString().split('T')[0];
    if (activeTab === 'cartera') {
      downloadCsv(`cartera_${fecha}.csv`, lastCartera, [
        { label: 'Cliente', value: r => r.cliente?.nombre },
        { label: 'Factura', value: r => r.factura?.numeroFactura },
        { label: 'Vencimiento', value: r => r.fechaVencimiento },
        { label: 'Saldo', key: 'saldoPendiente' },
        { label: 'Estado', key: 'estado' },
        { label: 'Días mora', key: 'diasVencido' }
      ]);
    } else if (activeTab === 'cpp') {
      downloadCsv(`cpp_${fecha}.csv`, lastCpp, [
        { label: 'OC', key: 'numeroOrden' },
        { label: 'Proveedor', value: r => r.proveedor?.nombre },
        { label: 'Vencimiento', value: r => r.fechaVencimientoPago },
        { label: 'Saldo', key: 'saldoPendiente' },
        { label: 'Días vencido', key: 'diasVencido' }
      ]);
    } else {
      alert('Exporte CSV desde las pestañas Cartera o Cuentas por pagar.');
    }
  });

  await refreshAll();
}

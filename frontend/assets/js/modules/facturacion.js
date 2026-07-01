import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { showConfirm } from '../utils/toast.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';
import { renderFacturaDocumento, printFacturaDocumento } from '../utils/factura-document.js';

export async function initFacturacion(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  let facturas = [];
  let sedes = [];

  async function loadData() {
    try {
      facturas = await apiFetch('/facturas');
      sedes = await apiFetch('/config/sedes').catch(() => []);
    } catch (e) {
      console.error('Error al cargar facturas:', e);
    }
  }

  await loadData();

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Facturación',
        title: 'Facturas de venta y servicio',
        subtitle: 'Consulta, impresión y anulación de comprobantes'
      })}

      <!-- Filtros -->
      <div class="card mb-4 d-print-none erp-filter-card">
        <div class="card-body">
          <form id="form-filtros-facturacion" class="row g-3">
            <div class="col-md-3">
              <label class="form-label">Buscar</label>
              <input type="text" id="filtro-buscar" class="form-control" placeholder="No. Factura o Cliente…" spellcheck="false">
            </div>
            <div class="col-md-2">
              <label class="form-label">Estado</label>
              <select id="filtro-estado" class="form-select">
                <option value="">-- Todos --</option>
                <option value="pagada">Pagada</option>
                <option value="pendiente">Pendiente</option>
                <option value="abono_parcial">Abono Parcial</option>
                <option value="vencida">Vencida</option>
                <option value="anulada">Anulada</option>
              </select>
            </div>
            ${isAdminOrGerente && ['admin', 'superadmin'].includes(usuario.rol) ? `
              <div class="col-md-2">
                <label class="form-label">Sede</label>
                <select id="filtro-sede" class="form-select">
                  <option value="">-- Todas --</option>
                  ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                </select>
              </div>
            ` : '<input type="hidden" id="filtro-sede" value="">'}
            <div class="col-md-2">
              <label class="form-label">Desde</label>
              <input type="date" id="filtro-desde" class="form-control">
            </div>
            <div class="col-md-2">
              <label class="form-label">Hasta</label>
              <input type="date" id="filtro-hasta" class="form-control">
            </div>
            <div class="col-md-1 d-flex align-items-end">
              <button type="submit" class="btn btn-primary w-100" aria-label="Buscar factura"><i class="ti ti-search"></i></button>
            </div>
          </form>
        </div>
      </div>

      <!-- Listado de Facturas -->
      <div class="card">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover table-striped">
            <thead>
              <tr>
                <th>No. Factura</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Sede</th>
                <th>Origen</th>
                <th class="text-end">Total</th>
                <th class="text-center">Estado</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="facturas-table-body">
              <!-- Carga dinámica -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal Detalle Factura -->
    <div class="modal modal-blur fade" id="modal-detalle-factura" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
        <div class="modal-content" id="detalle-factura-content">
          <!-- Carga dinámica -->
        </div>
      </div>
    </div>
  `;

  const tbody = document.getElementById('facturas-table-body');
  const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle-factura'));

  function renderFacturasTable(data) {
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-secondary">No se encontraron facturas registradas.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(f => {
      let badgeClass = 'bg-blue-lt';
      if (f.estado === 'pagada') badgeClass = 'bg-success-lt';
      else if (f.estado === 'anulada') badgeClass = 'bg-danger-lt';
      else if (f.estado === 'vencida') badgeClass = 'bg-red-lt';
      else if (f.estado === 'abono_parcial') badgeClass = 'bg-warning-lt';

      const origen = f.venta ? `Venta (${f.venta.numeroVenta})` : (f.ordenReparacion ? `Taller (${f.ordenReparacion.numeroOrden})` : 'Manual');

      return `
        <tr>
          <td><strong class="text-blue">${f.numeroFactura}</strong></td>
          <td>${new Date(f.createdAt).toLocaleDateString()}</td>
          <td>${f.cliente ? f.cliente.nombre : 'Cliente General'}</td>
          <td>${f.sede ? f.sede.nombre : 'N/A'}</td>
          <td>${origen}</td>
          <td class="text-end fw-bold">${formatter.format(f.total)}</td>
          <td class="text-center">
            <span class="badge ${badgeClass} px-2 py-1">${f.estado.toUpperCase()}</span>
          </td>
          <td class="text-end erp-td-actions">
            ${erpActions(`
              ${erpAction('view', { className: 'btn-ver-factura', attrs: { 'data-id': f.id } })}
              ${erpAction('pdf', { className: 'btn-pdf-factura', attrs: { 'data-id': f.id } })}
              ${isAdminOrGerente && f.estado !== 'anulada' ? erpAction('anular', { className: 'btn-anular-factura', attrs: { 'data-id': f.id } }) : ''}
            `)}
          </td>
        </tr>
      `;
    }).join('');

    // Attach listeners
    document.querySelectorAll('.btn-ver-factura').forEach(btn => {
      btn.addEventListener('click', () => openDetalle(btn.dataset.id));
    });

    document.querySelectorAll('.btn-pdf-factura').forEach(btn => {
      btn.addEventListener('click', () => downloadPdf(btn.dataset.id));
    });

    document.querySelectorAll('.btn-anular-factura').forEach(btn => {
      btn.addEventListener('click', () => anularFactura(btn.dataset.id));
    });
  }

  renderFacturasTable(facturas);

  // Filters Submit
  document.getElementById('form-filtros-facturacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    
    try {
      const buscar = document.getElementById('filtro-buscar').value;
      const estado = document.getElementById('filtro-estado').value;
      const sede = document.getElementById('filtro-sede').value;
      const desde = document.getElementById('filtro-desde').value;
      const hasta = document.getElementById('filtro-hasta').value;

      const params = [];
      if (buscar) params.push(`buscar=${buscar}`);
      if (estado) params.push(`estado=${estado}`);
      if (sede) params.push(`sede=${sede}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);

      const query = params.length > 0 ? '?' + params.join('&') : '';
      const filtradas = await apiFetch(`/facturas${query}`);
      renderFacturasTable(filtradas);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  });

  // Open Details Modal
  async function openDetalle(id) {
    const content = document.getElementById('detalle-factura-content');
    content.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;
    modalDetalle.show();

    try {
      const [f, config] = await Promise.all([
        apiFetch(`/facturas/${id}`),
        apiFetch('/config/sistema').catch(() => ({}))
      ]);

      content.innerHTML = `
        <div class="modal-header d-print-none">
          <h5 class="modal-title">Factura de venta <strong>${f.numeroFactura}</strong></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body cot-doc-modal-body">
          ${renderFacturaDocumento(f, config)}
        </div>
        <div class="modal-footer d-print-none">
          <button type="button" class="btn btn-outline-secondary" id="btn-imprimir-factura">
            <i class="ti ti-printer me-1"></i> Imprimir
          </button>
          <button type="button" class="btn btn-primary" id="modal-download-pdf">
            <i class="ti ti-file-text me-1"></i> Descargar PDF
          </button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
        </div>
      `;

      document.getElementById('btn-imprimir-factura')?.addEventListener('click', () => printFacturaDocumento());
      document.getElementById('modal-download-pdf')?.addEventListener('click', () => downloadPdf(f.id, f.numeroFactura));
    } catch (err) {
      content.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
    }
  }

  // Download PDF Action
  async function downloadPdf(id, numero) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/facturas/${id}/pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('No se pudo descargar el PDF de la factura.');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factura_${numero || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
    }
  }

  // Void Invoice Action (Nota Crédito)
  async function anularFactura(id) {
    const verificado = await showConfirm('Anular Factura', '¿Está seguro de que desea ANULAR esta factura mediante Nota de Crédito? Esta acción devolverá los productos al stock, anulará los IMEI vendidos y revertirá los ingresos en caja. Esta acción es irreversible.');
    if (!verificado) {
      return;
    }

    try {
      const res = await apiFetch(`/facturas/${id}/nota-credito`, { method: 'POST' });
      alert(res.message);
      await loadData();
      renderFacturasTable(facturas);
    } catch (err) {
      alert('Error al anular factura: ' + err.message);
    }
  }
}

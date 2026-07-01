import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';

export async function initCartera(container) {
  const usuario = getUsuario();
  const sedeId = usuario.sedeId;
  let activeAbonoSedeId = null;

  let morosidadFiltro = '';
  let activeCpcId = null;

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Cartera',
        title: 'Cuentas por cobrar',
        subtitle: 'Créditos, plazos de pago y recaudo por sede'
      })}

      <div class="card mb-4 d-print-none erp-filter-card">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Antigüedad de Mora</label>
              <select id="filtro-morosidad" class="form-select">
                <option value="">-- Toda la Cartera --</option>
                <option value="0-30">Al día / Corto plazo (0-30 días)</option>
                <option value="30-60">Mora temprana (30-60 días)</option>
                <option value="60-90">Mora media (60-90 días)</option>
                <option value="+90">Mora crítica (+90 días)</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Estado de la Deuda</label>
              <select id="filtro-estado" class="form-select">
                <option value="">-- Todos los Estados --</option>
                <option value="al_dia">Activa (Al Día)</option>
                <option value="vencida">Vencida</option>
                <option value="pagada">Liquidada / Pagada</option>
              </select>
            </div>
            <div class="col-md-4 d-flex align-items-end">
              <button id="btn-buscar-cartera" class="btn btn-primary w-100"><i class="ti ti-search me-1"></i> Consultar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">Cuentas por Cobrar Pendientes</h3></div>
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover table-striped">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Factura</th>
                <th>Vencimiento</th>
                <th class="text-center">Días Mora</th>
                <th class="text-end">Total</th>
                <th class="text-end">Abonado</th>
                <th class="text-end">Saldo Pendiente</th>
                <th class="text-center">Estado</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="cartera-table-body">
              <tr><td colspan="9" class="text-center py-4 text-secondary">Cargando datos de cartera…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal Registrar Abono Cartera -->
    <div class="modal modal-blur fade" id="modal-abono-cartera" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Registrar Abono a Crédito</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-abono-cartera">
            <div class="modal-body">
              <div class="alert alert-info text-center py-2 mb-3">
                El dinero recaudado se registrará automáticamente en la caja del cajero hoy.
              </div>
              <div class="mb-3">
                <label class="form-label">Saldo Pendiente Actual</label>
                <input type="text" id="abono-saldo-pendiente" class="form-control-plaintext font-weight-bold h3 text-danger" readonly value="$ 0">
              </div>
              <div class="mb-3">
                <label class="form-label">Monto del Abono (COP)</label>
                <input type="number" id="abono-monto" class="form-control form-control-lg text-success fw-bold" placeholder="Ej: 100000" min="1" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Método de Pago</label>
                <select id="abono-metodo" class="form-select" required>
                  <option value="efectivo">Efectivo</option>
                  <option value="nequi">Nequi</option>
                  <option value="daviplata">Daviplata</option>
                  <option value="tarjeta">Tarjeta Crédito/Débito</option>
                  <option value="transferencia">Transferencia Bancaria</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Observaciones</label>
                <input type="text" id="abono-observaciones" class="form-control" placeholder="Ej: Recibo de cuota 2">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Aplicar Recaudo</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const modalAbono = new bootstrap.Modal(document.getElementById('modal-abono-cartera'));
  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  // Cargar Cartera
  const loadCartera = async () => {
    const tbody = document.getElementById('cartera-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const morosidad = document.getElementById('filtro-morosidad').value;
      const estado = document.getElementById('filtro-estado').value;

      const params = [];
      if (sedeId) params.push(`sede=${sedeId}`);
      if (morosidad) params.push(`morosidad=${morosidad}`);
      if (estado) params.push(`estado=${estado}`);

      const query = params.length > 0 ? '?' + params.join('&') : '';
      const data = await apiFetch(`/cartera${query}`);

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">No se encontraron créditos registrados en cartera.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(item => {
        let statusBadge = 'bg-success-lt';
        if (item.estado === 'vencida') statusBadge = 'bg-danger-lt';
        else if (item.estado === 'al_dia') statusBadge = 'bg-yellow-lt';

        let semaforoClass = 'bg-success';
        if (item.semaforo === 'red') semaforoClass = 'bg-danger';
        else if (item.semaforo === 'orange') semaforoClass = 'bg-orange';
        else if (item.semaforo === 'yellow') semaforoClass = 'bg-warning';

        return `
          <tr>
            <td>
              <strong class="text-dark">${item.cliente ? item.cliente.nombre : 'Cliente General'}</strong><br>
              <span class="text-secondary small">Doc: ${item.cliente ? item.cliente.documento || 'No reg' : 'N/A'}</span>
            </td>
            <td>
              <strong>${item.factura ? item.factura.numeroFactura : 'N/A'}</strong><br>
              <span class="text-secondary small">Sede: ${item.factura && item.factura.sede ? item.factura.sede.nombre : 'N/A'}</span>
            </td>
            <td>${new Date(item.fechaVencimiento).toLocaleDateString()}</td>
            <td class="text-center">
              ${item.diasVencido > 0 ? `
                <span class="badge ${semaforoClass} text-white px-2 py-1">${item.diasVencido} días</span>
              ` : `
                <span class="badge bg-green-lt px-2 py-1">Al día</span>
              `}
            </td>
            <td class="text-end fw-semibold">${formatter.format(item.totalOriginal)}</td>
            <td class="text-end text-success">${formatter.format(item.totalAbonado)}</td>
            <td class="text-end fw-bold text-danger">${formatter.format(item.saldoPendiente)}</td>
            <td class="text-center"><span class="badge ${statusBadge} px-2 py-1">${item.estado.toUpperCase()}</span></td>
            <td class="text-end">
              ${parseFloat(item.saldoPendiente) > 0 ? `
                <button class="btn btn-primary btn-sm btn-abono-cpc" data-id="${item.id}" data-saldo="${item.saldoPendiente}" data-sede="${item.factura ? item.factura.sedeId || '' : ''}">
                  <i class="ti ti-plus me-1"></i>Abonar
                </button>
              ` : `
                <span class="text-success small"><i class="ti ti-check me-1"></i>Saldado</span>
              `}
            </td>
          </tr>
        `;
      }).join('');

      document.querySelectorAll('.btn-abono-cpc').forEach(btn => {
        btn.addEventListener('click', (e) => {
          activeCpcId = btn.dataset.id;
          activeAbonoSedeId = btn.dataset.sede || null;
          document.getElementById('form-abono-cartera').reset();
          document.getElementById('abono-saldo-pendiente').value = formatter.format(btn.dataset.saldo);
          document.getElementById('abono-monto').max = btn.dataset.saldo;
          modalAbono.show();
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error: ${e.message}</td></tr>`;
    }
  };

  document.getElementById('btn-buscar-cartera').addEventListener('click', loadCartera);

  // Submit Abono
  document.getElementById('form-abono-cartera').addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      monto: parseFloat(document.getElementById('abono-monto').value),
      metodo: document.getElementById('abono-metodo').value,
      observaciones: document.getElementById('abono-observaciones').value.trim()
    };

    if (activeAbonoSedeId) {
      payload.sedeId = activeAbonoSedeId;
    }

    try {
      await apiFetch(`/cartera/${activeCpcId}/abono`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      alert('Abono registrado exitosamente. Caja diaria actualizada.');
      modalAbono.hide();
      loadCartera();
    } catch (err) {
      alert(err.message);
    }
  });

  await loadCartera();
}

import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';

export async function initCartera(container) {
  const usuario = getUsuario();
  const sedeId = usuario.sedeId;
  let activeAbonoSedeId = null;

  let morosidadFiltro = '';
  let activeCpcId = null;
  let lastCarteraData = [];
  const canRecordatorio = ['admin', 'superadmin', 'gerente_sede', 'contador'].includes(usuario.rol);
  const mediosPago = await apiFetch('/config/sistema').then((config) => {
    const porDefecto = [
      { id: 'efectivo', nombre: 'Efectivo' }, { id: 'nequi', nombre: 'Nequi' },
      { id: 'daviplata', nombre: 'Daviplata' }, { id: 'tarjeta', nombre: 'Tarjeta' },
      { id: 'transferencia', nombre: 'Transferencia' }
    ];
    return Array.isArray(config.mediosPago)
      ? config.mediosPago.filter((medio) => medio?.id && medio.activo !== false)
      : porDefecto;
  }).catch(() => []);

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Cartera',
        title: 'Cuentas por cobrar',
        subtitle: 'Créditos, plazos de pago y recaudo por sede'
      })}

      <div class="row g-2 mb-2" id="cartera-resumen-kpis">
        <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Total pendiente</div><div class="h2 mb-0" id="cartera-kpi-total">—</div></div></div></div>
        <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Vencida</div><div class="h2 mb-0 text-danger" id="cartera-kpi-vencida">—</div></div></div></div>
        <div class="col-md-4"><div class="card card-sm"><div class="card-body"><div class="text-secondary small">Al día</div><div class="h2 mb-0 text-success" id="cartera-kpi-aldia">—</div></div></div></div>
      </div>

      <div class="erp-list-workspace">
      <div class="card erp-filter-card d-print-none">
        <div class="card-body">
          <div class="row g-2 align-items-end">
            <div class="col-md-3">
              <label class="form-label">Antigüedad de Mora</label>
              <select id="filtro-morosidad" class="form-select">
                <option value="">-- Toda la Cartera --</option>
                <option value="0-30">Al día / Corto plazo (0-30 días)</option>
                <option value="30-60">Mora temprana (30-60 días)</option>
                <option value="60-90">Mora media (60-90 días)</option>
                <option value="+90">Mora crítica (+90 días)</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Estado de la Deuda</label>
              <select id="filtro-estado" class="form-select">
                <option value="">-- Todos los Estados --</option>
                <option value="al_dia">Activa (Al Día)</option>
                <option value="vencida">Vencida</option>
                <option value="pagada">Liquidada / Pagada</option>
              </select>
            </div>
            <div class="col-md-2 d-flex align-items-end">
              <button id="btn-buscar-cartera" class="btn btn-primary w-100 erp-filter-submit"><i class="ti ti-filter me-1"></i>Filtrar</button>
            </div>
            <div class="col-md-2 d-flex align-items-end">
              <button type="button" id="btn-export-cartera" class="btn btn-outline-secondary w-100"><i class="ti ti-download me-1"></i> CSV</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card erp-table-panel">
        <div class="card-header py-2"><h3 class="card-title">Cuentas por Cobrar Pendientes</h3></div>
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover mb-0">
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
                  ${mediosPago.map((medio) => `<option value="${medio.id}">${medio.nombre}</option>`).join('')}
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

    <div class="modal modal-blur fade" id="modal-detalle-cartera" tabindex="-1" aria-labelledby="modal-detalle-cartera-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <p class="text-secondary text-uppercase small fw-bold mb-1">Cuenta por cobrar</p>
              <h5 class="modal-title" id="modal-detalle-cartera-title">Detalle de crédito</h5>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body" id="cartera-detalle-content"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const modalAbono = new bootstrap.Modal(document.getElementById('modal-abono-cartera'));
  const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle-cartera'));
  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
  const escapeHtml = (value) => String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const formatDate = (value) => value ? new Date(value).toLocaleDateString('es-CO') : '—';

  const openDetalle = (item) => {
    const cliente = item.cliente || {};
    const factura = item.factura || {};
    const estado = item.estado === 'vencida' ? 'Vencida' : item.estado === 'pagada' ? 'Pagada' : 'Al día';
    const estadoClass = item.estado === 'vencida' ? 'text-danger' : item.estado === 'pagada' ? 'text-success' : 'text-warning';

    document.getElementById('modal-detalle-cartera-title').textContent = `Crédito ${factura.numeroFactura || 'sin factura'}`;
    document.getElementById('cartera-detalle-content').innerHTML = `
      <div class="row g-3">
        <div class="col-md-7">
          <div class="border rounded p-3 h-100">
            <div class="text-secondary text-uppercase small fw-bold mb-2">Cliente</div>
            <div class="fw-bold fs-3">${escapeHtml(cliente.nombre || 'Cliente general')}</div>
            <div class="small text-secondary mt-2">Documento: ${escapeHtml(cliente.documento || 'No registrado')}</div>
            <div class="small text-secondary">Teléfono: ${escapeHtml(cliente.telefono || 'No registrado')}</div>
            <div class="small text-secondary">Correo: ${escapeHtml(cliente.email || 'No registrado')}</div>
          </div>
        </div>
        <div class="col-md-5">
          <div class="border rounded p-3 h-100">
            <div class="text-secondary text-uppercase small fw-bold mb-2">Documento</div>
            <div class="fw-bold fs-3">${escapeHtml(factura.numeroFactura || '—')}</div>
            <div class="small text-secondary mt-2">Sede: ${escapeHtml(factura.sede?.nombre || 'No registrada')}</div>
            <div class="small text-secondary">Vence: ${formatDate(item.fechaVencimiento)}</div>
            <div class="small ${estadoClass} fw-bold mt-2">${estado}${item.diasVencido > 0 ? ` · ${item.diasVencido} días de mora` : ''}</div>
          </div>
        </div>
        <div class="col-12">
          <div class="row g-2 text-center">
            <div class="col-md-4"><div class="bg-light border rounded p-3"><div class="small text-secondary">Total original</div><div class="fw-bold">${formatter.format(item.totalOriginal)}</div></div></div>
            <div class="col-md-4"><div class="bg-light border rounded p-3"><div class="small text-secondary">Abonado</div><div class="fw-bold text-success">${formatter.format(item.totalAbonado)}</div></div></div>
            <div class="col-md-4"><div class="bg-light border rounded p-3"><div class="small text-secondary">Saldo pendiente</div><div class="fw-bold text-danger">${formatter.format(item.saldoPendiente)}</div></div></div>
          </div>
        </div>
      </div>
    `;
    modalDetalle.show();
  };

  const loadResumen = async () => {
    try {
      const q = sedeId ? `?sede=${sedeId}` : '';
      const res = await apiFetch(`/analytics/finanzas/cartera${q}`);
      document.getElementById('cartera-kpi-total').textContent = formatter.format(res.totalPendiente);
      document.getElementById('cartera-kpi-vencida').textContent = formatter.format(res.totalVencida);
      document.getElementById('cartera-kpi-aldia').textContent = formatter.format(res.totalAlDia);
    } catch (e) {
      console.error(e);
    }
  };

  const exportCsv = () => {
    if (!lastCarteraData.length) {
      alert('No hay datos para exportar.');
      return;
    }
    const escape = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols = ['Cliente', 'Factura', 'Vencimiento', 'Días mora', 'Saldo', 'Estado'];
    const rows = lastCarteraData.map(i => [
      i.cliente?.nombre, i.factura?.numeroFactura,
      new Date(i.fechaVencimiento).toLocaleDateString(),
      i.diasVencido, i.saldoPendiente, i.estado
    ].map(escape).join(','));
    const blob = new Blob(['\uFEFF' + [cols.join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cartera_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

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
      lastCarteraData = data;

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
              <strong class="text-dark">${item.pagadorExterno || (item.cliente ? item.cliente.nombre : 'Cliente General')}</strong><br>
              <span class="text-secondary small">${item.pagadorExterno ? `Recaudo de venta · Cliente: ${item.cliente?.nombre || 'Consumidor final'}` : `Doc: ${item.cliente ? item.cliente.documento || 'No reg' : 'N/A'}`}</span>
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
            <td class="text-end erp-td-actions">
              ${erpActions(`
                ${erpAction('view', { className: 'btn-ver-cpc', attrs: { 'data-id': item.id }, label: 'Ver detalle' })}
              ${parseFloat(item.saldoPendiente) > 0 ? `
                <button class="btn btn-primary btn-sm btn-abono-cpc" data-id="${item.id}" data-saldo="${item.saldoPendiente}" data-sede="${item.factura ? item.factura.sedeId || '' : ''}">
                  <i class="ti ti-plus me-1"></i>Abonar
                </button>
                ${canRecordatorio && !item.esRecaudoExterno ? `
                <button class="btn btn-outline-secondary btn-sm btn-recordatorio-cpc ms-1" data-id="${item.id}" title="Enviar recordatorio por correo">
                  <i class="ti ti-mail"></i>
                </button>` : ''}
              ` : `
                <span class="text-success small"><i class="ti ti-check me-1"></i>Saldado</span>
              `}
              `)}
            </td>
          </tr>
        `;
      }).join('');

      document.querySelectorAll('.btn-abono-cpc').forEach(btn => {
        btn.addEventListener('click', () => {
          activeCpcId = btn.dataset.id;
          activeAbonoSedeId = btn.dataset.sede || null;
          document.getElementById('form-abono-cartera').reset();
          document.getElementById('abono-saldo-pendiente').value = formatter.format(btn.dataset.saldo);
          document.getElementById('abono-monto').max = btn.dataset.saldo;
          modalAbono.show();
        });
      });

      document.querySelectorAll('.btn-ver-cpc').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = lastCarteraData.find((cuenta) => cuenta.id === btn.dataset.id);
          if (item) openDetalle(item);
        });
      });

      document.querySelectorAll('.btn-recordatorio-cpc').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Enviar recordatorio de pago por correo al cliente?')) return;
          try {
            await apiFetch(`/cartera/${btn.dataset.id}/recordatorio`, { method: 'POST' });
            alert('Recordatorio enviado correctamente.');
          } catch (err) {
            alert(err.message);
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error: ${e.message}</td></tr>`;
    }
  };

  document.getElementById('btn-buscar-cartera').addEventListener('click', () => {
    loadCartera();
    loadResumen();
  });
  document.getElementById('btn-export-cartera').addEventListener('click', exportCsv);

  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (hashParams.get('estado')) {
    document.getElementById('filtro-estado').value = hashParams.get('estado');
  }

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
      loadResumen();
    } catch (err) {
      alert(err.message);
    }
  });

  await loadResumen();
  await loadCartera();
}

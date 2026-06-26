import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

export async function initCotizaciones(container) {
  const usuario = getUsuario();
  const sedeId = usuario.sedeId;

  let clientes = [];
  let productos = [];
  let sedes = [];
  let cotizacionCart = [];

  try {
    clientes = await apiFetch('/clientes').catch(() => []);
    productos = await apiFetch('/productos').catch(() => []);
    if (['admin', 'superadmin'].includes(usuario.rol)) {
      sedes = await apiFetch('/config/sedes').catch(() => []);
    }
  } catch (e) {
    console.error('Error precargando datos en cotizaciones:', e);
  }

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Cotizaciones y Presupuestos</h2>
            <div class="text-secondary mt-1">Gestión de presupuestos comerciales para clientes</div>
          </div>
        </div>
      </div>

      <!-- Navigation tabs -->
      <div class="card mb-4 d-print-none">
        <div class="card-header">
          <ul class="nav nav-tabs card-header-tabs" data-bs-toggle="tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <a href="#tab-historial-cot" class="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab">
                <i class="ti ti-history me-1"></i> Historial
              </a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-nueva-cot" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-plus me-1"></i> Nueva Cotización
              </a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <!-- TAB 1: HISTORIAL -->
            <div class="tab-pane active show" id="tab-historial-cot" role="tabpanel">
              <div class="row g-3 mb-4">
                <div class="col-md-4">
                  <input type="text" id="filtro-cot-buscar" class="form-control" placeholder="Buscar por número o cliente…" spellcheck="false">
                </div>
                <div class="col-md-3">
                  <select id="filtro-cot-estado" class="form-select">
                    <option value="">-- Todos los Estados --</option>
                    <option value="borrador">Borrador</option>
                    <option value="enviada">Enviada</option>
                    <option value="aprobada">Aprobada</option>
                    <option value="rechazada">Rechazada</option>
                    <option value="expirada">Expirada</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <button id="btn-filtrar-cot" class="btn btn-primary"><i class="ti ti-search me-1"></i> Buscar</button>
                </div>
              </div>

              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover table-striped">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Cliente</th>
                      <th>Fecha Vence</th>
                      <th class="text-end">Total</th>
                      <th class="text-center">Estado</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="cotizaciones-table-body">
                    <tr><td colspan="6" class="text-center py-4 text-secondary">Cargando cotizaciones…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 2: NUEVA COTIZACIÓN -->
            <div class="tab-pane" id="tab-nueva-cot" role="tabpanel">
              <form id="form-nueva-cotizacion">
                <div class="row">
                  ${['admin', 'superadmin'].includes(usuario.rol) ? `
                    <div class="col-md-4 mb-3">
                      <label class="form-label">Sede</label>
                      <select id="cot-sede" class="form-select" required>
                        <option value="">-- Seleccionar Sede --</option>
                        ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label">Cliente</label>
                      <select id="cot-cliente" class="form-select" required>
                        <option value="">-- Seleccionar Cliente --</option>
                        ${clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.documento || 'Sin doc'})</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label">Fecha de Vencimiento</label>
                      <input type="date" id="cot-vencimiento" class="form-control" required>
                    </div>
                  ` : `
                    <div class="col-md-6 mb-3">
                      <label class="form-label">Cliente</label>
                      <select id="cot-cliente" class="form-select" required>
                        <option value="">-- Seleccionar Cliente --</option>
                        ${clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.documento || 'Sin doc'})</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-6 mb-3">
                      <label class="form-label">Fecha de Vencimiento</label>
                      <input type="date" id="cot-vencimiento" class="form-control" required>
                    </div>
                  `}
                </div>

                <div class="mb-3">
                  <label class="form-label">Notas y Términos</label>
                  <textarea id="cot-notas" class="form-control" rows="2" placeholder="Notas internas o condiciones comerciales…" spellcheck="false"></textarea>
                </div>

                <div class="card p-3 mb-3 bg-light">
                  <h4 class="card-title mb-3">Agregar Ítems</h4>
                  <div class="row g-2">
                    <div class="col-md-5">
                      <label class="form-label small text-secondary">Producto del Catálogo</label>
                      <select id="cot-add-producto" class="form-select">
                        <option value="">-- Seleccionar Producto (Opcional) --</option>
                        ${productos.map(p => `<option value="${p.id}" data-precio="${p.precioVenta}" data-nombre="${p.nombre}">${p.nombre} ($ ${new Intl.NumberFormat('es-CO').format(p.precioVenta)})</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small text-secondary">Descripción Manual / Servicio</label>
                      <input type="text" id="cot-add-desc" class="form-control" placeholder="Ej: Servicio de mantenimiento">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label small text-secondary">Precio Unitario</label>
                      <input type="number" id="cot-add-precio" class="form-control" placeholder="0" min="0">
                    </div>
                    <div class="col-md-1 d-flex align-items-end">
                      <button type="button" id="btn-add-item-cot" class="btn btn-success w-100" aria-label="Agregar ítem a cotización"><i class="ti ti-plus"></i></button>
                    </div>
                  </div>
                </div>

                <div class="table-responsive mb-3">
                  <table class="table table-vcenter">
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th style="width: 100px;">Cant.</th>
                        <th class="text-end">Precio Unit.</th>
                        <th class="text-end">Subtotal</th>
                        <th style="width: 50px;"></th>
                      </tr>
                    </thead>
                    <tbody id="cot-cart-body">
                      <tr><td colspan="5" class="text-center py-3 text-secondary">Ningún ítem agregado.</td></tr>
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colspan="3" class="text-end">TOTAL COTIZACIÓN:</th>
                        <th id="cot-cart-total" class="text-end text-primary h3">$ 0</th>
                        <th></th>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <button type="submit" class="btn btn-primary w-100 btn-lg"><i class="ti ti-device-floppy me-1"></i> Guardar y Crear Cotización</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Detalle Cotizacion -->
    <div class="modal modal-blur fade" id="modal-detalle-cot" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content" id="detalle-cot-content"></div>
      </div>
    </div>
  `;

  const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle-cot'));
  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  // Poner fecha de vencimiento por defecto a 15 días
  const today = new Date();
  today.setDate(today.getDate() + 15);
  document.getElementById('cot-vencimiento').value = today.toISOString().split('T')[0];

  // Listener para autocompletar precio al seleccionar producto
  document.getElementById('cot-add-producto').addEventListener('change', (e) => {
    const opt = e.target.options[e.target.selectedIndex];
    if (opt.value) {
      document.getElementById('cot-add-desc').value = opt.getAttribute('data-nombre');
      document.getElementById('cot-add-precio').value = opt.getAttribute('data-precio');
    }
  });

  // Agregar item al carro
  document.getElementById('btn-add-item-cot').addEventListener('click', () => {
    const prodSelect = document.getElementById('cot-add-producto');
    const descInput = document.getElementById('cot-add-desc');
    const precioInput = document.getElementById('cot-add-precio');

    const desc = descInput.value.trim();
    const precio = parseFloat(precioInput.value || 0);

    if (!desc || precio <= 0) {
      alert('Debe ingresar una descripción y precio unitario válido.');
      return;
    }

    const prodId = prodSelect.value || null;

    cotizacionCart.push({
      productoId: prodId,
      descripcion: desc,
      cantidad: 1,
      precioUnitario: precio
    });

    // Limpiar inputs
    prodSelect.value = '';
    descInput.value = '';
    precioInput.value = '';

    renderCotCart();
  });

  function renderCotCart() {
    const tbody = document.getElementById('cot-cart-body');
    const totalEl = document.getElementById('cot-cart-total');

    if (cotizacionCart.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-secondary">Ningún ítem agregado.</td></tr>`;
      totalEl.innerText = '$ 0';
      return;
    }

    let total = 0;
    tbody.innerHTML = cotizacionCart.map((item, idx) => {
      const subtotal = item.cantidad * item.precioUnitario;
      total += subtotal;
      return `
        <tr>
          <td>
            <strong>${item.descripcion}</strong>
            ${item.productoId ? '<br><span class="badge bg-blue-lt">Catálogo</span>' : '<br><span class="badge bg-yellow-lt">Manual/Servicio</span>'}
          </td>
          <td>
            <input type="number" class="form-control form-control-sm input-cot-qty" data-idx="${idx}" value="${item.cantidad}" min="1">
          </td>
          <td class="text-end font-weight-medium">${formatter.format(item.precioUnitario)}</td>
          <td class="text-end fw-bold text-dark">${formatter.format(subtotal)}</td>
          <td>
            <button type="button" class="btn btn-sm btn-link link-danger btn-remove-item-cot" data-idx="${idx}" aria-label="Eliminar ítem"><i class="ti ti-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');

    totalEl.innerText = formatter.format(total);

    // Listeners qty
    document.querySelectorAll('.input-cot-qty').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const qty = parseInt(e.target.value || 1);
        cotizacionCart[idx].cantidad = qty > 0 ? qty : 1;
        renderCotCart();
      });
    });

    // Listeners remove
    document.querySelectorAll('.btn-remove-item-cot').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.idx);
        cotizacionCart.splice(idx, 1);
        renderCotCart();
      });
    });
  }

  // Submit Nueva Cotización
  document.getElementById('form-nueva-cotizacion').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (cotizacionCart.length === 0) {
      alert('Debe agregar al menos un ítem a la cotización.');
      return;
    }

    const payload = {
      clienteId: document.getElementById('cot-cliente').value,
      fechaVencimiento: document.getElementById('cot-vencimiento').value,
      notas: document.getElementById('cot-notas').value,
      items: cotizacionCart
    };

    if (['admin', 'superadmin'].includes(usuario.rol) && document.getElementById('cot-sede')) {
      payload.sedeId = document.getElementById('cot-sede').value;
    }

    try {
      await apiFetch('/cotizaciones', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      alert('Cotización creada exitosamente.');
      cotizacionCart = [];
      document.getElementById('form-nueva-cotizacion').reset();
      renderCotCart();
      
      // Cambiar a pestaña historial y recargar
      const trigger = document.querySelector('a[href="#tab-historial-cot"]');
      if (trigger) {
        bootstrap.Tab.getInstance(trigger).show();
      }
      loadCotizaciones();

    } catch (err) {
      alert(err.message);
    }
  });

  // Cargar Historial
  const loadCotizaciones = async () => {
    const tbody = document.getElementById('cotizaciones-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const q = document.getElementById('filtro-cot-buscar').value;
      const estado = document.getElementById('filtro-cot-estado').value;

      const params = [];
      if (sedeId) params.push(`sede=${sedeId}`);
      if (q) params.push(`buscar=${q}`);
      if (estado) params.push(`estado=${estado}`);

      const query = params.length > 0 ? '?' + params.join('&') : '';
      const data = await apiFetch(`/cotizaciones${query}`);

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-secondary">No se encontraron cotizaciones.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(c => {
        let statusBadge = 'bg-secondary-lt';
        if (c.estado === 'aprobada') statusBadge = 'bg-success-lt';
        else if (c.estado === 'enviada') statusBadge = 'bg-blue-lt';
        else if (c.estado === 'rechazada') statusBadge = 'bg-red-lt';

        return `
          <tr>
            <td><strong>${c.numeroCotizacion}</strong></td>
            <td>${c.cliente ? c.cliente.nombre : 'Cliente General'}</td>
            <td>${new Date(c.fechaVencimiento).toLocaleDateString()}</td>
            <td class="text-end fw-bold text-dark">${formatter.format(c.total)}</td>
            <td class="text-center"><span class="badge ${statusBadge} px-2 py-1">${c.estado.toUpperCase()}</span></td>
            <td class="text-end">
              <div class="btn-list justify-content-end">
                <button class="btn btn-outline-primary btn-sm btn-view-cot" data-id="${c.id}">
                  <i class="ti ti-eye me-1"></i>Ver
                </button>
                <button class="btn btn-outline-secondary btn-sm btn-pdf-cot" data-id="${c.id}" data-num="${c.numeroCotizacion}">
                  <i class="ti ti-file-text me-1"></i>PDF
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      document.querySelectorAll('.btn-view-cot').forEach(btn => {
        btn.addEventListener('click', () => openDetalleCot(btn.dataset.id));
      });

      document.querySelectorAll('.btn-pdf-cot').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const num = btn.dataset.num || id;
          try {
            btn.disabled = true;
            btn.innerHTML = '<i class="ti ti-loader-2 me-1"></i>Generando…';
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/cotizaciones/${id}/pdf`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('No se pudo generar el PDF de la cotización.');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cotizacion_${num}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
          } catch (e) {
            alert(e.message);
          } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ti ti-file-text me-1"></i>PDF';
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error: ${e.message}</td></tr>`;
    }
  };

  document.getElementById('btn-filtrar-cot').addEventListener('click', loadCotizaciones);

  async function openDetalleCot(id) {
    const content = document.getElementById('detalle-cot-content');
    content.innerHTML = `<div class="modal-body text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;
    modalDetalle.show();

    try {
      const c = await apiFetch(`/cotizaciones/${id}`);
      let statusBadge = 'bg-secondary-lt';
      if (c.estado === 'aprobada') statusBadge = 'bg-success-lt';
      else if (c.estado === 'enviada') statusBadge = 'bg-blue-lt';
      else if (c.estado === 'rechazada') statusBadge = 'bg-red-lt';

      content.innerHTML = `
        <div class="modal-header">
          <h5 class="modal-title">Detalle de Cotización: <strong>${c.numeroCotizacion}</strong></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row mb-3">
            <div class="col-6">
              <span class="text-secondary small">Cliente:</span>
              <div class="fw-bold">${c.cliente ? c.cliente.nombre : 'Cliente General'}</div>
              <div class="text-secondary small">${c.cliente ? c.cliente.documento || '' : ''}</div>
            </div>
            <div class="col-6 text-end">
              <span class="text-secondary small">Vence el:</span>
              <div class="fw-bold">${new Date(c.fechaVencimiento).toLocaleDateString()}</div>
              <div><span class="badge ${statusBadge} px-2 py-1">${c.estado.toUpperCase()}</span></div>
            </div>
          </div>

          <table class="table table-striped table-sm">
            <thead>
              <tr>
                <th>Ítem / Descripción</th>
                <th class="text-center">Cant.</th>
                <th class="text-end">Precio Unitario</th>
                <th class="text-end">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${c.items.map(item => `
                <tr>
                  <td>
                    <strong>${item.descripcion}</strong>
                    ${item.productoId ? '<br><span class="badge bg-blue-lt">Catálogo</span>' : '<br><span class="badge bg-yellow-lt">Manual/Servicio</span>'}
                  </td>
                  <td class="text-center">${item.cantidad}</td>
                  <td class="text-end">${formatter.format(item.precioUnitario)}</td>
                  <td class="text-end fw-bold">${formatter.format(item.subtotal)}</td>
                </tr>
              `).join('')}
              <tr class="table-light fw-bold">
                <td colspan="3" class="text-end">TOTAL:</td>
                <td class="text-end text-primary font-weight-bold">${formatter.format(c.total)}</td>
              </tr>
            </tbody>
          </table>

          ${c.notas ? `
            <div class="mt-3">
              <span class="text-secondary small">Condiciones y Notas:</span>
              <blockquote class="blockquote border-left pl-3 mt-1 bg-light p-2 small">${c.notas}</blockquote>
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          ${c.estado !== 'aprobada' ? `
            <button id="btn-cobrar-pos-cot" class="btn btn-success me-auto">
              <i class="ti ti-shopping-cart me-1"></i> Cobrar y Procesar en POS
            </button>
          ` : ''}
          <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
        </div>
      `;

      if (document.getElementById('btn-cobrar-pos-cot')) {
        document.getElementById('btn-cobrar-pos-cot').addEventListener('click', () => {
          // Guardar cotización pendiente en localStorage para que el modulo POS la lea
          localStorage.setItem('pendingCotizacionId', c.id);
          modalDetalle.hide();
          window.location.hash = '#/pos';
        });
      }

    } catch (err) {
      content.innerHTML = `<div class="modal-body text-danger py-4">${err.message}</div>`;
    }
  }

  // Carga inicial
  await loadCotizaciones();
}

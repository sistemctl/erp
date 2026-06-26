import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

export async function initReparaciones(container) {
  const usuario = getUsuario();
  const esTecnico = usuario.rol === 'tecnico';
  const esCajero = usuario.rol === 'cajero';
  const isAdminOrGerente = ['admin', 'gerente_sede'].includes(usuario.rol);

  let ordenes = [];
  let tecnicos = [];
  let clientes = [];
  let productos = []; // Catálogo para repuestos

  // Cargar datos iniciales
  async function loadData() {
    try {
      ordenes = await apiFetch('/reparaciones');
      tecnicos = await apiFetch('/config/usuarios').then(users => users.filter(u => u.rol === 'tecnico' && u.activo));
      clientes = await apiFetch('/clientes').catch(() => []);
      productos = await apiFetch('/productos').then(prods => prods.filter(p => p.activo !== false));
    } catch (error) {
      console.error('Error al cargar datos de reparaciones:', error);
    }
  }

  await loadData();

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Gestión del Taller & Reparaciones</h2>
            <div class="text-secondary mt-1">Órdenes de servicio técnico por sede y estado de reparación</div>
          </div>
          <div class="col-auto ms-auto">
            <div class="btn-list">
              <input type="text" id="kanban-search" class="form-control d-inline-block w-auto me-2" placeholder="Buscar por orden, IMEI o cliente…" spellcheck="false">
              ${!esTecnico ? `
                <button id="btn-nueva-orden" class="btn btn-primary">
                  <i class="ti ti-plus me-2"></i> Nueva Orden
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Tablero Kanban -->
      <div class="row row-deck g-3" style="overflow-x: auto; flex-wrap: nowrap; padding-bottom: 15px;">
        ${renderKanbanColumn('Recibido', 'recibido', 'bg-blue-lt')}
        ${renderKanbanColumn('En Diagnóstico', 'diagnostico', 'bg-purple-lt')}
        ${renderKanbanColumn('En Reparación', 'en_reparacion', 'bg-warning-lt')}
        ${renderKanbanColumn('Listo para entrega', 'listo', 'bg-green-lt')}
        ${renderKanbanColumn('Entregado', 'entregado', 'bg-secondary-lt')}
        ${renderKanbanColumn('Cancelado', 'cancelado', 'bg-danger-lt')}
      </div>
    </div>

    <!-- Modal Registrar Orden -->
    <div class="modal modal-blur fade" id="modal-orden-reparacion" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Registrar Nueva Orden de Ingreso</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-nueva-orden">
            <div class="modal-body">
              <div class="row">
                <!-- Información del Cliente -->
                <div class="col-md-6 border-end">
                  <h4 class="mb-3 text-primary">Información del Cliente</h4>
                  <div class="mb-3">
                    <label class="form-label">Cliente Existente</label>
                    <select id="orden-cliente-select" class="form-select">
                      <option value="">-- Seleccionar o crear nuevo abajo --</option>
                      ${clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.documento || 'Sin doc'})</option>`).join('')}
                    </select>
                  </div>
                  <div class="card bg-light-lt p-3 mb-3" id="quick-client-card">
                    <h5 class="card-title text-secondary">Registrar Nuevo Cliente</h5>
                    <div class="mb-2">
                      <label class="form-label required">Nombre Completo</label>
                      <input type="text" id="cli-nombre" class="form-control form-control-sm">
                    </div>
                    <div class="mb-2">
                      <label class="form-label">Cédula / NIT</label>
                      <input type="text" id="cli-documento" class="form-control form-control-sm">
                    </div>
                    <div class="mb-2">
                      <label class="form-label">Teléfono</label>
                      <input type="text" id="cli-telefono" class="form-control form-control-sm">
                    </div>
                    <div class="mb-2">
                      <label class="form-label">Correo Electrónico</label>
                      <input type="email" id="cli-email" class="form-control form-control-sm" spellcheck="false">
                    </div>
                  </div>
                </div>

                <!-- Detalles del Dispositivo -->
                <div class="col-md-6">
                  <h4 class="mb-3 text-primary">Detalles del Equipo</h4>
                  <div class="row">
                    <div class="col-6 mb-3">
                      <label class="form-label required">Tipo de Equipo</label>
                      <input type="text" id="eq-tipo" class="form-control" placeholder="Ej: Celular, Laptop" required>
                    </div>
                    <div class="col-6 mb-3">
                      <label class="form-label required">Marca</label>
                      <input type="text" id="eq-marca" class="form-control" placeholder="Ej: Apple, Dell" required>
                    </div>
                  </div>
                  <div class="row">
                    <div class="col-6 mb-3">
                      <label class="form-label required">Modelo</label>
                      <input type="text" id="eq-modelo" class="form-control" placeholder="Ej: iPhone 15, Latitude" required>
                    </div>
                    <div class="col-6 mb-3">
                      <label class="form-label">Serial / IMEI</label>
                      <input type="text" id="eq-imei" class="form-control" placeholder="Trazabilidad única">
                    </div>
                  </div>
                  <div class="mb-3">
                    <label class="form-label required">Problema Reportado</label>
                    <textarea id="eq-problema" class="form-control" rows="2" placeholder="Falla reportada por el cliente…" required spellcheck="false"></textarea>
                  </div>
                  <div class="row">
                    <div class="col-6 mb-3">
                      <label class="form-label">Mano de Obra ($ COP)</label>
                      <input type="number" id="eq-mano-obra" class="form-control" placeholder="COP" min="0" value="0">
                    </div>
                    <div class="col-6 mb-3">
                      <label class="form-label">Días Garantía</label>
                      <input type="number" id="eq-garantia" class="form-control" min="0" value="30">
                    </div>
                  </div>
                  <div class="row">
                    <div class="col-6 mb-3">
                      <label class="form-label">Fecha Est. Entrega</label>
                      <input type="date" id="eq-fecha-entrega" class="form-control">
                    </div>
                    <div class="col-6 mb-3">
                      <label class="form-label">Técnico Asignado</label>
                      <select id="eq-tecnico" class="form-select">
                        <option value="">-- Por asignar --</option>
                        ${tecnicos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
                      </select>
                    </div>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Observaciones Físicas</label>
                    <input type="text" id="eq-observaciones" class="form-control" placeholder="Ej: Rayones leves en pantalla">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Fotos de Recepción</label>
                    <input type="file" id="eq-fotos" class="form-control" multiple accept="image/*">
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Registrar Orden de Ingreso</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Detalle/Editar Orden -->
    <div class="modal modal-blur fade" id="modal-detalle-orden" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
        <div class="modal-content" id="detalle-orden-content">
          <!-- Se carga dinámicamente -->
        </div>
      </div>
    </div>

    <!-- Modal Entregar/Cobrar Reparación -->
    <div class="modal modal-blur fade" id="modal-entregar-reparacion" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <form id="form-entregar-reparacion" class="modal-content shadow-lg">
          <input type="hidden" id="entregar-id">
          <div class="modal-header">
            <h5 class="modal-title fw-bold">Cobrar y Entregar Reparación</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-6 border-end">
                <p class="text-secondary small mb-3">La orden pasará al estado <strong>Entregado</strong> y se generará la factura correspondiente. Por favor confirme los datos del cobro.</p>
                <div class="mb-2">
                  <label class="form-label fw-bold">Orden N°</label>
                  <input type="text" id="entregar-numero" class="form-control-plaintext fw-bold text-blue py-0" readonly>
                </div>
                <div class="mb-2">
                  <label class="form-label fw-bold">Cliente</label>
                  <input type="text" id="entregar-cliente" class="form-control-plaintext py-0" readonly>
                </div>
                <div class="mt-4 alert alert-info py-2 mb-0">
                  <div class="fs-4 fw-bold">Total a Cobrar:</div>
                  <div class="h2 mb-0 fw-bold text-primary" id="entregar-total-txt">$ 0</div>
                </div>
              </div>
              <div class="col-md-6">
                <h4 class="mb-3 text-secondary">Desglose de Pago (Mixto)</h4>
                <div class="row g-2">
                  <div class="col-6 mb-2">
                    <label class="form-label small mb-1">Efectivo Recibido</label>
                    <input type="number" id="entregar-pay-efectivo" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                  <div class="col-6 mb-2">
                    <label class="form-label small mb-1">Nequi</label>
                    <input type="number" id="entregar-pay-nequi" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                  <div class="col-6 mb-2">
                    <label class="form-label small mb-1">Daviplata</label>
                    <input type="number" id="entregar-pay-daviplata" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                  <div class="col-6 mb-2">
                    <label class="form-label small mb-1">Tarjeta</label>
                    <input type="number" id="entregar-pay-tarjeta" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                  <div class="col-12 mb-2">
                    <label class="form-label small mb-1">Transferencia Bancaria</label>
                    <input type="number" id="entregar-pay-transferencia" class="form-control form-control-sm input-entregar-pago" min="0" value="0">
                  </div>
                </div>
              </div>
            </div>
            
            <div class="alert alert-secondary mt-3 mb-0 py-2">
              <div class="row align-items-center">
                <div class="col">
                  <div class="fs-5 text-secondary">Total Ingresado:</div>
                  <div class="h3 mb-0" id="entregar-total-ingresado">$ 0</div>
                </div>
                <div class="col-auto text-end">
                  <div class="fs-5 text-secondary" id="entregar-label-cambio">Cambio (Vuelto):</div>
                  <div class="h3 mb-0 text-success fw-bold" id="entregar-cambio">$ 0</div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-success ms-auto" id="entregar-submit-btn" disabled><i class="ti ti-check me-1"></i>Cobrar y Entregar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Modales
  const modalOrden = new bootstrap.Modal(document.getElementById('modal-orden-reparacion'));
  const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle-orden'));
  const modalEntregar = new bootstrap.Modal(document.getElementById('modal-entregar-reparacion'));

  // Renderizar columnas de Kanban
  function renderKanbanColumn(title, statusKey, colorClass) {
    return `
      <div class="col-md-2" style="min-width: 280px; max-width: 320px;">
        <div class="card bg-light-lt">
          <div class="card-header ${colorClass} py-2 d-flex justify-content-between align-items-center">
            <h3 class="card-title fw-bold text-dark mb-0">${title}</h3>
            <span class="badge bg-white text-dark fw-bold px-2 py-1" id="badge-count-${statusKey}">0</span>
          </div>
          <div class="card-body p-2 kanban-col" data-status="${statusKey}" style="max-height: 70vh; overflow-y: auto; min-height: 200px;">
            <!-- Cards -->
          </div>
        </div>
      </div>
    `;
  }

  // Cargar las tarjetas en el Kanban
  function fillKanban(searchQuery = '') {
    // Reset lists
    document.querySelectorAll('.kanban-col').forEach(col => col.innerHTML = '');
    const counts = { recibido: 0, diagnostico: 0, en_reparacion: 0, listo: 0, entregado: 0, cancelado: 0 };

    const query = searchQuery.toLowerCase().trim();

    ordenes.forEach(o => {
      // Filtrar
      if (query) {
        const num = o.numeroOrden.toLowerCase();
        const client = o.cliente ? o.cliente.nombre.toLowerCase() : '';
        const imei = o.imei ? o.imei.toLowerCase() : '';
        const equipo = `${o.tipoEquipo} ${o.marca} ${o.modelo}`.toLowerCase();
        if (!num.includes(query) && !client.includes(query) && !imei.includes(query) && !equipo.includes(query)) {
          return;
        }
      }

      const col = document.querySelector(`.kanban-col[data-status="${o.estado}"]`);
      if (col) {
        counts[o.estado]++;
        const card = document.createElement('div');
        card.className = 'card mb-2 card-hover cursor-pointer p-3 border shadow-sm drag-card';
        card.draggable = true;
        card.dataset.id = o.id;

        const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-start mb-2">
            <span class="badge bg-blue text-white fw-bold">${o.numeroOrden}</span>
            <span class="text-secondary small">${new Date(o.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="fw-bold text-dark fs-3 mb-1">${o.tipoEquipo} ${o.marca} ${o.modelo}</div>
          <div class="text-secondary small mb-2"><i class="ti ti-user me-1"></i>${o.cliente ? o.cliente.nombre : 'Cliente General'}</div>
          ${o.imei ? `<div class="text-secondary small mb-2"><i class="ti ti-device-mobile me-1"></i>IMEI/Serie: <strong>${o.imei}</strong></div>` : ''}
          <div class="d-flex justify-content-between align-items-center mt-2 border-top pt-2">
            <div class="text-secondary small">
              <i class="ti ti-settings me-1"></i>Téc: <strong>${o.tecnico ? o.tecnico.nombre.split(' ')[0] : 'Sin asignar'}</strong>
            </div>
            <div class="fw-bold text-primary">${formatter.format(o.totalCobrado)}</div>
          </div>
        `;

        // Abrir detalles en click
        card.addEventListener('click', () => openDetalle(o.id));

        // Drag events
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', o.id);
          card.classList.add('opacity-50');
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('opacity-50');
        });

        col.appendChild(card);
      }
    });

    // Update badges
    for (const [status, count] of Object.entries(counts)) {
      const badge = document.getElementById(`badge-count-${status}`);
      if (badge) badge.textContent = count;
    }
  }

  // Setup drag & drop columns
  document.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('bg-secondary-lt');
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('bg-secondary-lt');
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('bg-secondary-lt');
      const orderId = e.dataTransfer.getData('text/plain');
      const newStatus = col.dataset.status;

      if (newStatus === 'entregado') {
        openEntregarReparacionModal(orderId);
        return;
      }

      try {
        const res = await apiFetch(`/reparaciones/${orderId}/estado`, {
          method: 'PUT',
          body: JSON.stringify({ estado: newStatus })
        });
        // Actualizar local y recargar
        const idx = ordenes.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          ordenes[idx].estado = newStatus;
        }
        fillKanban(document.getElementById('kanban-search').value);
      } catch (err) {
        alert('Error al cambiar de estado: ' + err.message);
      }
    });
  });

  fillKanban();

  // Search input
  document.getElementById('kanban-search').addEventListener('input', (e) => {
    fillKanban(e.target.value);
  });

  // Toggle quick client input based on select
  const clientSelect = document.getElementById('orden-cliente-select');
  const quickClientCard = document.getElementById('quick-client-card');
  const cliNombre = document.getElementById('cli-nombre');

  clientSelect.addEventListener('change', () => {
    if (clientSelect.value) {
      quickClientCard.style.display = 'none';
      cliNombre.removeAttribute('required');
    } else {
      quickClientCard.style.display = 'block';
      cliNombre.setAttribute('required', 'true');
    }
  });

  // Open Nueva Orden Modal
  const btnNueva = document.getElementById('btn-nueva-orden');
  if (btnNueva) {
    btnNueva.addEventListener('click', () => {
      document.getElementById('form-nueva-orden').reset();
      quickClientCard.style.display = 'block';
      cliNombre.setAttribute('required', 'true');
      modalOrden.show();
    });
  }

  // Submit Nueva Orden
  document.getElementById('form-nueva-orden').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = e.submitter;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Registrando…`;

    try {
      let clienteId = clientSelect.value;

      // 1. Si no hay cliente seleccionado, crearlo primero
      if (!clienteId) {
        const nombre = cliNombre.value;
        const documento = document.getElementById('cli-documento').value;
        const telefono = document.getElementById('cli-telefono').value;
        const email = document.getElementById('cli-email').value;

        if (!nombre) throw new Error('Nombre del cliente es requerido.');

        const cli = await apiFetch('/clientes', {
          method: 'POST',
          body: JSON.stringify({ nombre, documento, telefono, email })
        });
        clienteId = cli.id;
      }

      // 2. Crear orden
      const payload = {
        clienteId,
        tipoEquipo: document.getElementById('eq-tipo').value,
        marca: document.getElementById('eq-marca').value,
        modelo: document.getElementById('eq-modelo').value,
        imei: document.getElementById('eq-imei').value,
        problemaReportado: document.getElementById('eq-problema').value,
        costoManoObra: document.getElementById('eq-mano-obra').value || 0,
        diasGarantia: document.getElementById('eq-garantia').value || 30,
        fechaEstimadaEntrega: document.getElementById('eq-fecha-entrega').value || null,
        tecnicoId: document.getElementById('eq-tecnico').value || null,
        observaciones: document.getElementById('eq-observaciones').value || ''
      };

      const ordenNueva = await apiFetch('/reparaciones', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // 3. Subir fotos si se seleccionaron
      const fileInput = document.getElementById('eq-fotos');
      if (fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('momento', 'recepcion');
        for (let i = 0; i < fileInput.files.length; i++) {
          formData.append('fotos', fileInput.files[i]);
        }
        await apiFetch(`/reparaciones/${ordenNueva.id}/fotos`, {
          method: 'POST',
          body: formData
        });
      }

      modalOrden.hide();
      await loadData();
      fillKanban(document.getElementById('kanban-search').value);
    } catch (err) {
      alert('Error al registrar orden: ' + err.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Registrar Orden de Ingreso';
    }
  });

  // Modal Detalle
  async function openDetalle(id) {
    const content = document.getElementById('detalle-orden-content');
    content.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-secondary">Cargando detalles de la orden…</div></div>`;
    modalDetalle.show();

    try {
      const orden = await apiFetch(`/reparaciones/${id}`);
      const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

      content.innerHTML = `
        <div class="modal-header">
          <h5 class="modal-title">Detalle de Reparación: <span class="badge bg-blue text-white">${orden.numeroOrden}</span></h5>
          <div class="ms-auto d-flex align-items-center">
            <button id="det-pdf-btn" class="btn btn-outline-primary btn-sm me-2">
              <i class="ti ti-file-text me-1"></i> Recibo PDF
            </button>
            <button id="det-qr-btn" class="btn btn-outline-secondary btn-sm me-2">
              <i class="ti ti-qrcode me-1"></i> Etiqueta QR
            </button>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body">
          <div class="row">
            <!-- Columna Ficha e Info -->
            <div class="col-md-5 border-end">
              <h4 class="text-primary mb-3"><i class="ti ti-info-circle me-1"></i>Ficha del Equipo</h4>
              <table class="table table-sm table-striped">
                <tbody>
                  <tr><th style="width: 130px;">Cliente</th><td>${orden.cliente ? orden.cliente.nombre : 'Cliente General'}</td></tr>
                  <tr><th>Teléfono</th><td>${orden.cliente ? orden.cliente.telefono || 'No registrado' : 'N/A'}</td></tr>
                  <tr><th>Equipo</th><td>${orden.tipoEquipo} ${orden.marca} ${orden.modelo}</td></tr>
                  <tr><th>IMEI/Serie</th><td><strong>${orden.imei || 'N/A'}</strong></td></tr>
                  <tr><th>Sede de Ingreso</th><td>${orden.sede ? orden.sede.nombre : 'Sede Centro'}</td></tr>
                  <tr><th>Fecha Ingreso</th><td>${new Date(orden.createdAt).toLocaleString()}</td></tr>
                </tbody>
              </table>

              <h4 class="text-primary mb-3 mt-4"><i class="ti ti-device-heart me-1"></i>Actualizar Estado</h4>
              <div class="mb-3">
                <label class="form-label">Estado Actual</label>
                <select id="det-estado" class="form-select">
                  <option value="recibido" ${orden.estado === 'recibido' ? 'selected' : ''}>Recibido</option>
                  <option value="diagnostico" ${orden.estado === 'diagnostico' ? 'selected' : ''}>En Diagnóstico</option>
                  <option value="en_reparacion" ${orden.estado === 'en_reparacion' ? 'selected' : ''}>En Reparación</option>
                  <option value="listo" ${orden.estado === 'listo' ? 'selected' : ''}>Listo para entrega</option>
                  <option value="entregado" ${orden.estado === 'entregado' ? 'selected' : ''}>Entregado</option>
                  <option value="cancelado" ${orden.estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>

              <h4 class="text-primary mb-3 mt-4"><i class="ti ti-cash me-1"></i>Finanzas de la Orden</h4>
              <div class="row border p-2 bg-light-lt rounded">
                <div class="col-6 mb-2">
                  <span class="text-secondary small">Costo Mano Obra:</span>
                  <div class="fw-bold">${formatter.format(orden.costoManoObra)}</div>
                </div>
                <div class="col-6 mb-2">
                  <span class="text-secondary small">Costo Repuestos:</span>
                  <div class="fw-bold text-danger">${formatter.format(orden.costoRepuestos)}</div>
                </div>
                <div class="col-12 border-top pt-2">
                  <span class="text-secondary small">Total a Cobrar:</span>
                  <div class="h3 fw-bold text-primary mb-0">${formatter.format(orden.totalCobrado)}</div>
                </div>
              </div>
            </div>

            <!-- Columna Reparación, Repuestos y Galería -->
            <div class="col-md-7">
              <form id="form-update-detalle">
                <div class="mb-3">
                  <label class="form-label required">Problema Reportado</label>
                  <textarea class="form-control form-control-plaintext bg-light px-2" readonly rows="1">${orden.problemaReportado}</textarea>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Técnico Asignado</label>
                    <select id="det-tecnico" class="form-select">
                      <option value="">-- Por asignar --</option>
                      ${tecnicos.map(t => `<option value="${t.id}" ${orden.tecnicoId === t.id ? 'selected' : ''}>${t.nombre}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Días de Garantía</label>
                    <input type="number" id="det-garantia" class="form-control" value="${orden.diasGarantia}">
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Fecha Est. Entrega</label>
                    <input type="date" id="det-fecha-entrega" class="form-control" value="${orden.fechaEstimadaEntrega ? orden.fechaEstimadaEntrega.split('T')[0] : ''}">
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Costo Mano de Obra ($ COP)</label>
                    <input type="number" id="det-mano-obra" class="form-control" value="${orden.costoManoObra}">
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Diagnóstico Técnico</label>
                  <textarea id="det-diagnostico" class="form-control" rows="2" placeholder="Describa el diagnóstico final o avance…" spellcheck="false">${orden.diagnostico || ''}</textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Observaciones</label>
                  <input type="text" id="det-observaciones" class="form-control" value="${orden.observaciones || ''}">
                </div>
                <div class="d-flex justify-content-end mb-3">
                  <button type="submit" class="btn btn-success">
                    <i class="ti ti-check me-1"></i> Guardar Ficha
                  </button>
                </div>
              </form>

              <!-- Repuestos Usados -->
              <h4 class="text-primary mb-3 mt-4 border-top pt-3"><i class="ti ti-components me-1"></i>Repuestos Asignados</h4>
              <div class="table-responsive mb-2">
                <table class="table table-sm table-vcenter">
                  <thead>
                    <tr>
                      <th>Repuesto</th>
                      <th>Cantidad</th>
                      <th>Costo Unit.</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody id="det-repuestos-body">
                    ${orden.repuestos && orden.repuestos.length > 0 ? orden.repuestos.map(r => `
                      <tr>
                        <td>${r.producto ? r.producto.nombre : 'Repuesto'}</td>
                        <td>${r.cantidad}</td>
                        <td>${formatter.format(r.costoUnitario)}</td>
                        <td>${formatter.format(r.costoUnitario * r.cantidad)}</td>
                      </tr>
                    `).join('') : '<tr><td colspan="4" class="text-center py-2 text-secondary">No se han utilizado repuestos en esta orden.</td></tr>'}
                  </tbody>
                </table>
              </div>

              ${isAdminOrGerente || esTecnico ? `
                <form id="form-add-repuesto" class="row g-2 mb-4 border p-2 bg-light rounded">
                  <div class="col-md-7">
                    <div class="position-relative" id="repuesto-dropdown-container">
                      <input type="hidden" id="repuesto-select" value="" required>
                      <input type="text" id="repuesto-search" class="form-control form-control-sm" placeholder="🔍 Seleccionar o buscar repuesto…" autocomplete="off" spellcheck="false">
                      <div id="repuesto-dropdown-menu" class="dropdown-menu w-100 shadow-sm" style="max-height: 200px; overflow-y: auto; display: none; position: absolute; top: 100%; left: 0; z-index: 1050; background: var(--tblr-bg-surface, #fff); border: 1px solid var(--tblr-border-color, #e6e8eb); border-radius: 4px;">
                        <!-- Opciones dinámicas -->
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3">
                    <input type="number" id="repuesto-cantidad" class="form-control form-control-sm" value="1" min="1" required>
                  </div>
                  <div class="col-md-2">
                    <button type="submit" class="btn btn-primary btn-sm w-100">Agregar</button>
                  </div>
                </form>
              ` : ''}

              <!-- Galería de Fotos -->
              <h4 class="text-primary mb-3 mt-4 border-top pt-3"><i class="ti ti-photo me-1"></i>Galería de Evidencias</h4>
              <div class="row row-cards mb-3" id="galeria-fotos">
                ${orden.fotos && orden.fotos.length > 0 ? orden.fotos.map(f => `
                  <div class="col-3">
                    <div class="card card-sm">
                      <a href="${f.url}" target="_blank" class="d-block">
                        <img src="${f.url}" class="card-img-top" style="height: 80px; object-fit: cover;">
                      </a>
                      <div class="card-body p-1 text-center small text-secondary">
                        ${f.momento === 'recepcion' ? 'Recepción' : 'Entrega'}
                      </div>
                    </div>
                  </div>
                `).join('') : '<div class="col-12 text-center text-secondary small py-2">No hay imágenes de prueba en la orden.</div>'}
              </div>

              <form id="form-add-fotos" class="border p-2 bg-light rounded mb-2">
                <div class="row g-2">
                  <div class="col-md-5">
                    <input type="file" id="det-fotos-file" class="form-control form-control-sm" multiple required accept="image/*">
                  </div>
                  <div class="col-md-4">
                    <select id="det-fotos-momento" class="form-select form-select-sm" required>
                      <option value="recepcion">Fotos de Recepción</option>
                      <option value="entrega">Fotos de Entrega</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <button type="submit" class="btn btn-primary btn-sm w-100">Subir Imágenes</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;

      // Event handlers inside details modal
      // 1. Update Estado directly
      document.getElementById('det-estado').addEventListener('change', async (e) => {
        const newStatus = e.target.value;
        if (newStatus === 'entregado') {
          e.target.value = orden.estado;
          modalDetalle.hide();
          openEntregarReparacionModal(id);
          return;
        }
        try {
          await apiFetch(`/reparaciones/${id}/estado`, {
            method: 'PUT',
            body: JSON.stringify({ estado: newStatus })
          });
          await loadData();
          fillKanban(document.getElementById('kanban-search').value);
          // Refrescar modal
          openDetalle(id);
        } catch (err) {
          alert('Error al cambiar de estado: ' + err.message);
        }
      });

      // 2. Submit Ficha update
      document.getElementById('form-update-detalle').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const payload = {
            tecnicoId: document.getElementById('det-tecnico').value || null,
            diasGarantia: document.getElementById('det-garantia').value || 30,
            fechaEstimadaEntrega: document.getElementById('det-fecha-entrega').value || null,
            costoManoObra: document.getElementById('det-mano-obra').value || 0,
            diagnostico: document.getElementById('det-diagnostico').value || '',
            observaciones: document.getElementById('det-observaciones').value || ''
          };

          await apiFetch(`/reparaciones/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          await loadData();
          fillKanban(document.getElementById('kanban-search').value);
          openDetalle(id);
        } catch (err) {
          alert('Error al guardar ficha: ' + err.message);
        }
      });

      // 3. Add Repuesto
      const formRepuesto = document.getElementById('form-add-repuesto');
      if (formRepuesto) {
        formRepuesto.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const payload = {
              productoId: document.getElementById('repuesto-select').value,
              cantidad: document.getElementById('repuesto-cantidad').value
            };

            await apiFetch(`/reparaciones/${id}/repuestos`, {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            await loadData();
            fillKanban(document.getElementById('kanban-search').value);
            openDetalle(id);
          } catch (err) {
            alert('Error al agregar repuesto: ' + err.message);
          }
        });
      }

      // Buscador unificado y dropdown dinámico de repuestos
      const container = document.getElementById('repuesto-dropdown-container');
      const searchInput = document.getElementById('repuesto-search');
      const hiddenInput = document.getElementById('repuesto-select');
      const dropdownMenu = document.getElementById('repuesto-dropdown-menu');

      if (container && searchInput && hiddenInput && dropdownMenu) {
        // Filtrar productos seriales
        const repuestosDisponibles = productos.filter(p => p.tieneNumeroSerie === false).map(p => ({
          id: p.id,
          nombre: p.nombre,
          texto: `${p.nombre} (Costo: ${formatter.format(p.precioCosto)})`
        }));

        // Renderizar opciones en el menú dropdown
        const renderDropdownOptions = (filterText = '') => {
          const query = filterText.toLowerCase().trim();
          const filtered = repuestosDisponibles.filter(item => 
            item.nombre.toLowerCase().includes(query)
          );

          if (filtered.length === 0) {
            dropdownMenu.innerHTML = `<div class="dropdown-item text-secondary disabled py-2 px-3 small">No se encontraron resultados</div>`;
            return;
          }

          dropdownMenu.innerHTML = filtered.map(item => `
            <button type="button" class="dropdown-item py-2 px-3 text-start btn-select-repuesto w-100 border-0 bg-transparent" data-id="${item.id}" data-text="${item.nombre}">
              ${item.texto}
            </button>
          `).join('');

          // Click en una opción
          dropdownMenu.querySelectorAll('.btn-select-repuesto').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              const id = btn.getAttribute('data-id');
              const text = btn.getAttribute('data-text');
              hiddenInput.value = id;
              searchInput.value = text;
              dropdownMenu.style.display = 'none';
            });
          });
        };

        // Mostrar menú al hacer focus o click
        searchInput.addEventListener('focus', () => {
          renderDropdownOptions(searchInput.value);
          dropdownMenu.style.display = 'block';
        });

        // Filtrar al escribir
        searchInput.addEventListener('input', (e) => {
          if (e.target.value.trim() === '') {
            hiddenInput.value = '';
          }
          renderDropdownOptions(e.target.value);
          dropdownMenu.style.display = 'block';
        });

        // Cerrar al hacer click fuera
        document.addEventListener('click', (e) => {
          if (!container.contains(e.target)) {
            dropdownMenu.style.display = 'none';
          }
        });
      }

      // 4. Upload Fotos
      document.getElementById('form-add-fotos').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const files = document.getElementById('det-fotos-file').files;
          const momento = document.getElementById('det-fotos-momento').value;
          if (files.length === 0) return;

          const formData = new FormData();
          formData.append('momento', momento);
          for (let i = 0; i < files.length; i++) {
            formData.append('fotos', files[i]);
          }

          await apiFetch(`/reparaciones/${id}/fotos`, {
            method: 'POST',
            body: formData
          });
          await loadData();
          fillKanban(document.getElementById('kanban-search').value);
          openDetalle(id);
        } catch (err) {
          alert('Error al subir fotos: ' + err.message);
        }
      });

      // 5. Download Recibo PDF
      document.getElementById('det-pdf-btn').addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('token');
          // Descargar directamente abriendo el endpoint en una nueva pestaña (el middleware valida token por query param, o fetch con stream)
          // Usaremos fetch para descargarlo de forma segura con headers
          const response = await fetch(`/api/reparaciones/${id}/orden-pdf`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!response.ok) throw new Error('No se pudo generar el PDF');
          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `orden_${orden.numeroOrden}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (err) {
          alert('Error al descargar recibo: ' + err.message);
        }
      });

      // 6. View QR Code label in a mini window or modal
      document.getElementById('det-qr-btn').addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/reparaciones/${id}/etiqueta-qr`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!response.ok) throw new Error('No se pudo generar el código QR');
          const blob = await response.blob();
          const imgUrl = window.URL.createObjectURL(blob);

          // Crear popup para impresión premium de etiqueta
          const popup = window.open('', '_blank', 'width=350,height=300');
          popup.document.write(`
            <html>
              <head>
                <title>Etiqueta OR #${orden.numeroOrden}</title>
                <style>
                  body { font-family: 'Inter', sans-serif; text-align: center; padding: 10px; margin: 0; }
                  h3 { margin: 5px 0; }
                  p { margin: 2px 0; font-size: 12px; }
                  img { margin: 10px auto; display: block; }
                  button { display: block; margin: 15px auto; padding: 5px 15px; font-weight: bold; cursor: pointer; }
                  @media print { button { display: none; } }
                </style>
              </head>
              <body>
                <h3>TECHSTORE COLOMBIA</h3>
                <p><strong>ORDEN DE REPARACIÓN</strong></p>
                <p>Orden #: <strong>${orden.numeroOrden}</strong></p>
                <p>Cliente: ${orden.cliente ? orden.cliente.nombre : 'Cliente General'}</p>
                <p>Equipo: ${orden.tipoEquipo} ${orden.marca} ${orden.modelo}</p>
                <img src="${imgUrl}" width="120" height="120">
                <button onclick="window.print()">Imprimir Etiqueta</button>
              </body>
            </html>
          `);
          popup.document.close();
        } catch (err) {
          alert('Error al generar etiqueta QR: ' + err.message);
        }
      });

    } catch (err) {
      content.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
    }
  }

  let currentTotalCobrar = 0;

  // Open Entregar/Cobrar Modal
  function openEntregarReparacionModal(orderId) {
    const o = ordenes.find(item => item.id === orderId);
    if (!o) return;

    document.getElementById('entregar-id').value = o.id;
    document.getElementById('entregar-numero').value = o.numeroOrden;
    document.getElementById('entregar-cliente').value = o.cliente ? o.cliente.nombre : 'Cliente General';
    
    currentTotalCobrar = parseFloat(o.totalCobrado || 0);

    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    document.getElementById('entregar-total-txt').textContent = formatter.format(currentTotalCobrar);
    
    // Reset payment inputs
    document.getElementById('entregar-pay-efectivo').value = 0;
    document.getElementById('entregar-pay-nequi').value = 0;
    document.getElementById('entregar-pay-daviplata').value = 0;
    document.getElementById('entregar-pay-tarjeta').value = 0;
    document.getElementById('entregar-pay-transferencia').value = 0;

    calcularTotalesEntrega();

    modalEntregar.show();
  }

  function calcularTotalesEntrega() {
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    
    const efectivo = parseFloat(document.getElementById('entregar-pay-efectivo').value || 0);
    const nequi = parseFloat(document.getElementById('entregar-pay-nequi').value || 0);
    const daviplata = parseFloat(document.getElementById('entregar-pay-daviplata').value || 0);
    const tarjeta = parseFloat(document.getElementById('entregar-pay-tarjeta').value || 0);
    const transferencia = parseFloat(document.getElementById('entregar-pay-transferencia').value || 0);

    const totalIngresado = efectivo + nequi + daviplata + tarjeta + transferencia;
    document.getElementById('entregar-total-ingresado').textContent = formatter.format(totalIngresado);

    const cambioVal = document.getElementById('entregar-cambio');
    const labelCambio = document.getElementById('entregar-label-cambio');
    const submitBtn = document.getElementById('entregar-submit-btn');

    const diferencia = totalIngresado - currentTotalCobrar;

    if (diferencia < 0) {
      labelCambio.textContent = 'Faltante (Pendiente):';
      cambioVal.textContent = formatter.format(Math.abs(diferencia));
      cambioVal.classList.add('text-danger');
      cambioVal.classList.remove('text-success');
      submitBtn.disabled = true;
    } else {
      labelCambio.textContent = 'Cambio (Vuelto):';
      cambioVal.textContent = formatter.format(diferencia);
      cambioVal.classList.add('text-success');
      cambioVal.classList.remove('text-danger');
      submitBtn.disabled = false;
    }
  }

  // Bind change/input events to all payment inputs
  document.querySelectorAll('.input-entregar-pago').forEach(input => {
    input.addEventListener('input', calcularTotalesEntrega);
  });

  // Submit Entregar/Cobrar Form
  document.getElementById('form-entregar-reparacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('entregar-id').value;

    const pagos = {
      efectivo: parseFloat(document.getElementById('entregar-pay-efectivo').value || 0),
      nequi: parseFloat(document.getElementById('entregar-pay-nequi').value || 0),
      daviplata: parseFloat(document.getElementById('entregar-pay-daviplata').value || 0),
      tarjeta: parseFloat(document.getElementById('entregar-pay-tarjeta').value || 0),
      transferencia: parseFloat(document.getElementById('entregar-pay-transferencia').value || 0)
    };

    try {
      const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
      
      await apiFetch(`/reparaciones/${id}/estado`, {
        method: 'PUT',
        body: JSON.stringify({
          estado: 'entregado',
          pagos
        })
      });

      modalEntregar.hide();
      
      // Actualizar local
      const idx = ordenes.findIndex(o => o.id === id);
      if (idx !== -1) {
        ordenes[idx].estado = 'entregado';
      }
      
      await loadData();
      fillKanban(document.getElementById('kanban-search').value);
      showToast('Éxito', 'Reparación cobrada y entregada correctamente.', 'success');
    } catch (err) {
      const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
      showToast('Error', err.message, 'error');
    }
  });

  // Si hay un query param 'buscar' en la URL (por el QR), autocompletar buscador y abrir detalle si corresponde
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const buscarQr = urlParams.get('buscar');
  if (buscarQr) {
    document.getElementById('kanban-search').value = buscarQr;
    fillKanban(buscarQr);
    // Buscar si existe para abrir el detalle
    const match = ordenes.find(o => o.numeroOrden === buscarQr);
    if (match) {
      openDetalle(match.id);
    }
  }
}

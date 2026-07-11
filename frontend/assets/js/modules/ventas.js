import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction } from '../utils/action-buttons.js';
import { showToast } from '../utils/toast.js';
import { renderDevolucionReceipt } from '../utils/pos-receipt.js';

export async function initVentas(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  const canDevolver = ['admin', 'superadmin', 'gerente_sede', 'cajero'].includes(usuario.rol);

  // Evitar modal huérfano / backdrop pegado al reentrar al módulo
  document.getElementById('modal-devolucion-venta')?.remove();
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');

  let ventas = [];
  let vendedores = [];
  let sedes = [];
  let empresaConfig = {};

  async function loadInitialData() {
    try {
      ventas = await apiFetch('/ventas');
      vendedores = await apiFetch('/config/usuarios-operativos').then(users => users.filter(u => ['admin', 'superadmin', 'gerente_sede', 'cajero'].includes(u.rol)));
      sedes = await apiFetch('/config/sedes').catch(() => []);
      empresaConfig = await apiFetch('/config/sistema').catch(() => ({}));
    } catch (e) {
      console.error('Error precargando datos en ventas:', e);
    }
  }

  await loadInitialData();

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Ventas',
        title: 'Historial y comisiones',
        subtitle: 'Transacciones, devoluciones, liquidación de comisiones y reporte de descuentos'
      })}

      <div class="card mb-3 d-print-none">
        <div class="card-header bg-transparent border-bottom">
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
            <li class="nav-item" role="presentation">
              <a href="#tab-reparaciones" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-tools me-1"></i> Historial de Reparaciones
              </a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <div class="tab-pane active show" id="tab-historial" role="tabpanel">
              <div class="erp-list-workspace">
              <div class="card erp-filter-card">
                <div class="card-body">
                  <form id="form-filtros-ventas" class="row g-2 align-items-end">
                    <div class="col-md-3">
                      <label class="form-label">Buscar Venta / Cliente</label>
                      <input type="text" id="filtro-buscar-venta" class="form-control" placeholder="No. Venta o Cliente…" spellcheck="false">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Vendedor</label>
                      <select id="filtro-vendedor-venta" class="form-select">
                        <option value="">-- Todos --</option>
                        ${vendedores.map(v => `<option value="${v.id}">${v.nombre}</option>`).join('')}
                      </select>
                    </div>
                    ${isAdminOrGerente && ['admin', 'superadmin'].includes(usuario.rol) ? `
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
                      <button type="submit" class="btn btn-primary w-100 erp-filter-submit" aria-label="Filtrar historial de ventas"><i class="ti ti-filter me-1"></i>Filtrar</button>
                    </div>
                  </form>
                </div>
              </div>

              <div class="card erp-table-panel">
                <div class="table-responsive">
                  <table class="table table-vcenter card-table table-hover mb-0">
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
                        <th class="text-end">Acciones</th>
                      </tr>
                    </thead>
                    <tbody id="ventas-table-body"></tbody>
                  </table>
                </div>
              </div>
              </div>
            </div>

            <div class="tab-pane" id="tab-comisiones" role="tabpanel">
              <div class="card mb-2 erp-filter-card">
                <div class="card-body">
                  <form id="form-filtros-comisiones" class="row g-2 align-items-end">
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
                </div>
              </div>
              <div class="row row-cards mb-2" id="kpi-comisiones-wrapper"></div>
              <div class="card erp-table-panel">
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
            </div>

            <div class="tab-pane" id="tab-descuentos" role="tabpanel">
              <div class="row mb-3 align-items-center">
                <div class="col">
                  <h3 class="card-title">Auditoría de Modificaciones de Precios</h3>
                  <div class="text-secondary">Registro de artículos vendidos con descuento o por debajo del costo real</div>
                </div>
              </div>
              <div class="card erp-table-panel">
                <div class="table-responsive">
                  <table class="table table-vcenter card-table table-hover">
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
                    <tbody id="descuentos-table-body"></tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="tab-pane" id="tab-reparaciones" role="tabpanel">
              <div class="erp-list-workspace">
              <div class="card erp-filter-card">
                <div class="card-body">
                  <form id="form-filtros-reparaciones" class="row g-2 align-items-end">
                    <div class="col-md-3">
                      <label class="form-label">Buscar Orden / Cliente</label>
                      <input type="text" id="filtro-buscar-reparacion" class="form-control" placeholder="No. Orden o Cliente...">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Estado</label>
                      <select id="filtro-estado-reparacion" class="form-select">
                        <option value="">-- Todos --</option>
                        <option value="recibido">Recibido</option>
                        <option value="diagnostico">Diagnóstico</option>
                        <option value="en_reparacion">En Reparación</option>
                        <option value="listo">Listo para Entrega</option>
                        <option value="entregado">Entregado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </div>
                    ${isAdminOrGerente && ['admin', 'superadmin'].includes(usuario.rol) ? `
                      <div class="col-md-2">
                        <label class="form-label">Sede</label>
                        <select id="filtro-sede-reparacion" class="form-select">
                          <option value="">-- Todas --</option>
                          ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                        </select>
                      </div>
                    ` : '<input type="hidden" id="filtro-sede-reparacion" value="">'}
                    <div class="col-md-2">
                      <label class="form-label">Desde</label>
                      <input type="date" id="filtro-desde-reparacion" class="form-control">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Hasta</label>
                      <input type="date" id="filtro-hasta-reparacion" class="form-control">
                    </div>
                    <div class="col-md-1 d-flex align-items-end">
                      <button type="submit" class="btn btn-primary w-100 erp-filter-submit" aria-label="Filtrar reparaciones facturadas"><i class="ti ti-filter me-1"></i>Filtrar</button>
                    </div>
                  </form>
                </div>
              </div>
              <div class="card erp-table-panel">
                <div class="table-responsive">
                  <table class="table table-vcenter card-table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>No. Orden</th>
                        <th>Fecha Registro</th>
                        <th>Cliente</th>
                        <th>Técnico</th>
                        <th>Sede</th>
                        <th>Estado</th>
                        <th class="text-end">Mano de Obra</th>
                        <th class="text-end">Costo Repuestos</th>
                        <th class="text-end">Total Cobrado</th>
                      </tr>
                    </thead>
                    <tbody id="reparaciones-table-body"></tbody>
                  </table>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="dev-receipt-host" class="pos-receipt-print-host d-none" aria-hidden="true"></div>
    </div>

    <div class="modal modal-blur fade" id="modal-devolucion-venta" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">
          <form id="form-devolucion-venta">
            <div class="modal-header">
              <h5 class="modal-title">Devolución de cliente</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="dev-venta-id">
              <p class="text-secondary small mb-3" id="dev-venta-meta"></p>
              <div class="table-responsive mb-3">
                <table class="table table-vcenter table-sm">
                  <thead>
                    <tr>
                      <th style="width:2.5rem"></th>
                      <th>Producto</th>
                      <th class="text-center">Vendidos</th>
                      <th class="text-center">Ya dev.</th>
                      <th class="text-center" style="width:6rem">Devolver</th>
                    </tr>
                  </thead>
                  <tbody id="dev-items-body"></tbody>
                </table>
              </div>
              <div class="row g-2">
                <div class="col-md-6">
                  <label class="form-label fw-bold">Método de reembolso</label>
                  <select id="dev-metodo" class="form-select" required>
                    <option value="efectivo">Efectivo</option>
                    <option value="nequi">Nequi</option>
                    <option value="daviplata">Daviplata</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="credito">Ajuste a crédito</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold">Motivo</label>
                  <input type="text" id="dev-motivo" class="form-control" placeholder="Ej. Cliente no lo necesita" required maxlength="240">
                </div>
              </div>
              <div class="alert alert-info mt-3 mb-0 py-2 small">
                Requiere caja abierta en la sede de la venta. El stock vuelve al inventario y se registra el reembolso.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-danger">
                <i class="ti ti-arrow-back me-1"></i>Procesar devolución
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const tbodyVentas = document.getElementById('ventas-table-body');
  const tbodyComisiones = document.getElementById('comisiones-table-body');
  const tbodyDescuentos = document.getElementById('descuentos-table-body');
  const tbodyReparaciones = document.getElementById('reparaciones-table-body');
  const kpisComisiones = document.getElementById('kpi-comisiones-wrapper');
  const modalDevEl = document.getElementById('modal-devolucion-venta');
  // Mover al body: evita que el modal quede detrás del blur / fuera de vista
  // (position:fixed se rompe dentro de .erp-module por animación/transform y páginas altas)
  if (modalDevEl && modalDevEl.parentElement !== document.body) {
    document.body.appendChild(modalDevEl);
  }
  const modalDev = modalDevEl
    ? (bootstrap.Modal.getInstance(modalDevEl) || new bootstrap.Modal(modalDevEl))
    : null;
  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  window.activeModuleCleanup = () => {
    try { modalDev?.hide(); } catch (_) { /* ignore */ }
    modalDevEl?.remove();
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  };

  function devolucionBadge(v) {
    if (v.estado === 'anulada') {
      return '<span class="badge badge-status-danger ms-1">Anulada</span>';
    }
    if (v.devolucionEstado === 'total') {
      return '<span class="badge badge-status-warning ms-1">Devuelta</span>';
    }
    if (v.devolucionEstado === 'parcial') {
      return '<span class="badge badge-status-info ms-1">Dev. parcial</span>';
    }
    return '';
  }

  function puedeDevolverVenta(v) {
    if (!canDevolver) return false;
    if (v.estado === 'anulada') return false;
    if (v.devolucionEstado === 'total') return false;
    return (v.items || []).some((i) => (i.cantidad - (parseInt(i.cantidadDevuelta, 10) || 0)) > 0);
  }

  function bindDevolverButtons() {
    tbodyVentas.querySelectorAll('.btn-devolver-venta').forEach((btn) => {
      btn.addEventListener('click', () => {
        const venta = ventas.find((x) => String(x.id) === String(btn.dataset.id));
        if (venta) openDevolucionModal(venta);
      });
    });
  }

  function formatItemsCell(v) {
    if (!v.items?.length) return 'N/A';
    return v.items.map((i) => {
      const ya = parseInt(i.cantidadDevuelta, 10) || 0;
      const nombre = i.producto ? i.producto.nombre : 'Producto';
      if (ya <= 0) return `${nombre} (x${i.cantidad})`;
      if (ya >= i.cantidad) return `${nombre} (x${i.cantidad} · devuelto)`;
      return `${nombre} (x${i.cantidad} · ${ya} dev.)`;
    }).join(', ');
  }

  function renderVentasTable(data) {
    ventas = data;
    if (data.length === 0) {
      tbodyVentas.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">No se encontraron ventas.</td></tr>`;
      return;
    }

    tbodyVentas.innerHTML = data.map((v) => {
      const itemsStr = formatItemsCell(v);
      const pagosStr = v.pagos ? v.pagos.map((p) => p.metodo.toUpperCase()).join('/') : 'Efectivo';
      const actions = puedeDevolverVenta(v)
        ? erpAction('return', { className: 'btn-devolver-venta', attrs: { 'data-id': v.id } })
        : '<span class="text-secondary small">—</span>';
      const rowClass = v.estado === 'anulada'
        ? 'venta-row venta-row--anulada'
        : v.devolucionEstado === 'total'
          ? 'venta-row venta-row--devuelta'
          : v.devolucionEstado === 'parcial'
            ? 'venta-row venta-row--parcial'
            : 'venta-row';
      return `
        <tr class="${rowClass}">
          <td><strong class="text-blue">${v.numeroVenta}</strong>${devolucionBadge(v)}</td>
          <td>${new Date(v.createdAt).toLocaleDateString()}</td>
          <td>${v.cliente ? v.cliente.nombre : 'Consumidor Final'}</td>
          <td>${v.usuario ? v.usuario.nombre : 'Desconocido'}</td>
          <td>${v.sede ? v.sede.nombre : 'N/A'}</td>
          <td class="small text-secondary" style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsStr}">${itemsStr}</td>
          <td>${pagosStr}</td>
          <td class="text-end fw-bold text-primary">${formatter.format(v.total)}</td>
          <td class="text-end">${actions}</td>
        </tr>
      `;
    }).join('');
    bindDevolverButtons();
  }

  function openDevolucionModal(venta) {
    try {
      document.getElementById('dev-venta-id').value = venta.id;
      document.getElementById('dev-venta-meta').textContent =
        `${venta.numeroVenta} · ${venta.cliente?.nombre || 'Consumidor Final'} · ${venta.sede?.nombre || ''}`;
      document.getElementById('dev-motivo').value = '';

      const pagos = venta.pagos || [];
      const metodoSelect = document.getElementById('dev-metodo');
      if (venta.esCredito || venta.estado === 'credito') {
        metodoSelect.value = 'credito';
      } else if (pagos.length === 1 && [...metodoSelect.options].some((o) => o.value === pagos[0].metodo)) {
        metodoSelect.value = pagos[0].metodo;
      } else {
        metodoSelect.value = 'efectivo';
      }

      const tbody = document.getElementById('dev-items-body');
      tbody.innerHTML = (venta.items || []).map((item) => {
        const ya = parseInt(item.cantidadDevuelta, 10) || 0;
        const max = item.cantidad - ya;
        if (max <= 0) {
          return `
            <tr class="text-secondary">
              <td></td>
              <td>${item.producto?.nombre || 'Producto'}</td>
              <td class="text-center">${item.cantidad}</td>
              <td class="text-center">${ya}</td>
              <td class="text-center small">Completo</td>
            </tr>
          `;
        }
        return `
          <tr>
            <td>
              <input type="checkbox" class="form-check-input dev-item-check" data-id="${item.id}" data-max="${max}" checked>
            </td>
            <td>${item.producto?.nombre || 'Producto'}</td>
            <td class="text-center">${item.cantidad}</td>
            <td class="text-center">${ya}</td>
            <td>
              <input type="number" class="form-control form-control-sm text-center dev-item-qty" data-id="${item.id}" min="1" max="${max}" value="${max}">
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.dev-item-check').forEach((chk) => {
        chk.addEventListener('change', () => {
          const qty = tbody.querySelector(`.dev-item-qty[data-id="${chk.dataset.id}"]`);
          if (qty) qty.disabled = !chk.checked;
        });
      });

      if (!modalDev) {
        showToast('Error', 'No se pudo abrir el formulario de devolución.', 'error');
        return;
      }
      modalDev.show();
    } catch (err) {
      console.error('Error abriendo devolución:', err);
      cleanupModalBackdrop();
      showToast('Error', err.message || 'No se pudo abrir la devolución.', 'error');
    }
  }

  function printDevolucion(dev) {
    const items = (dev.items || []).map((i) => ({
      cantidad: i.cantidad,
      nombre: i.producto?.nombre || 'Producto',
      montoLinea: i.montoLinea
    }));
    const html = renderDevolucionReceipt({
      empresaConfig,
      sedeNombre: dev.venta?.sede?.nombre || '',
      cajeroNombre: dev.usuario?.nombre || usuario.nombre,
      clienteNombre: dev.venta?.cliente?.nombre || '',
      numeroDevolucion: dev.numero,
      numeroVenta: dev.venta?.numeroVenta || '',
      fecha: dev.createdAt || new Date(),
      items,
      total: dev.total,
      metodoReembolso: dev.metodoReembolso,
      motivo: dev.motivo
    });
    const popup = window.open('', '_blank', 'width=360,height=640');
    if (!popup) {
      showToast('Aviso', 'Permite ventanas emergentes para imprimir el comprobante.', 'warning');
      return;
    }
    popup.document.write(`<!doctype html><html><head><title>${dev.numero || 'Devolución'}</title>
      <link rel="stylesheet" href="/assets/css/custom.css">
      <style>
        body { margin: 0; padding: 12px; background: #fff; }
        .pos-receipt { margin: 0 auto; }
        @media print { button { display: none !important; } }
      </style>
    </head><body>
      ${html}
      <p style="text-align:center;margin-top:12px">
        <button type="button" onclick="window.print()" style="padding:8px 16px;font-weight:600;cursor:pointer">Imprimir</button>
      </p>
    </body></html>`);
    popup.document.close();
  }

  function cleanupModalBackdrop() {
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  }

  function hideDevolucionModal() {
    return new Promise((resolve) => {
      if (!modalDev || !modalDevEl?.classList.contains('show')) {
        cleanupModalBackdrop();
        resolve();
        return;
      }

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cleanupModalBackdrop();
        resolve();
      };

      modalDevEl.addEventListener('hidden.bs.modal', finish, { once: true });
      modalDev.hide();
      setTimeout(finish, 350);
    });
  }

  async function loadVentasFiltradas() {
    tbodyVentas.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    try {
      const buscar = document.getElementById('filtro-buscar-venta').value;
      const usuarioFiltro = document.getElementById('filtro-vendedor-venta').value;
      const sede = document.getElementById('filtro-sede-venta').value;
      const desde = document.getElementById('filtro-desde-venta').value;
      const hasta = document.getElementById('filtro-hasta-venta').value;

      const params = [];
      if (buscar) params.push(`buscar=${encodeURIComponent(buscar)}`);
      if (usuarioFiltro) params.push(`usuario=${usuarioFiltro}`);
      if (sede) params.push(`sede=${sede}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);

      const query = params.length > 0 ? `?${params.join('&')}` : '';
      renderVentasTable(await apiFetch(`/ventas${query}`));
    } catch (err) {
      tbodyVentas.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  }

  document.getElementById('form-devolucion-venta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ventaId = document.getElementById('dev-venta-id').value;
    const motivo = document.getElementById('dev-motivo').value.trim();
    const metodoReembolso = document.getElementById('dev-metodo').value;
    const items = [];
    document.querySelectorAll('#dev-items-body .dev-item-check:checked').forEach((chk) => {
      const qtyEl = document.querySelector(`.dev-item-qty[data-id="${chk.dataset.id}"]`);
      const cantidad = parseInt(qtyEl?.value, 10);
      if (cantidad > 0) items.push({ itemVentaId: chk.dataset.id, cantidad });
    });

    if (!items.length) {
      showToast('Aviso', 'Seleccione al menos un producto a devolver.', 'warning');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await apiFetch(`/ventas/${ventaId}/devolucion`, {
        method: 'POST',
        body: JSON.stringify({ items, motivo, metodoReembolso })
      });
      await hideDevolucionModal();
      showToast('Éxito', res.message || 'Devolución registrada.', 'success');
      await loadVentasFiltradas();
      if (res.devolucion) printDevolucion(res.devolucion);
    } catch (err) {
      showToast('Error', err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  renderVentasTable(ventas);

  document.getElementById('form-filtros-ventas').addEventListener('submit', async (e) => {
    e.preventDefault();
    await loadVentasFiltradas();
  });

  document.getElementById('form-filtros-comisiones').addEventListener('submit', async (e) => {
    e.preventDefault();
    tbodyComisiones.innerHTML = `<tr><td colspan="5" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    kpisComisiones.innerHTML = '';
    try {
      const usuarioFiltro = document.getElementById('filtro-vendedor-comision').value;
      const desde = document.getElementById('filtro-desde-comision').value;
      const hasta = document.getElementById('filtro-hasta-comision').value;
      const params = [];
      if (usuarioFiltro) params.push(`usuario=${usuarioFiltro}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      const data = await apiFetch(`/ventas/comisiones${params.length ? `?${params.join('&')}` : ''}`);

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

      tbodyComisiones.innerHTML = data.comisiones.map((c) => `
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

  async function loadDescuentos() {
    tbodyDescuentos.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    try {
      const data = await apiFetch('/ventas/descuentos');
      if (data.length === 0) {
        tbodyDescuentos.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-secondary">No se registran transacciones con Price Override (descuentos).</td></tr>`;
        return;
      }
      tbodyDescuentos.innerHTML = data.map((item) => {
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

  const tabEl = document.querySelector('a[href="#tab-descuentos"]');
  if (tabEl) tabEl.addEventListener('shown.bs.tab', () => loadDescuentos());

  function renderReparacionesTable(data) {
    if (data.length === 0) {
      tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">No se encontraron órdenes de reparación.</td></tr>`;
      return;
    }
    const badgeClasses = {
      recibido: 'bg-secondary text-white',
      diagnostico: 'bg-warning text-dark',
      en_reparacion: 'bg-info text-white',
      listo: 'bg-primary text-white',
      entregado: 'bg-success text-white',
      cancelado: 'bg-danger text-white'
    };
    tbodyReparaciones.innerHTML = data.map((o) => `
      <tr>
        <td><strong class="text-blue">${o.numeroOrden}</strong></td>
        <td>${new Date(o.createdAt).toLocaleDateString()}</td>
        <td>${o.cliente ? o.cliente.nombre : 'Cliente General'}</td>
        <td>${o.tecnico ? o.tecnico.nombre : 'Sin Técnico'}</td>
        <td>${o.sede ? o.sede.nombre : 'N/A'}</td>
        <td><span class="badge ${badgeClasses[o.estado] || 'bg-secondary text-white'}">${o.estado.toUpperCase()}</span></td>
        <td class="text-end text-secondary">${formatter.format(parseFloat(o.costoManoObra || 0))}</td>
        <td class="text-end text-danger">${formatter.format(parseFloat(o.costoRepuestos || 0))}</td>
        <td class="text-end fw-bold text-primary">${formatter.format(parseFloat(o.totalCobrado || 0))}</td>
      </tr>
    `).join('');
  }

  async function loadReparaciones() {
    tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    try {
      const buscar = document.getElementById('filtro-buscar-reparacion').value;
      const estado = document.getElementById('filtro-estado-reparacion').value;
      const sede = document.getElementById('filtro-sede-reparacion').value;
      const desde = document.getElementById('filtro-desde-reparacion').value;
      const hasta = document.getElementById('filtro-hasta-reparacion').value;
      const params = [];
      if (buscar) params.push(`buscar=${buscar}`);
      if (estado) params.push(`estado=${estado}`);
      if (sede) params.push(`sede=${sede}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      renderReparacionesTable(await apiFetch(`/reparaciones${params.length ? `?${params.join('&')}` : ''}`));
    } catch (err) {
      tbodyReparaciones.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  }

  document.getElementById('form-filtros-reparaciones').addEventListener('submit', (e) => {
    e.preventDefault();
    loadReparaciones();
  });

  const tabReparacionesEl = document.querySelector('a[href="#tab-reparaciones"]');
  if (tabReparacionesEl) {
    tabReparacionesEl.addEventListener('shown.bs.tab', () => loadReparaciones());
  }
}

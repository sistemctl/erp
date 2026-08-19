import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';
import { showToast } from '../utils/toast.js';
import { labelUnidadMedida } from '../utils/unidad-medida.js';

const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const ESTADO_LABEL = {
  borrador: 'Borrador',
  en_proceso: 'En proceso',
  entregada: 'Entregada',
  cancelada: 'Cancelada'
};

const ESTADO_BADGE = {
  borrador: 'bg-secondary-lt',
  en_proceso: 'bg-azure-lt',
  entregada: 'bg-success-lt',
  cancelada: 'bg-danger-lt'
};

let instalacionesKeydownHandler = null;

export async function initInstalaciones(container) {
  const usuario = getUsuario();
  const canWrite = ['admin', 'superadmin', 'gerente_sede', 'tecnico'].includes(usuario.rol);
  const canReopen = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  const needsSedePicker = !usuario.sedeId || ['admin', 'superadmin'].includes(usuario.rol);

  let ordenes = [];
  let clientes = [];
  let tecnicos = [];
  let productos = [];
  let sedes = [];
  let filtroEstado = '';
  let filtroBuscar = '';

  async function loadData() {
    ordenes = await apiFetch('/instalaciones').catch(() => []);
    clientes = await apiFetch('/clientes').catch(() => []);
    tecnicos = await apiFetch('/config/usuarios-operativos?rol=tecnico').catch(() => []);
    productos = (await apiFetch('/productos').catch(() => [])).filter((p) => p.activo !== false && !p.esServicio);
    if (needsSedePicker) {
      sedes = await apiFetch('/config/sedes').catch(() => []);
    }
  }

  await loadData();

  ['modal-nueva-instalacion', 'modal-detalle-instalacion', 'modal-cobro-instalacion', 'modal-inst-producto'].forEach((id) => {
    document.getElementById(id)?.remove();
  });
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');

  const defaultSedeId = usuario.sedeId || (sedes[0]?.id || '');

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Campo',
        title: 'Instalaciones',
        subtitle: 'Materiales del inventario + mano de obra en sitio',
        actionsHtml: canWrite ? `
          <button type="button" id="btn-nueva-instalacion" class="btn btn-primary">
            <i class="ti ti-plus me-2"></i> Nueva instalación
          </button>
        ` : ''
      })}

      <div class="card mb-3">
        <div class="card-body py-3">
          <div class="row g-2 align-items-end">
            <div class="col-md-5">
              <label class="form-label">Buscar</label>
              <input type="search" id="inst-buscar" class="form-control" placeholder="Orden, sitio o cliente…" autocomplete="off">
            </div>
            <div class="col-md-3">
              <label class="form-label">Estado</label>
              <select id="inst-filtro-estado" class="form-select">
                <option value="">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="en_proceso">En proceso</option>
                <option value="entregada">Entregada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div class="col-md-2">
              <button type="button" id="inst-btn-filtrar" class="btn btn-outline-primary w-100">Filtrar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover mb-0">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Sitio</th>
                <th>Sede</th>
                <th>Estado</th>
                <th class="text-end">Total</th>
                <th class="w-1"></th>
              </tr>
            </thead>
            <tbody id="inst-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-nueva-instalacion" tabindex="-1" aria-hidden="true" data-inst-ui="3.0.11">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">
          <form id="form-nueva-instalacion" class="inst-form">
            <header class="inst-modal__header">
              <div class="inst-modal__heading">
                <p class="inst-modal__eyebrow">Orden de campo</p>
                <h5 class="modal-title inst-modal__title">Nueva instalación</h5>
                <p class="inst-modal__lede">Cliente, sitio y alcance del trabajo en un solo paso.</p>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </header>
            <div class="modal-body inst-modal__body">
              <section class="inst-section" aria-labelledby="inst-sec-quien">
                <header class="inst-section__head">
                  <span class="inst-section__mark" aria-hidden="true">01</span>
                  <div>
                    <h4 id="inst-sec-quien" class="inst-section__title">Quién y cuándo</h4>
                    <p class="inst-section__hint">Cliente, sede, técnico y fecha de visita.</p>
                  </div>
                </header>
                <div class="inst-field-grid">
                  <div class="inst-field">
                    <label class="form-label required" for="inst-cliente">Cliente</label>
                    <select id="inst-cliente" class="form-select" required>
                      <option value="">Seleccionar cliente</option>
                      ${clientes.map((c) => `<option value="${c.id}">${c.nombre}${c.documento ? ` (${c.documento})` : ''}</option>`).join('')}
                    </select>
                  </div>
                  ${needsSedePicker ? `
                  <div class="inst-field">
                    <label class="form-label required" for="inst-sede">Sede</label>
                    <select id="inst-sede" class="form-select" required>
                      ${sedes.map((s) => `<option value="${s.id}" ${s.id === defaultSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                    </select>
                  </div>` : ''}
                  <div class="inst-field">
                    <label class="form-label" for="inst-tecnico">Técnico</label>
                    <select id="inst-tecnico" class="form-select">
                      <option value="">Por asignar</option>
                      ${tecnicos.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join('')}
                    </select>
                  </div>
                  <div class="inst-field">
                    <label class="form-label" for="inst-fecha">Fecha programada</label>
                    <input type="date" id="inst-fecha" class="form-control">
                  </div>
                </div>
              </section>

              <section class="inst-section" aria-labelledby="inst-sec-sitio">
                <header class="inst-section__head">
                  <span class="inst-section__mark" aria-hidden="true">02</span>
                  <div>
                    <h4 id="inst-sec-sitio" class="inst-section__title">Sitio</h4>
                    <p class="inst-section__hint">Dónde se hace la instalación.</p>
                  </div>
                </header>
                <div class="inst-field-grid">
                  <div class="inst-field">
                    <label class="form-label" for="inst-sitio">Sitio / proyecto</label>
                    <input type="text" id="inst-sitio" class="form-control" placeholder="Casa del cliente, local, oficina…" autocomplete="off">
                  </div>
                  <div class="inst-field inst-field--full">
                    <label class="form-label" for="inst-direccion">Dirección</label>
                    <input type="text" id="inst-direccion" class="form-control" placeholder="Calle, barrio, referencias" autocomplete="street-address">
                  </div>
                </div>
              </section>

              <section class="inst-section" aria-labelledby="inst-sec-trabajo">
                <header class="inst-section__head">
                  <span class="inst-section__mark" aria-hidden="true">03</span>
                  <div>
                    <h4 id="inst-sec-trabajo" class="inst-section__title">Trabajo</h4>
                    <p class="inst-section__hint">Qué se instala y cuánto cuesta la mano de obra.</p>
                  </div>
                </header>
                <div class="inst-field">
                  <label class="form-label" for="inst-descripcion">Descripción del trabajo</label>
                  <textarea id="inst-descripcion" class="form-control" rows="3" placeholder="Ej: Instalación 5 cámaras + NVR, cableado y configuración" spellcheck="false"></textarea>
                </div>
                <div class="inst-field-grid">
                  <div class="inst-field">
                    <label class="form-label" for="inst-valor-servicio">Valor servicio (COP)</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" id="inst-valor-servicio" class="form-control" min="0" step="1000" value="0" placeholder="0">
                    </div>
                  </div>
                  <div class="inst-field">
                    <label class="form-label" for="inst-obs">Observaciones</label>
                    <input type="text" id="inst-obs" class="form-control" placeholder="Acceso, horarios, contactos en sitio…">
                  </div>
                </div>
                <div class="form-check mt-2">
                  <input class="form-check-input" type="checkbox" id="inst-precio-cerrado">
                  <label class="form-check-label" for="inst-precio-cerrado">
                    Todo incluido — el valor del servicio ya incluye materiales (no se suman al total)
                  </label>
                </div>
              </section>
            </div>
            <footer class="inst-modal__footer">
              <button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary">
                <i class="ti ti-clipboard-check me-1" aria-hidden="true"></i>Crear orden
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-detalle-instalacion" tabindex="-1" aria-hidden="true" data-inst-ui="3.0.12">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable inst-detalle-dialog" role="document">
        <div class="modal-content inst-detalle" id="detalle-instalacion-content"></div>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-cobro-instalacion" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document">
        <div class="modal-content shadow-lg">
          <input type="hidden" id="inst-cobro-id">
          <div class="modal-header">
            <div>
              <h5 class="modal-title fw-bold mb-0">Entregar instalación</h5>
              <div class="text-secondary small" id="inst-cobro-subtitulo"></div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info py-3 mb-3">
              <div class="text-secondary small mb-1">Total a cobrar</div>
              <div class="display-6 fw-bold text-primary mb-0" id="inst-cobro-total">$ 0</div>
              <div class="small text-secondary mt-1" id="inst-cobro-detalle-montos"></div>
            </div>

            <div id="inst-cobro-paso-modo">
              <p class="text-secondary mb-3">¿Cómo se cobra esta entrega?</p>
              <div class="d-grid gap-2">
                <button type="button" class="btn btn-success btn-lg" id="inst-cobro-btn-contado">
                  <i class="ti ti-cash me-2"></i> Cobré en sitio
                </button>
                <button type="button" class="btn btn-outline-primary btn-lg" id="inst-cobro-btn-fiado">
                  <i class="ti ti-credit-card me-2"></i> Queda debiendo (fiado)
                </button>
              </div>
            </div>

            <div id="inst-cobro-paso-contado" class="d-none">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="mb-0">Desglose de pago</h4>
                <button type="button" class="btn btn-sm btn-outline-success" id="inst-cobro-todo-efectivo">
                  Todo en efectivo
                </button>
              </div>
              <div class="row g-2">
                <div class="col-6">
                  <label class="form-label small mb-1">Efectivo</label>
                  <input type="number" id="inst-pay-efectivo" class="form-control form-control-sm input-inst-pago" min="0" value="0">
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Nequi</label>
                  <input type="number" id="inst-pay-nequi" class="form-control form-control-sm input-inst-pago" min="0" value="0">
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Daviplata</label>
                  <input type="number" id="inst-pay-daviplata" class="form-control form-control-sm input-inst-pago" min="0" value="0">
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Tarjeta</label>
                  <input type="number" id="inst-pay-tarjeta" class="form-control form-control-sm input-inst-pago" min="0" value="0">
                </div>
                <div class="col-12">
                  <label class="form-label small mb-1">Transferencia</label>
                  <input type="number" id="inst-pay-transferencia" class="form-control form-control-sm input-inst-pago" min="0" value="0">
                </div>
              </div>
              <div class="alert alert-secondary mt-3 mb-0 py-2">
                <div class="row align-items-center">
                  <div class="col">
                    <div class="text-secondary small">Total ingresado</div>
                    <div class="h4 mb-0" id="inst-cobro-ingresado">$ 0</div>
                  </div>
                  <div class="col-auto text-end">
                    <div class="text-secondary small" id="inst-cobro-label-diff">Faltante</div>
                    <div class="h4 mb-0 text-danger" id="inst-cobro-diff">$ 0</div>
                  </div>
                </div>
              </div>
              <p class="form-hint mt-2 mb-0">Si no hay caja abierta en la sede, abre caja o vuelve y usa Queda debiendo.</p>
            </div>

            <div id="inst-cobro-paso-fiado" class="d-none">
              <div class="alert alert-warning mb-0">
                Se creará una factura pendiente y quedará en <strong>Cartera</strong> a nombre de
                <strong id="inst-cobro-cliente-fiado">el cliente</strong>. El cobro se registra después con un abono.
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-ghost-secondary d-none" id="inst-cobro-btn-atras">Atrás</button>
            <button type="button" class="btn btn-success ms-auto d-none" id="inst-cobro-btn-confirmar-contado" disabled>
              <i class="ti ti-check me-1"></i> Cobrar y entregar
            </button>
            <button type="button" class="btn btn-primary ms-auto d-none" id="inst-cobro-btn-confirmar-fiado">
              <i class="ti ti-check me-1"></i> Entregar a fiado
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-inst-producto" tabindex="-1" role="dialog" aria-labelledby="modal-inst-producto-title" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
        <div class="modal-content oc-product-modal">
          <div class="modal-header oc-product-modal__header">
            <div>
              <h5 class="modal-title" id="modal-inst-producto-title">Buscar producto</h5>
              <p class="oc-product-modal__lede mb-0">Elija un material del catálogo. Solo productos físicos (no servicios).</p>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body oc-product-modal__body p-0">
            <aside class="oc-product-modal__cats" aria-label="Categorías">
              <p class="oc-product-modal__rail-label">Categorías</p>
              <div id="inst-producto-chips" class="oc-product-modal__cat-list" role="list"></div>
            </aside>
            <div class="oc-product-modal__main">
              <div class="oc-product-modal__search input-group">
                <span class="input-group-text"><i class="ti ti-search" aria-hidden="true"></i></span>
                <input
                  type="search"
                  id="inst-producto-search"
                  class="form-control"
                  placeholder="Nombre o código…"
                  autocomplete="off"
                  spellcheck="false"
                >
              </div>
              <div id="inst-producto-list" class="oc-product-modal__list" role="listbox"></div>
            </div>
            <aside class="oc-product-modal__added" aria-label="Selección">
              <div class="oc-product-modal__ticket-head">
                <p class="oc-product-modal__rail-label mb-0">Selección</p>
                <span class="oc-product-modal__ticket-hint" id="inst-modal-ticket-hint">Ninguno</span>
              </div>
              <div class="oc-product-modal__compose" id="inst-modal-compose" hidden>
                <div class="oc-product-modal__compose-head">
                  <div class="oc-product-modal__compose-name">
                    <span class="oc-product-modal__compose-label">Producto</span>
                    <strong id="inst-modal-prod-name">—</strong>
                  </div>
                  <button type="button" class="btn btn-ghost-secondary btn-icon btn-sm oc-product-modal__compose-cancel" id="inst-modal-compose-cancel" aria-label="Cancelar selección" title="Cancelar">
                    <i class="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>
                <div class="oc-product-modal__compose-fields">
                  <div class="oc-field oc-field--cost">
                    <label class="form-label" for="inst-modal-precio">P. venta</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="text" id="inst-modal-precio" class="form-control" readonly tabindex="-1">
                    </div>
                  </div>
                  <div class="oc-field oc-field--qty">
                    <label class="form-label" for="inst-modal-cant">Cant. <span id="inst-modal-ud" class="text-secondary fw-normal"></span></label>
                    <input type="number" id="inst-modal-cant" class="form-control" value="1" min="1" inputmode="numeric">
                  </div>
                  <div class="oc-field oc-field--action">
                    <button type="button" id="inst-modal-usar" class="btn btn-primary">
                      <i class="ti ti-check" aria-hidden="true"></i>
                      <span>Usar</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="oc-product-modal__added-empty mt-3" id="inst-modal-hint-box">
                <span class="oc-product-modal__added-empty-title">Busque y elija</span>
                <span class="oc-product-modal__added-empty-hint">Al pulsar Usar, el producto queda listo en el formulario para agregar a la orden.</span>
              </div>
            </aside>
          </div>
          <div class="modal-footer oc-product-modal__footer">
            <div class="oc-product-modal__cart-summary" id="inst-modal-summary" aria-live="polite">
              Materiales físicos · descuentan stock
            </div>
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal" id="inst-modal-listo">Listo</button>
          </div>
        </div>
      </div>
    </div>
  `;

  ['modal-nueva-instalacion', 'modal-detalle-instalacion', 'modal-cobro-instalacion', 'modal-inst-producto'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  });

  const modalNueva = new bootstrap.Modal(document.getElementById('modal-nueva-instalacion'));
  const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle-instalacion'));
  const modalCobro = new bootstrap.Modal(document.getElementById('modal-cobro-instalacion'));
  const modalProdEl = document.getElementById('modal-inst-producto');
  const modalProd = modalProdEl ? bootstrap.Modal.getOrCreateInstance(modalProdEl) : null;

  let cobroTotalActual = 0;
  let cobroOrdenActual = null;

  function setCobroPaso(paso) {
    const modo = document.getElementById('inst-cobro-paso-modo');
    const contado = document.getElementById('inst-cobro-paso-contado');
    const fiado = document.getElementById('inst-cobro-paso-fiado');
    const btnAtras = document.getElementById('inst-cobro-btn-atras');
    const btnContado = document.getElementById('inst-cobro-btn-confirmar-contado');
    const btnFiado = document.getElementById('inst-cobro-btn-confirmar-fiado');

    modo.classList.toggle('d-none', paso !== 'modo');
    contado.classList.toggle('d-none', paso !== 'contado');
    fiado.classList.toggle('d-none', paso !== 'fiado');
    btnAtras.classList.toggle('d-none', paso === 'modo');
    btnContado.classList.toggle('d-none', paso !== 'contado');
    btnFiado.classList.toggle('d-none', paso !== 'fiado');
  }

  function calcularTotalesCobroInst() {
    const efectivo = parseFloat(document.getElementById('inst-pay-efectivo').value || 0);
    const nequi = parseFloat(document.getElementById('inst-pay-nequi').value || 0);
    const daviplata = parseFloat(document.getElementById('inst-pay-daviplata').value || 0);
    const tarjeta = parseFloat(document.getElementById('inst-pay-tarjeta').value || 0);
    const transferencia = parseFloat(document.getElementById('inst-pay-transferencia').value || 0);
    const ingresado = efectivo + nequi + daviplata + tarjeta + transferencia;
    const diff = ingresado - cobroTotalActual;

    document.getElementById('inst-cobro-ingresado').textContent = fmt.format(ingresado);
    const label = document.getElementById('inst-cobro-label-diff');
    const diffEl = document.getElementById('inst-cobro-diff');
    const btn = document.getElementById('inst-cobro-btn-confirmar-contado');

    if (diff < 0) {
      label.textContent = 'Faltante';
      diffEl.textContent = fmt.format(Math.abs(diff));
      diffEl.classList.add('text-danger');
      diffEl.classList.remove('text-success');
      btn.disabled = true;
    } else {
      label.textContent = 'Cambio (vuelto)';
      diffEl.textContent = fmt.format(diff);
      diffEl.classList.add('text-success');
      diffEl.classList.remove('text-danger');
      btn.disabled = false;
    }
  }

  function openCobroInstalacion(orden) {
    cobroOrdenActual = orden;
    cobroTotalActual = parseFloat(orden.totalCobrado) || 0;
    document.getElementById('inst-cobro-id').value = orden.id;
    document.getElementById('inst-cobro-subtitulo').textContent =
      `${orden.numeroOrden} · ${orden.cliente?.nombre || 'Cliente'} · ${orden.sede?.nombre || ''}`;
    document.getElementById('inst-cobro-total').textContent = fmt.format(cobroTotalActual);
    const svc = parseFloat(orden.valorServicio) || 0;
    const matsCosto = parseFloat(orden.costoMateriales) || 0;
    const matsVenta = (orden.materiales || []).reduce(
      (sum, m) => sum + (parseFloat(m.precioUnitario) || 0) * (parseInt(m.cantidad, 10) || 0),
      0
    );
    document.getElementById('inst-cobro-detalle-montos').textContent = orden.precioCerrado
      ? `Todo incluido · servicio ${fmt.format(svc)} · materiales (costo) ${fmt.format(matsCosto)}`
      : `Servicio ${fmt.format(svc)} + materiales ${fmt.format(matsVenta)}`;
    document.getElementById('inst-cobro-cliente-fiado').textContent = orden.cliente?.nombre || 'el cliente';

    ['inst-pay-efectivo', 'inst-pay-nequi', 'inst-pay-daviplata', 'inst-pay-tarjeta', 'inst-pay-transferencia']
      .forEach((id) => { document.getElementById(id).value = 0; });
    setCobroPaso('modo');
    calcularTotalesCobroInst();
    modalDetalle.hide();
    modalCobro.show();
  }

  async function cerrarInstalacionConCobro(payload) {
    const id = document.getElementById('inst-cobro-id').value;
    const btnContado = document.getElementById('inst-cobro-btn-confirmar-contado');
    const btnFiado = document.getElementById('inst-cobro-btn-confirmar-fiado');
    btnContado.disabled = true;
    btnFiado.disabled = true;
    try {
      await apiFetch(`/instalaciones/${id}/cerrar`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      modalCobro.hide();
      if (payload.modoCobro === 'fiado') {
        showToast('Éxito', 'Entregado a fiado — queda en Cartera.', 'success');
      } else if (payload.modoCobro === 'contado') {
        showToast('Éxito', 'Cobrado y entregado.', 'success');
      } else {
        showToast('Éxito', 'Instalación entregada.', 'success');
      }
      await loadData();
      renderTabla();
      await abrirDetalle(id);
    } catch (err) {
      showToast('Error', err.message, 'error');
    } finally {
      calcularTotalesCobroInst();
      btnFiado.disabled = false;
    }
  }

  document.getElementById('inst-cobro-btn-contado')?.addEventListener('click', () => {
    setCobroPaso('contado');
    calcularTotalesCobroInst();
  });
  document.getElementById('inst-cobro-btn-fiado')?.addEventListener('click', () => setCobroPaso('fiado'));
  document.getElementById('inst-cobro-btn-atras')?.addEventListener('click', () => setCobroPaso('modo'));
  document.getElementById('inst-cobro-todo-efectivo')?.addEventListener('click', () => {
    document.getElementById('inst-pay-efectivo').value = cobroTotalActual;
    ['inst-pay-nequi', 'inst-pay-daviplata', 'inst-pay-tarjeta', 'inst-pay-transferencia']
      .forEach((id) => { document.getElementById(id).value = 0; });
    calcularTotalesCobroInst();
  });
  document.querySelectorAll('.input-inst-pago').forEach((input) => {
    input.addEventListener('input', calcularTotalesCobroInst);
  });
  document.getElementById('inst-cobro-btn-confirmar-contado')?.addEventListener('click', async () => {
    await cerrarInstalacionConCobro({
      modoCobro: 'contado',
      pagos: {
        efectivo: parseFloat(document.getElementById('inst-pay-efectivo').value || 0),
        nequi: parseFloat(document.getElementById('inst-pay-nequi').value || 0),
        daviplata: parseFloat(document.getElementById('inst-pay-daviplata').value || 0),
        tarjeta: parseFloat(document.getElementById('inst-pay-tarjeta').value || 0),
        transferencia: parseFloat(document.getElementById('inst-pay-transferencia').value || 0)
      }
    });
  });
  document.getElementById('inst-cobro-btn-confirmar-fiado')?.addEventListener('click', async () => {
    await cerrarInstalacionConCobro({ modoCobro: 'fiado' });
  });

  function ordenesFiltradas() {
    return ordenes.filter((o) => {
      if (filtroEstado && o.estado !== filtroEstado) return false;
      if (!filtroBuscar) return true;
      const q = filtroBuscar.toLowerCase();
      return (
        (o.numeroOrden || '').toLowerCase().includes(q) ||
        (o.sitio || '').toLowerCase().includes(q) ||
        (o.cliente?.nombre || '').toLowerCase().includes(q)
      );
    });
  }

  function renderTabla() {
    const body = document.getElementById('inst-table-body');
    const list = ordenesFiltradas();
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="7" class="text-center text-secondary py-4">No hay órdenes de instalación.</td></tr>`;
      return;
    }
    body.innerHTML = list.map((o) => `
      <tr>
        <td><span class="fw-bold">${o.numeroOrden}</span></td>
        <td>${o.cliente?.nombre || '—'}</td>
        <td>${o.sitio || '—'}</td>
        <td>${o.sede?.nombre || '—'}</td>
        <td><span class="badge ${ESTADO_BADGE[o.estado] || 'bg-secondary-lt'}">${ESTADO_LABEL[o.estado] || o.estado}</span></td>
        <td class="text-end">${fmt.format(parseFloat(o.totalCobrado) || 0)}</td>
        <td>
          <button type="button" class="btn btn-sm btn-ghost-primary btn-ver-inst" data-id="${o.id}">
            Abrir
          </button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('.btn-ver-inst').forEach((btn) => {
      btn.addEventListener('click', () => abrirDetalle(btn.dataset.id));
    });
  }

  let pickerMatches = [];
  let pickerActiveIdx = -1;
  let pickerCategoriaId = '';
  let modalSelectedProd = null;

  function escapeInstHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeInstSearch(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function productoCategoriaNombre(prod) {
    return prod?.categoria?.nombre || prod?.categoriaNombre || '';
  }

  function productoCategoriaId(prod) {
    return String(prod?.categoriaId || prod?.categoria?.id || '');
  }

  function categoriaChipLabel(nombre) {
    const raw = String(nombre || '').trim();
    if (!raw) return '';
    const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : raw;
  }

  function productoSearchHaystack(prod) {
    return normalizeInstSearch(`${prod?.nombre || ''} ${prod?.codigoBarras || ''} ${productoCategoriaNombre(prod)}`);
  }

  function getPickerCategorias() {
    const map = new Map();
    productos.forEach((p) => {
      const id = productoCategoriaId(p);
      const nombre = productoCategoriaNombre(p);
      if (!id || !nombre || map.has(id)) return;
      map.set(id, nombre);
    });
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function scoreProductoMatch(prod, queryNorm, tokens) {
    const nombre = normalizeInstSearch(prod?.nombre || '');
    const codigo = normalizeInstSearch(prod?.codigoBarras || '');
    const haystack = productoSearchHaystack(prod);
    if (tokens.some((t) => !haystack.includes(t))) return -1;
    let score = 0;
    if (queryNorm && nombre.startsWith(queryNorm)) score += 100;
    else if (queryNorm && codigo.startsWith(queryNorm)) score += 90;
    else if (queryNorm && nombre.includes(queryNorm)) score += 50;
    else if (queryNorm && codigo.includes(queryNorm)) score += 40;
    if (tokens.length > 1) score += 10;
    return score;
  }

  function filterProductosPicker(query = '', categoriaId = '') {
    const qRaw = String(query || '').trim();
    const qNorm = normalizeInstSearch(qRaw);
    const tokens = qNorm.split(/\s+/).filter(Boolean);
    const catId = String(categoriaId || '');
    const canListByQuery = qNorm.length >= 2;
    if (!productos.length) return { mode: 'guide', matches: [], query: qRaw };

    let list = productos;
    if (catId) list = list.filter((p) => productoCategoriaId(p) === catId);

    if (canListByQuery) {
      list = list
        .map((p) => ({ p, score: scoreProductoMatch(p, qNorm, tokens) }))
        .filter((row) => row.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.p.nombre || '').localeCompare(String(b.p.nombre || ''), 'es');
        })
        .map((row) => row.p);
    } else {
      list = [...list].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
    }

    const limit = canListByQuery || catId ? 40 : 80;
    return { mode: 'results', matches: list.slice(0, limit), query: qRaw, total: list.length, limit };
  }

  function highlightInstMatch(text, query) {
    const raw = String(text ?? '');
    const q = String(query || '').trim();
    if (!raw || !q || q.length < 2) return escapeInstHtml(raw);
    const normText = normalizeInstSearch(raw);
    const tokens = normalizeInstSearch(q).split(/\s+/).filter((t) => t.length >= 2);
    if (!tokens.length) return escapeInstHtml(raw);
    let best = null;
    tokens.forEach((token) => {
      const idx = normText.indexOf(token);
      if (idx < 0) return;
      if (!best || idx < best.idx) best = { idx, len: token.length };
    });
    if (!best) return escapeInstHtml(raw);
    let normPos = 0;
    let start = -1;
    let end = -1;
    for (let i = 0; i < raw.length; i++) {
      const ch = normalizeInstSearch(raw[i]);
      if (!ch) continue;
      if (normPos === best.idx) start = i;
      normPos += ch.length;
      if (start >= 0 && normPos >= best.idx + best.len) {
        end = i + 1;
        break;
      }
    }
    if (start < 0 || end < 0) return escapeInstHtml(raw);
    return (
      escapeInstHtml(raw.slice(0, start)) +
      `<mark class="oc-product-picker__mark">${escapeInstHtml(raw.slice(start, end))}</mark>` +
      escapeInstHtml(raw.slice(end))
    );
  }

  function highlightPickerItem(idx) {
    const listProd = document.getElementById('inst-producto-list');
    if (!listProd) return;
    const items = Array.from(listProd.querySelectorAll('[role="option"]'));
    items.forEach((el, i) => {
      const on = i === idx;
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.classList.toggle('is-active', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
    pickerActiveIdx = idx;
  }

  function renderProductoPickerChips() {
    const chipsProd = document.getElementById('inst-producto-chips');
    if (!chipsProd) return;
    const cats = getPickerCategorias();
    chipsProd.innerHTML = `
      <button type="button" class="oc-product-modal__cat${!pickerCategoriaId ? ' is-active' : ''}" data-categoria="" role="listitem">Todas</button>
      ${cats.map((c) => {
        const short = categoriaChipLabel(c.nombre);
        return `
          <button type="button" class="oc-product-modal__cat${pickerCategoriaId === c.id ? ' is-active' : ''}" data-categoria="${escapeInstHtml(c.id)}" title="${escapeInstHtml(c.nombre)}" role="listitem">
            ${escapeInstHtml(short)}
          </button>
        `;
      }).join('')}
    `;
  }

  function renderProductoPickerRows(matches, query) {
    return matches.map((p, idx) => {
      const codigo = p.codigoBarras || 's/c';
      const cat = productoCategoriaNombre(p);
      const catShort = categoriaChipLabel(cat);
      const precio = Math.round(Number(p.precioVenta) || 0);
      const ud = labelUnidadMedida(p.unidadMedida);
      return `
        <button type="button" class="oc-product-picker__item" role="option" id="inst-prod-opt-${idx}" data-id="${escapeInstHtml(p.id)}" aria-selected="false">
          <span class="oc-product-picker__main">
            <span class="oc-product-picker__name">${highlightInstMatch(p.nombre || 'Producto', query)}</span>
            <span class="oc-product-picker__meta">
              <span class="oc-product-picker__sku">${highlightInstMatch(codigo, query)}</span>
              <span class="oc-product-picker__dot" aria-hidden="true">·</span>
              <span class="oc-product-picker__cat">${escapeInstHtml(ud)}</span>
              ${cat ? `<span class="oc-product-picker__dot" aria-hidden="true">·</span><span class="oc-product-picker__cat" title="${escapeInstHtml(cat)}">${escapeInstHtml(catShort)}</span>` : ''}
            </span>
          </span>
          <span class="oc-product-picker__cost">${fmt.format(precio)}</span>
        </button>
      `;
    }).join('');
  }

  function renderProductoPicker(query = '') {
    const listProd = document.getElementById('inst-producto-list');
    if (!listProd) return;
    const result = filterProductosPicker(query, pickerCategoriaId);
    pickerMatches = result.matches;
    pickerActiveIdx = -1;
    renderProductoPickerChips();

    if (result.mode === 'guide') {
      listProd.innerHTML = `
        <div class="oc-product-picker__guide">
          <p class="oc-product-picker__guide-title">No hay productos físicos</p>
          <p class="oc-product-picker__guide-hint">Cree productos (no servicios) en Inventario.</p>
        </div>
      `;
      return;
    }

    if (!pickerMatches.length) {
      listProd.innerHTML = `<div class="oc-product-picker__empty">Sin coincidencias. Pruebe otro término o categoría.</div>`;
      return;
    }

    const shown = pickerMatches.length;
    const total = Number(result.total || shown);
    const more = total > shown;
    listProd.innerHTML = `
      <div class="oc-product-picker__count">${shown}${more ? ` / ${total}` : ''} producto${shown === 1 ? '' : 's'}${more ? ' · filtre para acotar' : ''}</div>
      ${renderProductoPickerRows(pickerMatches, result.query || query)}
    `;
  }

  function clearModalCompose() {
    modalSelectedProd = null;
    const compose = document.getElementById('inst-modal-compose');
    if (compose) compose.hidden = true;
    const nameEl = document.getElementById('inst-modal-prod-name');
    if (nameEl) nameEl.textContent = '—';
    const precioEl = document.getElementById('inst-modal-precio');
    if (precioEl) precioEl.value = '';
    const cantEl = document.getElementById('inst-modal-cant');
    if (cantEl) cantEl.value = 1;
    const udEl = document.getElementById('inst-modal-ud');
    if (udEl) udEl.textContent = '';
    const hint = document.getElementById('inst-modal-ticket-hint');
    if (hint) {
      hint.textContent = 'Ninguno';
      hint.classList.remove('is-filled');
    }
    highlightPickerItem(-1);
  }

  function fillMaterialForm(prod, { cantidad = 1, autoImei = null } = {}) {
    if (!prod?.id) return;
    const idInput = document.getElementById('mat-producto');
    const display = document.getElementById('mat-producto-display');
    const desc = document.getElementById('mat-desc');
    const precio = document.getElementById('mat-precio');
    const cant = document.getElementById('mat-cantidad');
    const serieFlag = document.getElementById('mat-tiene-serie');
    const unidadInput = document.getElementById('mat-unidad');
    const udLabel = document.getElementById('mat-unidad-label');
    const seriesWrap = document.getElementById('mat-series-wrap');
    const matSeries = document.getElementById('mat-series');
    const ud = labelUnidadMedida(prod.unidadMedida);

    if (idInput) idInput.value = prod.id;
    if (display) display.value = prod.nombre || '';
    if (desc) desc.value = prod.nombre || '';
    if (precio) precio.value = fmt.format(Math.round(Number(prod.precioVenta) || 0));
    if (cant) cant.value = String(Math.max(1, parseInt(cantidad, 10) || 1));
    if (serieFlag) serieFlag.value = prod.tieneNumeroSerie ? '1' : '0';
    if (unidadInput) unidadInput.value = ud;
    if (udLabel) udLabel.textContent = ud ? `(${ud})` : '';
    if (seriesWrap) seriesWrap.style.display = prod.tieneNumeroSerie ? '' : 'none';
    if (matSeries) {
      matSeries.value = autoImei || '';
    }
  }

  function clearMaterialForm() {
    const idInput = document.getElementById('mat-producto');
    const display = document.getElementById('mat-producto-display');
    const desc = document.getElementById('mat-desc');
    const precio = document.getElementById('mat-precio');
    const cant = document.getElementById('mat-cantidad');
    const serieFlag = document.getElementById('mat-tiene-serie');
    const unidadInput = document.getElementById('mat-unidad');
    const udLabel = document.getElementById('mat-unidad-label');
    const seriesWrap = document.getElementById('mat-series-wrap');
    const matSeries = document.getElementById('mat-series');
    if (idInput) idInput.value = '';
    if (display) display.value = '';
    if (desc) desc.value = '';
    if (precio) precio.value = '—';
    if (cant) cant.value = '1';
    if (serieFlag) serieFlag.value = '0';
    if (unidadInput) unidadInput.value = 'und';
    if (udLabel) udLabel.textContent = '';
    if (seriesWrap) seriesWrap.style.display = 'none';
    if (matSeries) matSeries.value = '';
  }

  function chooseProductoFromPicker(prod) {
    if (!prod || prod.esServicio) return;
    modalSelectedProd = prod;
    const compose = document.getElementById('inst-modal-compose');
    if (compose) compose.hidden = false;
    const nameEl = document.getElementById('inst-modal-prod-name');
    if (nameEl) nameEl.textContent = prod.nombre || 'Producto';
    const precioEl = document.getElementById('inst-modal-precio');
    if (precioEl) precioEl.value = String(Math.round(Number(prod.precioVenta) || 0));
    const cantEl = document.getElementById('inst-modal-cant');
    if (cantEl) cantEl.value = 1;
    const udEl = document.getElementById('inst-modal-ud');
    if (udEl) udEl.textContent = `(${labelUnidadMedida(prod.unidadMedida)})`;
    const hint = document.getElementById('inst-modal-ticket-hint');
    if (hint) {
      hint.textContent = '1';
      hint.classList.add('is-filled');
    }
    compose?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    cantEl?.focus();
    cantEl?.select?.();
  }

  function openProductoPickerModal() {
    if (!modalProd) return;
    pickerCategoriaId = '';
    const searchProd = document.getElementById('inst-producto-search');
    if (searchProd) searchProd.value = '';
    clearModalCompose();
    renderProductoPicker('');
    modalProd.show();
    setTimeout(() => searchProd?.focus(), 80);
  }

  function bindProductoPickerOnce() {
    if (bindProductoPickerOnce.done) return;
    bindProductoPickerOnce.done = true;

    const searchProd = document.getElementById('inst-producto-search');
    const listProd = document.getElementById('inst-producto-list');
    const chipsProd = document.getElementById('inst-producto-chips');

    searchProd?.addEventListener('input', () => {
      renderProductoPicker(searchProd.value);
    });

    searchProd?.addEventListener('keydown', (e) => {
      if (!pickerMatches.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightPickerItem(Math.min(pickerActiveIdx + 1, pickerMatches.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightPickerItem(Math.max(pickerActiveIdx - 1, 0));
      } else if (e.key === 'Enter' && pickerActiveIdx >= 0) {
        e.preventDefault();
        chooseProductoFromPicker(pickerMatches[pickerActiveIdx]);
      }
    });

    chipsProd?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-categoria]');
      if (!btn) return;
      pickerCategoriaId = btn.getAttribute('data-categoria') || '';
      renderProductoPicker(searchProd?.value || '');
    });

    listProd?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-id][role="option"]');
      if (!item) return;
      const prod = pickerMatches.find((p) => p.id === item.dataset.id)
        || productos.find((p) => p.id === item.dataset.id);
      if (prod) chooseProductoFromPicker(prod);
    });

    document.getElementById('inst-modal-compose-cancel')?.addEventListener('click', () => {
      clearModalCompose();
      searchProd?.focus();
    });

    document.getElementById('inst-modal-usar')?.addEventListener('click', () => {
      if (!modalSelectedProd) return;
      const cant = parseInt(document.getElementById('inst-modal-cant')?.value, 10) || 1;
      fillMaterialForm(modalSelectedProd, { cantidad: cant });
      modalProd?.hide();
      const seriesWrap = document.getElementById('mat-series-wrap');
      if (modalSelectedProd.tieneNumeroSerie && seriesWrap?.style.display !== 'none') {
        document.getElementById('mat-series')?.focus();
      } else {
        document.getElementById('btn-add-mat')?.focus();
      }
    });
  }

  bindProductoPickerOnce();

  async function abrirDetalle(id, { silent = false } = {}) {
    const content = document.getElementById('detalle-instalacion-content');
    if (!silent) {
      content.innerHTML = `<div class="p-5 text-center"><div class="spinner-border text-primary"></div></div>`;
      modalDetalle.show();
    }

    try {
      const orden = await apiFetch(`/instalaciones/${id}`);
      const locked = ['entregada', 'cancelada'].includes(orden.estado);
      const materiales = orden.materiales || [];
      const matsVenta = materiales.reduce(
        (s, m) => s + (parseFloat(m.precioUnitario) || 0) * (parseInt(m.cantidad, 10) || 0),
        0
      );
      const matsCosto = parseFloat(orden.costoMateriales) || 0;
      const valorServ = parseFloat(orden.valorServicio) || 0;
      const totalCobrado = parseFloat(orden.totalCobrado) || 0;
      const matsLabel = orden.precioCerrado
        ? `Materiales (costo): ${fmt.format(matsCosto)}`
        : `Materiales: ${fmt.format(matsVenta)}`;

      const scrollEl = content.querySelector('.modal-body');
      const scrollTop = silent && scrollEl ? scrollEl.scrollTop : 0;

      content.innerHTML = `
        <header class="inst-detalle__header">
          <div class="inst-detalle__heading">
            <p class="inst-detalle__eyebrow">Orden de campo</p>
            <div class="inst-detalle__title-row">
              <h5 class="modal-title inst-detalle__title">${orden.numeroOrden}</h5>
              <span class="inst-detalle__status badge ${ESTADO_BADGE[orden.estado]}">${ESTADO_LABEL[orden.estado]}</span>
            </div>
            <p class="inst-detalle__lede">
              <span>${orden.cliente?.nombre || 'Sin cliente'}</span>
              <span class="inst-detalle__sep" aria-hidden="true">·</span>
              <span>${orden.sede?.nombre || 'Sin sede'}</span>
            </p>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </header>

        <div class="modal-body inst-detalle__body">
          <div class="inst-detalle__meta" role="list">
            <div class="inst-detalle__meta-item" role="listitem">
              <span class="inst-detalle__meta-label">Técnico</span>
              <span class="inst-detalle__meta-value">${orden.tecnico?.nombre || 'Sin asignar'}</span>
            </div>
            <div class="inst-detalle__meta-item" role="listitem">
              <span class="inst-detalle__meta-label">Sitio</span>
              <span class="inst-detalle__meta-value">${orden.sitio || '—'}</span>
            </div>
            <div class="inst-detalle__meta-item inst-detalle__meta-item--wide" role="listitem">
              <span class="inst-detalle__meta-label">Dirección</span>
              <span class="inst-detalle__meta-value">${orden.direccion || '—'}</span>
            </div>
          </div>

          ${canWrite && !locked ? `
          <section class="inst-detalle__panel" aria-labelledby="inst-det-trabajo">
            <header class="inst-detalle__panel-head">
              <h4 id="inst-det-trabajo" class="inst-detalle__panel-title">Trabajo</h4>
              <p class="inst-detalle__panel-hint">Servicio, técnico y notas de campo.</p>
            </header>
            <div class="inst-detalle__trabajo-grid">
              <div class="inst-detalle__field">
                <label class="form-label" for="det-valor-servicio">Valor servicio ($)</label>
                <input type="number" id="det-valor-servicio" class="form-control" min="0" step="1000" value="${valorServ}">
              </div>
              <div class="inst-detalle__field">
                <label class="form-label" for="det-tecnico">Técnico</label>
                <select id="det-tecnico" class="form-select">
                  <option value="">— Por asignar —</option>
                  ${tecnicos.map((t) => `<option value="${t.id}" ${orden.tecnicoId === t.id ? 'selected' : ''}>${t.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="inst-detalle__field inst-detalle__field--obs">
                <label class="form-label" for="det-obs">Observaciones</label>
                <input type="text" id="det-obs" class="form-control" value="${(orden.observaciones || '').replace(/"/g, '&quot;')}">
              </div>
              <div class="inst-detalle__field inst-detalle__field--action">
                <button type="button" class="btn btn-outline-primary w-100" id="btn-guardar-inst">Guardar</button>
              </div>
            </div>
            <div class="form-check inst-detalle__check">
              <input class="form-check-input" type="checkbox" id="det-precio-cerrado" ${orden.precioCerrado ? 'checked' : ''}>
              <label class="form-check-label" for="det-precio-cerrado">
                Todo incluido — materiales ya van en el valor del servicio (el total no los vuelve a sumar)
              </label>
            </div>
          </section>
          ` : `
          <section class="inst-detalle__summary" aria-label="Resumen del trabajo">
            ${orden.precioCerrado ? '<span class="badge bg-blue-lt">Todo incluido</span>' : ''}
            <span>Servicio <strong>${fmt.format(valorServ)}</strong></span>
            <span class="inst-detalle__sep" aria-hidden="true">·</span>
            <span>${orden.precioCerrado
              ? `Materiales (costo interno) <strong>${fmt.format(matsCosto)}</strong>`
              : `Materiales <strong>${fmt.format(matsVenta)}</strong>`}</span>
            <span class="inst-detalle__sep" aria-hidden="true">·</span>
            <span>Total <strong>${fmt.format(totalCobrado)}</strong></span>
          </section>
          `}

          ${orden.estado === 'en_proceso' && orden.factura ? `
          <div class="alert alert-info d-flex align-items-start gap-2 mb-3" role="status">
            <i class="ti ti-file-invoice mt-1" aria-hidden="true"></i>
            <div>
              <strong>Instalación reabierta</strong>
              <div class="small">Está vinculada a ${orden.factura.numeroFactura}. ${orden.precioCerrado
                ? 'El total ya cobrado permanece fijo; puede completar materiales y datos.'
                : 'Al volver a entregarla se actualizarán la factura y el saldo pendiente.'}</div>
            </div>
          </div>
          ` : ''}

          <section class="inst-detalle__panel inst-detalle__panel--mats" aria-labelledby="inst-det-mats">
            <header class="inst-detalle__panel-head inst-detalle__panel-head--split">
              <div>
                <h4 id="inst-det-mats" class="inst-detalle__panel-title">Materiales</h4>
                <p class="inst-detalle__panel-hint">Descuenta stock de la sede al agregar.</p>
              </div>
              <span class="inst-detalle__count">${materiales.length} ítem${materiales.length === 1 ? '' : 's'}</span>
            </header>
            <div class="table-responsive inst-detalle__table-wrap">
              <table class="table table-sm table-vcenter mb-0 inst-detalle__table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class="text-center">Cant.</th>
                    <th class="text-center">Ud.</th>
                    <th>Series</th>
                    <th class="text-end">P. venta</th>
                    <th class="text-end">Costo u.</th>
                    <th class="w-1"></th>
                  </tr>
                </thead>
                <tbody>
                  ${materiales.length ? materiales.map((m) => {
                    const ud = labelUnidadMedida(m.producto?.unidadMedida);
                    const canAdjust = canWrite && !locked && !m.producto?.tieneNumeroSerie;
                    return `
                    <tr>
                      <td>${m.producto?.nombre || '—'}</td>
                      <td class="text-center">
                        ${canAdjust ? `
                          <input type="number" class="form-control form-control-sm text-center mx-auto mat-qty-input inst-detalle__qty"
                            data-mid="${m.id}" data-prev="${m.cantidad}" min="1" value="${m.cantidad}" inputmode="numeric" aria-label="Cantidad en ${ud}">
                        ` : m.cantidad}
                      </td>
                      <td class="text-center text-secondary">${ud}</td>
                      <td class="small">${Array.isArray(m.series) && m.series.length ? m.series.join(', ') : '—'}</td>
                      <td class="text-end">${fmt.format(parseFloat(m.precioUnitario) || 0)}</td>
                      <td class="text-end">${fmt.format(parseFloat(m.costoUnitario) || 0)}</td>
                      <td>
                        ${canWrite && !locked ? `
                          <button type="button" class="btn btn-sm btn-ghost-danger btn-rm-mat" data-mid="${m.id}" title="Revertir al inventario">
                            <i class="ti ti-trash"></i>
                          </button>` : ''}
                      </td>
                    </tr>`;
                  }).join('') : `<tr><td colspan="7" class="text-center text-secondary py-4">Sin materiales aún. Escanee o busque en el catálogo.</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>

          ${canWrite && !locked ? `
          <section class="inst-detalle__add" aria-labelledby="inst-det-add">
            <header class="inst-detalle__add-head">
              <h4 id="inst-det-add" class="inst-detalle__add-title">Agregar material</h4>
              <p class="inst-detalle__add-hint">Escanee con F2 o busque en el catálogo.</p>
            </header>
            <div class="inst-detalle__field inst-detalle__scan">
              <label class="form-label d-flex align-items-center gap-2" for="mat-scan">
                <span>Escanear código / IMEI</span>
                <kbd class="small px-1 py-0" title="Atajo de teclado">F2</kbd>
              </label>
              <div class="input-group">
                <span class="input-group-text"><i class="ti ti-barcode" aria-hidden="true"></i></span>
                <input type="text" id="mat-scan" class="form-control" placeholder="Apunte el lector y escanee…" autocomplete="off" spellcheck="false" inputmode="none">
              </div>
            </div>
            <div class="inst-detalle__compose">
              <div class="inst-detalle__field inst-detalle__field--picker">
                <label class="form-label" for="btn-inst-buscar-producto">Producto del catálogo</label>
                <div class="input-group">
                  <input type="hidden" id="mat-producto" value="">
                  <input type="hidden" id="mat-tiene-serie" value="0">
                  <input type="hidden" id="mat-unidad" value="und">
                  <span class="input-group-text"><i class="ti ti-package" aria-hidden="true"></i></span>
                  <input
                    type="text"
                    id="mat-producto-display"
                    class="form-control"
                    placeholder="Buscar en catálogo…"
                    readonly
                    tabindex="-1"
                  >
                  <button type="button" class="btn btn-outline-primary" id="btn-inst-buscar-producto" title="Buscar producto">
                    <i class="ti ti-search me-1" aria-hidden="true"></i>Buscar
                  </button>
                </div>
              </div>
              <div class="inst-detalle__field inst-detalle__field--desc">
                <label class="form-label" for="mat-desc">Descripción</label>
                <input type="text" id="mat-desc" class="form-control" placeholder="Se completa al elegir producto" readonly>
              </div>
              <div class="inst-detalle__field inst-detalle__field--precio">
                <label class="form-label" for="mat-precio">Precio unit.</label>
                <input type="text" id="mat-precio" class="form-control" value="—" readonly>
              </div>
              <div class="inst-detalle__field inst-detalle__field--qty">
                <label class="form-label" for="mat-cantidad">Cant. <span id="mat-unidad-label" class="fw-normal"></span></label>
                <input type="number" id="mat-cantidad" class="form-control" min="1" value="1" inputmode="numeric">
              </div>
              <div class="inst-detalle__field inst-detalle__field--add">
                <button type="button" id="btn-add-mat" class="btn btn-primary" aria-label="Agregar material">
                  <i class="ti ti-plus" aria-hidden="true"></i>
                  <span>Agregar</span>
                </button>
              </div>
            </div>
            <div class="inst-detalle__series" id="mat-series-wrap" style="display:none">
              <div class="inst-detalle__field">
                <label class="form-label" for="mat-series">Series / IMEI</label>
                <input type="text" id="mat-series" class="form-control" placeholder="Separadas por coma (misma cantidad)">
              </div>
            </div>
            <p class="inst-detalle__hint">Solo productos físicos (descuentan stock). En metros, cantidad = metros usados.</p>
          </section>
          ` : ''}
        </div>

        <footer class="inst-detalle__footer">
          <div class="inst-detalle__settlement">
            ${orden.precioCerrado ? '<span class="badge bg-blue-lt inst-detalle__incluido">Todo incluido</span>' : ''}
            <div class="inst-detalle__lines">
              <span>Servicio <strong>${fmt.format(valorServ)}</strong></span>
              <span class="inst-detalle__mats-line">${matsLabel}</span>
            </div>
            <div class="inst-detalle__grand">
              <span class="inst-detalle__grand-label">Total a cobrar</span>
              <span class="inst-detalle__grand-value">${fmt.format(totalCobrado)}</span>
            </div>
          </div>
          <div class="inst-detalle__actions">
            <button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Cerrar</button>
            ${canWrite && !locked ? `
              <button type="button" class="btn btn-success inst-detalle__cta" id="btn-cerrar-inst">
                <i class="ti ti-check me-1" aria-hidden="true"></i>${orden.factura ? 'Volver a entregar' : 'Marcar entregada'}
              </button>
            ` : ''}
            ${canReopen && orden.estado === 'entregada' ? `
              <button type="button" class="btn btn-primary inst-detalle__cta" id="btn-reabrir-inst">
                <i class="ti ti-lock-open me-1" aria-hidden="true"></i>Reabrir para completar
              </button>
            ` : ''}
          </div>
        </footer>
      `;

      if (silent && scrollTop) {
        const newScroll = content.querySelector('.modal-body');
        if (newScroll) newScroll.scrollTop = scrollTop;
      }

      const matScan = document.getElementById('mat-scan');
      const matSeries = document.getElementById('mat-series');
      const matCantidad = document.getElementById('mat-cantidad');

      async function aplicarProductoEscaneado(codigoRaw) {
        const codigo = String(codigoRaw || '').trim();
        if (!codigo) return;

        const sedeId = orden.sedeId || usuario.sedeId || '';
        let prod = productos.find((p) => String(p.codigoBarras || '') === codigo);
        let autoImei = null;

        if (!prod) {
          try {
            const q = sedeId ? `?sedeId=${encodeURIComponent(sedeId)}` : '';
            const found = await apiFetch(`/productos/barcode/${encodeURIComponent(codigo)}${q}`);
            prod = found;
            autoImei = found.autoDetectedImei || null;
            if (prod?.id && !productos.some((p) => p.id === prod.id) && !prod.esServicio) {
              productos.push(prod);
            }
          } catch (err) {
            showToast('No encontrado', err.message || `Código ${codigo} no existe.`, 'error');
            return;
          }
        }

        if (!prod?.id) {
          showToast('No encontrado', `Código ${codigo} no existe.`, 'error');
          return;
        }
        if (prod.esServicio) {
          showToast('Aviso', 'Los servicios no se agregan como material. Use valor del servicio.', 'warning');
          return;
        }

        fillMaterialForm(prod, { cantidad: 1, autoImei });
        if (matScan) matScan.value = '';
        showToast('Producto', prod.nombre, 'success');
        if (prod.tieneNumeroSerie) {
          matSeries?.focus();
        } else {
          document.getElementById('btn-add-mat')?.focus();
        }
      }

      document.getElementById('btn-inst-buscar-producto')?.addEventListener('click', () => {
        openProductoPickerModal();
      });

      if (matScan) {
        matScan.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          aplicarProductoEscaneado(matScan.value);
        });
        if (!silent) {
          setTimeout(() => matScan.focus(), 50);
        }
      }

      async function refreshAfterChange() {
        await loadData();
        renderTabla();
        await abrirDetalle(id, { silent: true });
      }

      document.getElementById('btn-guardar-inst')?.addEventListener('click', async () => {
        try {
          await apiFetch(`/instalaciones/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              valorServicio: document.getElementById('det-valor-servicio').value,
              tecnicoId: document.getElementById('det-tecnico').value || null,
              observaciones: document.getElementById('det-obs').value,
              precioCerrado: document.getElementById('det-precio-cerrado')?.checked === true
            })
          });
          showToast('Éxito', 'Orden actualizada.', 'success');
          await refreshAfterChange();
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
      });

      document.getElementById('btn-add-mat')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-add-mat');
        const productoId = document.getElementById('mat-producto')?.value;
        const cantidad = parseInt(document.getElementById('mat-cantidad')?.value, 10);
        const seriesRaw = document.getElementById('mat-series')?.value || '';
        const series = seriesRaw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        if (!productoId || !cantidad) {
          showToast('Aviso', 'Busque un producto del catálogo y indique cantidad.', 'warning');
          return;
        }
        const necesitaSerie = document.getElementById('mat-tiene-serie')?.value === '1';
        if (necesitaSerie && series.length !== cantidad) {
          showToast('Aviso', `Indique ${cantidad} serie(s) / IMEI.`, 'warning');
          return;
        }
        btn.disabled = true;
        try {
          const payload = { productoId, cantidad };
          if (series.length) payload.series = series;
          await apiFetch(`/instalaciones/${id}/materiales`, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          showToast('Éxito', 'Material descontado del inventario.', 'success');
          clearMaterialForm();
          await refreshAfterChange();
        } catch (err) {
          showToast('Error', err.message, 'error');
          btn.disabled = false;
        }
      });

      content.querySelectorAll('.btn-rm-mat').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Revertir este material al inventario?')) return;
          try {
            await apiFetch(`/instalaciones/${id}/materiales/${btn.dataset.mid}`, { method: 'DELETE' });
            showToast('Éxito', 'Material revertido.', 'success');
            await refreshAfterChange();
          } catch (err) {
            showToast('Error', err.message, 'error');
          }
        });
      });

      content.querySelectorAll('.mat-qty-input').forEach((input) => {
        const commitQty = async () => {
          const mid = input.dataset.mid;
          const prev = parseInt(input.dataset.prev, 10);
          const next = parseInt(input.value, 10);
          if (!mid || !next || next <= 0) {
            input.value = String(prev);
            showToast('Aviso', 'La cantidad debe ser un entero mayor a 0.', 'warning');
            return;
          }
          if (next === prev) return;
          input.disabled = true;
          try {
            await apiFetch(`/instalaciones/${id}/materiales/${mid}`, {
              method: 'PUT',
              body: JSON.stringify({ cantidad: next })
            });
            showToast('Éxito', `Cantidad ajustada: ${prev} → ${next}.`, 'success');
            await refreshAfterChange();
          } catch (err) {
            input.value = String(prev);
            showToast('Error', err.message, 'error');
            input.disabled = false;
          }
        };
        input.addEventListener('change', commitQty);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
          }
        });
      });

      document.getElementById('btn-cerrar-inst')?.addEventListener('click', async () => {
        const total = parseFloat(orden.totalCobrado) || 0;
        if (total <= 0 || orden.factura) {
          try {
            await apiFetch(`/instalaciones/${id}/cerrar`, { method: 'POST', body: '{}' });
            showToast('Éxito', 'Instalación entregada.', 'success');
            await loadData();
            renderTabla();
            await abrirDetalle(id);
          } catch (err) {
            showToast('Error', err.message, 'error');
          }
          return;
        }
        openCobroInstalacion(orden);
      });

      document.getElementById('btn-reabrir-inst')?.addEventListener('click', async () => {
        if (!confirm('¿Reabrir esta instalación para completar datos o materiales?')) return;
        const btn = document.getElementById('btn-reabrir-inst');
        btn.disabled = true;
        try {
          const result = await apiFetch(`/instalaciones/${id}/reabrir`, {
            method: 'POST',
            body: '{}'
          });
          showToast('Instalación reabierta', result.message, 'success');
          await loadData();
          renderTabla();
          await abrirDetalle(id, { silent: true });
        } catch (err) {
          showToast('Error', err.message, 'error');
          btn.disabled = false;
        }
      });
    } catch (err) {
      content.innerHTML = `<div class="p-4 text-danger">${err.message}</div>`;
    }
  }

  document.getElementById('btn-nueva-instalacion')?.addEventListener('click', () => {
    document.getElementById('form-nueva-instalacion').reset();
    modalNueva.show();
  });

  document.getElementById('form-nueva-instalacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try {
      const payload = {
        clienteId: document.getElementById('inst-cliente').value,
        tecnicoId: document.getElementById('inst-tecnico').value || null,
        sitio: document.getElementById('inst-sitio').value || null,
        direccion: document.getElementById('inst-direccion').value || null,
        descripcion: document.getElementById('inst-descripcion').value || null,
        valorServicio: document.getElementById('inst-valor-servicio').value || 0,
        precioCerrado: document.getElementById('inst-precio-cerrado')?.checked === true,
        fechaProgramada: document.getElementById('inst-fecha').value || null,
        observaciones: document.getElementById('inst-obs').value || null
      };
      if (needsSedePicker) {
        payload.sedeId = document.getElementById('inst-sede').value;
      }
      const creada = await apiFetch('/instalaciones', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      modalNueva.hide();
      showToast('Éxito', `Orden ${creada.numeroOrden} creada.`, 'success');
      await loadData();
      renderTabla();
      abrirDetalle(creada.id);
    } catch (err) {
      showToast('Error', err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('inst-btn-filtrar').addEventListener('click', () => {
    filtroEstado = document.getElementById('inst-filtro-estado').value;
    filtroBuscar = document.getElementById('inst-buscar').value.trim();
    renderTabla();
  });

  document.getElementById('inst-buscar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('inst-btn-filtrar').click();
    }
  });

  if (instalacionesKeydownHandler) {
    document.removeEventListener('keydown', instalacionesKeydownHandler);
  }
  instalacionesKeydownHandler = (e) => {
    if (e.key !== 'F2') return;
    const modal = document.getElementById('modal-detalle-instalacion');
    const scan = document.getElementById('mat-scan');
    if (!modal?.classList.contains('show') || !scan) return;
    e.preventDefault();
    scan.focus();
    scan.select();
  };
  document.addEventListener('keydown', instalacionesKeydownHandler);

  renderTabla();
}

export function destroyInstalaciones() {
  if (instalacionesKeydownHandler) {
    document.removeEventListener('keydown', instalacionesKeydownHandler);
    instalacionesKeydownHandler = null;
  }
}

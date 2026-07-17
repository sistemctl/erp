import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';
import { showToast } from '../utils/toast.js';

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

    <div class="modal modal-blur fade" id="modal-detalle-instalacion" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
        <div class="modal-content" id="detalle-instalacion-content"></div>
      </div>
    </div>
  `;

  const modalNueva = new bootstrap.Modal(document.getElementById('modal-nueva-instalacion'));
  const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle-instalacion'));

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

      const scrollEl = content.querySelector('.modal-body');
      const scrollTop = silent && scrollEl ? scrollEl.scrollTop : 0;

      content.innerHTML = `
        <div class="modal-header">
          <div>
            <h5 class="modal-title mb-0">${orden.numeroOrden}</h5>
            <div class="text-secondary small">${orden.cliente?.nombre || ''} · ${orden.sede?.nombre || ''}</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 mb-3">
            <div class="col-md-3">
              <div class="text-secondary small">Estado</div>
              <span class="badge ${ESTADO_BADGE[orden.estado]}">${ESTADO_LABEL[orden.estado]}</span>
            </div>
            <div class="col-md-3">
              <div class="text-secondary small">Técnico</div>
              <div>${orden.tecnico?.nombre || 'Sin asignar'}</div>
            </div>
            <div class="col-md-3">
              <div class="text-secondary small">Sitio</div>
              <div>${orden.sitio || '—'}</div>
            </div>
            <div class="col-md-3">
              <div class="text-secondary small">Dirección</div>
              <div>${orden.direccion || '—'}</div>
            </div>
          </div>

          ${canWrite && !locked ? `
          <div class="card mb-3">
            <div class="card-body">
              <div class="row g-2 align-items-end">
                <div class="col-md-3">
                  <label class="form-label">Valor servicio ($)</label>
                  <input type="number" id="det-valor-servicio" class="form-control" min="0" step="1000" value="${parseFloat(orden.valorServicio) || 0}">
                </div>
                <div class="col-md-3">
                  <label class="form-label">Técnico</label>
                  <select id="det-tecnico" class="form-select">
                    <option value="">— Por asignar —</option>
                    ${tecnicos.map((t) => `<option value="${t.id}" ${orden.tecnicoId === t.id ? 'selected' : ''}>${t.nombre}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Observaciones</label>
                  <input type="text" id="det-obs" class="form-control" value="${(orden.observaciones || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="col-md-2">
                  <button type="button" class="btn btn-outline-primary w-100" id="btn-guardar-inst">Guardar</button>
                </div>
              </div>
            </div>
          </div>
          ` : `
          <div class="alert alert-info mb-3">
            Servicio: <strong>${fmt.format(parseFloat(orden.valorServicio) || 0)}</strong>
            · Materiales (costo): <strong>${fmt.format(parseFloat(orden.costoMateriales) || 0)}</strong>
            · Total: <strong>${fmt.format(parseFloat(orden.totalCobrado) || 0)}</strong>
          </div>
          `}

          <div class="d-flex justify-content-between align-items-center mb-2">
            <h4 class="mb-0">Materiales</h4>
            <div class="text-secondary small">Descuenta stock de la sede al agregar</div>
          </div>
          <div class="table-responsive mb-3">
            <table class="table table-sm table-vcenter">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="text-center">Cant.</th>
                  <th>Series</th>
                  <th class="text-end">Costo u.</th>
                  <th class="w-1"></th>
                </tr>
              </thead>
              <tbody>
                ${materiales.length ? materiales.map((m) => `
                  <tr>
                    <td>${m.producto?.nombre || '—'}</td>
                    <td class="text-center">${m.cantidad}</td>
                    <td class="small">${Array.isArray(m.series) && m.series.length ? m.series.join(', ') : '—'}</td>
                    <td class="text-end">${fmt.format(parseFloat(m.costoUnitario) || 0)}</td>
                    <td>
                      ${canWrite && !locked ? `
                        <button type="button" class="btn btn-sm btn-ghost-danger btn-rm-mat" data-mid="${m.id}" title="Revertir al inventario">
                          <i class="ti ti-trash"></i>
                        </button>` : ''}
                    </td>
                  </tr>
                `).join('') : `<tr><td colspan="5" class="text-center text-secondary py-3">Sin materiales aún.</td></tr>`}
              </tbody>
            </table>
          </div>

          ${canWrite && !locked ? `
          <div class="card bg-light-lt">
            <div class="card-body">
              <h4 class="mb-3">Agregar material</h4>
              <div class="mb-3">
                <label class="form-label d-flex align-items-center gap-2" for="mat-scan">
                  <span>Escanear código / IMEI</span>
                  <kbd class="small px-1 py-0" title="Atajo de teclado">F2</kbd>
                </label>
                <div class="input-group">
                  <span class="input-group-text"><i class="ti ti-barcode" aria-hidden="true"></i></span>
                  <input type="text" id="mat-scan" class="form-control" placeholder="Apunte el lector y escanee…" autocomplete="off" spellcheck="false" inputmode="none">
                </div>
              </div>
              <div class="row g-2 align-items-end">
                <div class="col-md-5">
                  <label class="form-label" for="mat-producto">Producto</label>
                  <select id="mat-producto" class="form-select">
                    <option value="">— Seleccionar —</option>
                    ${productos.map((p) => `<option value="${p.id}" data-serie="${p.tieneNumeroSerie ? '1' : '0'}" data-codigo="${(p.codigoBarras || '').replace(/"/g, '&quot;')}">${p.nombre}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-2">
                  <label class="form-label" for="mat-cantidad">Cantidad</label>
                  <input type="number" id="mat-cantidad" class="form-control" min="1" value="1">
                </div>
                <div class="col-md-3" id="mat-series-wrap" style="display:none">
                  <label class="form-label" for="mat-series">Series / IMEI</label>
                  <input type="text" id="mat-series" class="form-control" placeholder="Separadas por coma">
                </div>
                <div class="col-md-2">
                  <button type="button" class="btn btn-primary w-100" id="btn-add-mat">Agregar</button>
                </div>
              </div>
              <p class="form-hint mb-0 mt-2">F2 enfoca el escáner. Si el producto lleva serie, indique exactamente la misma cantidad de series.</p>
            </div>
          </div>
          ` : ''}

          <div class="mt-3 d-flex justify-content-end gap-3 fw-bold">
            <span>Servicio: ${fmt.format(parseFloat(orden.valorServicio) || 0)}</span>
            <span>Materiales: ${fmt.format(parseFloat(orden.costoMateriales) || 0)}</span>
            <span class="text-primary">Total: ${fmt.format(parseFloat(orden.totalCobrado) || 0)}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cerrar</button>
          ${canWrite && !locked ? `
            <button type="button" class="btn btn-success" id="btn-cerrar-inst">
              <i class="ti ti-check me-1"></i> Marcar entregada
            </button>
          ` : ''}
        </div>
      `;

      if (silent && scrollTop) {
        const newScroll = content.querySelector('.modal-body');
        if (newScroll) newScroll.scrollTop = scrollTop;
      }

      const matSelect = document.getElementById('mat-producto');
      const seriesWrap = document.getElementById('mat-series-wrap');
      const matScan = document.getElementById('mat-scan');
      const matSeries = document.getElementById('mat-series');
      const matCantidad = document.getElementById('mat-cantidad');

      const syncSerieVisibility = () => {
        if (!matSelect || !seriesWrap) return;
        const opt = matSelect.selectedOptions[0];
        seriesWrap.style.display = opt?.dataset.serie === '1' ? '' : 'none';
      };

      if (matSelect) {
        matSelect.addEventListener('change', syncSerieVisibility);
      }

      async function aplicarProductoEscaneado(codigoRaw) {
        const codigo = String(codigoRaw || '').trim();
        if (!codigo || !matSelect) return;

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

        let opt = matSelect.querySelector(`option[value="${prod.id}"]`);
        if (!opt) {
          opt = document.createElement('option');
          opt.value = prod.id;
          opt.dataset.serie = prod.tieneNumeroSerie ? '1' : '0';
          opt.dataset.codigo = prod.codigoBarras || '';
          opt.textContent = prod.nombre;
          matSelect.appendChild(opt);
        }

        matSelect.value = prod.id;
        syncSerieVisibility();

        if (autoImei && matSeries) {
          matSeries.value = autoImei;
          if (matCantidad) matCantidad.value = '1';
          seriesWrap.style.display = '';
        }

        if (matScan) {
          matScan.value = '';
        }

        showToast('Producto', prod.nombre, 'success');
        document.getElementById('btn-add-mat')?.focus();
      }

      if (matScan) {
        matScan.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          aplicarProductoEscaneado(matScan.value);
        });
        if (!silent) {
          // Al abrir detalle editable, dejar listo el escáner
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
              observaciones: document.getElementById('det-obs').value
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
        const productoId = document.getElementById('mat-producto').value;
        const cantidad = parseInt(document.getElementById('mat-cantidad').value, 10);
        const seriesRaw = document.getElementById('mat-series')?.value || '';
        const series = seriesRaw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        if (!productoId || !cantidad) {
          showToast('Aviso', 'Seleccione producto y cantidad.', 'warning');
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

      document.getElementById('btn-cerrar-inst')?.addEventListener('click', async () => {
        if (!confirm('¿Marcar esta instalación como entregada?')) return;
        try {
          await apiFetch(`/instalaciones/${id}/cerrar`, { method: 'POST', body: '{}' });
          showToast('Éxito', 'Instalación entregada.', 'success');
          await refreshAfterChange();
        } catch (err) {
          showToast('Error', err.message, 'error');
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

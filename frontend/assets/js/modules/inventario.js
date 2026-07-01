import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { showToast, showConfirm } from '../utils/toast.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';
import { printBarcodeLabels, renderBarcodePreview, isInternalBarcode } from '../utils/barcode-label.js';

let dataSedes = [];

export async function initInventario(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);

  const parseStockInput = (val) => {
    const n = parseInt(String(val ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isNaN(n) ? 0 : Math.max(0, n);
  };

  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const soloStockBajo = hashParams.get('alerta') === 'bajo';
  
  // Cargar sedes para los formularios y traslados
  try {
    dataSedes = await apiFetch('/config/sedes');
  } catch (e) {
    console.error('Error al obtener sedes en inventario:', e);
  }

  // Renderizar maquetación base
  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Inventario',
        title: 'Catálogo y existencias',
        subtitle: 'Control de stock, traslados y administración de productos',
        actionsHtml: isAdminOrGerente ? `
          <div class="btn-list">
            <button id="btn-nuevo-producto" class="btn btn-primary">
              <i class="ti ti-plus me-2"></i> Nuevo producto
            </button>
            <button id="btn-gestionar-categorias" class="btn btn-outline-primary">
              <i class="ti ti-tags me-2"></i> Categorías
            </button>
            <button id="btn-traslado" class="btn btn-warning">
              <i class="ti ti-arrows-left-right me-2"></i> Traslado
            </button>
            <button id="btn-importar-csv" class="btn btn-outline-secondary">
              <i class="ti ti-file-upload me-2"></i> Importar CSV
            </button>
          </div>
        ` : ''
      })}

      <!-- Filtro de Sede -->
      <div class="card mb-3 erp-filter-card">
        <div class="card-body">
          ${soloStockBajo ? `
            <div class="alert alert-warning mb-3 py-2">
              <i class="ti ti-alert-triangle me-1"></i>
              Mostrando solo productos con stock bajo o agotado.
              <a href="#/inventario" class="alert-link ms-1">Ver todo el inventario</a>
            </div>
          ` : ''}
          <div class="row align-items-center">
            <div class="col-md-4">
              <label class="form-label">Sede a Consultar</label>
              <select id="select-sede-inventario" class="form-select">
                ${dataSedes.map(s => `<option value="${s.id}" ${s.id === (usuario.sedeId || dataSedes[0]?.id) ? 'selected' : ''}>${s.nombre}</option>`).join('')}
              </select>
            </div>
            <div class="col-md-6 mt-3 mt-md-0">
              <label class="form-label">Buscador</label>
              <input type="text" id="search-inventario" class="form-control" placeholder="Buscar por nombre o código de barras…" spellcheck="false">
            </div>
          </div>
        </div>
      </div>

      <!-- Tabla de stock -->
      <div class="card">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover">
            <thead>
              <tr>
                <th>Código de Barras</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Costo (COP)</th>
                <th>Venta (COP)</th>
                <th class="text-center">Existencias</th>
                <th class="text-center">Estado</th>
                <th class="text-center">Serie/IMEI</th>
                ${isAdminOrGerente ? `<th class="w-1">Acciones</th>` : ''}
              </tr>
            </thead>
            <tbody id="inventario-table-body">
              <tr>
                 <td colspan="9" class="text-center py-4">Cargando inventario…</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-producto" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable" role="document">
        <div class="modal-content prod-form-modal">
          <div class="modal-header prod-form-modal__header">
            <div class="prod-form-modal__intro">
              <p class="prod-form-modal__eyebrow">Inventario · catálogo</p>
              <h5 class="modal-title mb-0" id="modal-producto-title">Crear producto</h5>
              <div class="prod-form-modal__meta d-none" id="prod-form-meta" aria-live="polite">
                <span class="prod-form-meta-chip" id="prod-form-meta-codigo"></span>
              </div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <form id="form-producto">
            <input type="hidden" id="producto-id">
            <div class="modal-body prod-form-modal__body">

              <div class="prod-form-layout">
                <div class="prod-form-layout__main">

                  <article class="prod-form-card" aria-labelledby="prod-section-identidad">
                    <header class="prod-form-card__head">
                      <h6 class="prod-form-card__title" id="prod-section-identidad">Identificación</h6>
                      <p class="prod-form-card__desc">Nombre, categoría y código para escanear en caja.</p>
                    </header>
                    <div class="row g-3">
                      <div class="col-md-8">
                        <label class="form-label" for="prod-nombre">Nombre del producto</label>
                        <input type="text" id="prod-nombre" class="form-control form-control-lg prod-form-input-title" required placeholder="Ej: Disco duro SSD 1 TB">
                      </div>
                      <div class="col-md-4">
                        <label class="form-label" for="prod-categoria">Categoría</label>
                        <select id="prod-categoria" class="form-select form-select-lg" required></select>
                      </div>
                    </div>

                    <div class="prod-barcode-ticket mt-3">
                      <div class="prod-barcode-ticket__label">
                        <i class="ti ti-barcode" aria-hidden="true"></i>
                        <span>Código de barras</span>
                      </div>
                      <div class="prod-barcode-ticket__row">
                        <input type="text" id="prod-codigo" class="form-control prod-barcode-ticket__input" placeholder="Vacío = código interno 29…" spellcheck="false" inputmode="numeric" autocomplete="off">
                        <button type="button" class="btn btn-primary prod-barcode-ticket__btn" id="btn-generar-codigo" title="Generar código interno">
                          <i class="ti ti-wand" aria-hidden="true"></i>
                          <span>Generar</span>
                        </button>
                      </div>
                      <p class="prod-barcode-ticket__hint">Use el de fábrica si existe. Si no, déjelo vacío al crear y el sistema asigna uno interno.</p>
                    </div>
                  </article>

                  <article class="prod-form-card" aria-labelledby="prod-section-detalle">
                    <header class="prod-form-card__head">
                      <h6 class="prod-form-card__title" id="prod-section-detalle">Ficha del producto</h6>
                      <p class="prod-form-card__desc">Detalle para cotizaciones y consulta en tienda.</p>
                    </header>
                    <div class="row g-3">
                      <div class="col-12">
                        <label class="form-label" for="prod-descripcion">Descripción</label>
                        <textarea id="prod-descripcion" class="form-control" rows="3" placeholder="Especificaciones, compatibilidad, garantía…" spellcheck="false"></textarea>
                      </div>
                      <div class="col-12">
                        <label class="form-label" for="prod-imagen-url">Foto (URL)</label>
                        <div class="input-group">
                          <span class="input-group-text"><i class="ti ti-photo" aria-hidden="true"></i></span>
                          <input type="url" id="prod-imagen-url" class="form-control" placeholder="https://…">
                        </div>
                      </div>
                    </div>
                  </article>

                  <article class="prod-form-card d-none" id="sec-gestion-seriales" aria-labelledby="prod-section-seriales">
                    <header class="prod-form-card__head">
                      <h6 class="prod-form-card__title" id="prod-section-seriales">Seriales en esta sede</h6>
                      <p class="prod-form-card__desc">Cada unidad con IMEI o serial propio se registra aparte del código de catálogo.</p>
                    </header>
                    <div class="row g-3">
                      <div class="col-12">
                        <label class="form-label d-flex justify-content-between align-items-center gap-2" for="modal-reg-imei">
                          <span>Nuevos seriales</span>
                          <span class="badge bg-blue-lt" id="modal-seriales-counter">0 detectados</span>
                        </label>
                        <div class="prod-form-serial-input">
                          <textarea id="modal-reg-imei" class="form-control" rows="2" placeholder="Uno por línea o separados por comas" spellcheck="false"></textarea>
                          <button type="button" id="modal-btn-add-seriales" class="btn btn-primary">Agregar</button>
                        </div>
                      </div>
                      <div class="col-12">
                        <label class="form-label">En stock ahora</label>
                        <div class="table-responsive prod-form-serial-table">
                          <table class="table table-vcenter table-sm card-table mb-0">
                            <thead>
                              <tr>
                                <th>Serial / IMEI</th>
                                <th class="text-end px-3">Acción</th>
                              </tr>
                            </thead>
                            <tbody id="modal-seriales-list-body">
                              <tr><td colspan="2" class="text-center text-secondary py-2">No hay seriales en stock para este producto.</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </article>

                </div>

                <aside class="prod-form-layout__aside">

                  <article class="prod-form-card prod-form-card--accent" aria-labelledby="prod-section-precios">
                    <header class="prod-form-card__head">
                      <h6 class="prod-form-card__title" id="prod-section-precios">Precios e stock</h6>
                    </header>
                    <div class="prod-price-grid">
                      <div class="prod-price-field">
                        <label class="prod-price-field__label" for="prod-costo">Costo</label>
                        <div class="input-group">
                          <span class="input-group-text">$</span>
                          <input type="number" id="prod-costo" class="form-control" required step="0.01" min="0" placeholder="0">
                        </div>
                      </div>
                      <div class="prod-price-field prod-price-field--highlight">
                        <label class="prod-price-field__label" for="prod-venta">Venta</label>
                        <div class="input-group">
                          <span class="input-group-text">$</span>
                          <input type="number" id="prod-venta" class="form-control fw-semibold" required step="0.01" min="0" placeholder="0">
                        </div>
                      </div>
                      <div class="prod-price-field">
                        <label class="prod-price-field__label" for="prod-minimo">Mínimo alerta</label>
                        <input type="number" id="prod-minimo" class="form-control" required min="0" value="3">
                      </div>
                    </div>
                    <div class="prod-stock-block d-none" id="prod-stock-wrapper">
                      <label class="prod-price-field__label" for="prod-stock-actual">Existencias (sede actual)</label>
                      <input type="number" id="prod-stock-actual" class="form-control prod-form-stock-input" readonly>
                      <p class="prod-form-card__desc mb-0 mt-2 d-none" id="admin-stock-note">Como administrador puede ajustar o poner en 0 este valor.</p>
                    </div>
                  </article>

                  <article class="prod-form-card" aria-labelledby="prod-section-propiedades">
                    <header class="prod-form-card__head">
                      <h6 class="prod-form-card__title" id="prod-section-propiedades">Comportamiento</h6>
                    </header>
                    <div class="prod-form-props">
                      <label class="prod-form-prop">
                        <input class="prod-form-prop__input" type="checkbox" id="prod-serie">
                        <span class="prod-form-prop__box">
                          <i class="ti ti-fingerprint" aria-hidden="true"></i>
                          <span class="prod-form-prop__text">
                            <strong>Serie / IMEI</strong>
                            <small>Una unidad = un serial</small>
                          </span>
                        </span>
                      </label>
                      <label class="prod-form-prop">
                        <input class="prod-form-prop__input" type="checkbox" id="prod-iva" checked>
                        <span class="prod-form-prop__box">
                          <i class="ti ti-receipt-tax" aria-hidden="true"></i>
                          <span class="prod-form-prop__text">
                            <strong>IVA 19%</strong>
                            <small>En ventas y factura</small>
                          </span>
                        </span>
                      </label>
                      <label class="prod-form-prop">
                        <input class="prod-form-prop__input" type="checkbox" id="prod-reacondicionado">
                        <span class="prod-form-prop__box">
                          <i class="ti ti-recycle" aria-hidden="true"></i>
                          <span class="prod-form-prop__text">
                            <strong>Reacondicionado</strong>
                            <small>Equipo usado o trade-in</small>
                          </span>
                        </span>
                      </label>
                    </div>
                  </article>

                </aside>
              </div>

            </div>
            <div class="modal-footer prod-form-modal__footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">
                <i class="ti ti-device-floppy me-1" aria-hidden="true"></i>
                Guardar producto
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Traslado de Stock -->
    <div class="modal modal-blur fade" id="modal-traslado" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Traslado de Inventario</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-traslado">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Seleccionar Producto</label>
                <select id="traslado-producto" class="form-select" required></select>
              </div>
              <div class="row">
                <div class="col-lg-6">
                  <div class="mb-3">
                    <label class="form-label">Sede Origen</label>
                    <select id="traslado-origen" class="form-select" required></select>
                  </div>
                </div>
                <div class="col-lg-6">
                  <div class="mb-3">
                    <label class="form-label">Sede Destino</label>
                    <select id="traslado-destino" class="form-select" required></select>
                  </div>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Cantidad a Trasladar</label>
                <input type="number" id="traslado-cantidad" class="form-control" required min="1">
              </div>
              <div class="mb-3">
                <label class="form-label">Motivo de Traslado</label>
                <input type="text" id="traslado-motivo" class="form-control" required placeholder="Ej: Abastecimiento Sede Norte">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-warning ms-auto">Proceder con el Traslado</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Importar CSV -->
    <div class="modal modal-blur fade" id="modal-csv" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Importar Catálogo por CSV</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-csv">
            <div class="modal-body">
              <div class="alert alert-info">
                El archivo debe tener las siguientes columnas en su cabecera:<br>
                <code>nombre,codigoBarras,descripcion,precioVenta,precioCosto,tieneIVA,stockMinimo,tieneNumeroSerie,esReacondicionado,categoriaNombre</code><br>
                <span class="small">La columna <code>codigoBarras</code> es opcional; si falta, se asigna un código interno (29…).</span>
              </div>
              <div class="mb-3">
                <label class="form-label">Seleccionar Archivo CSV</label>
                <input type="file" id="csv-file" class="form-control" accept=".csv" required>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-success ms-auto">Iniciar Importación</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Gestionar Categorías -->
    <div class="modal modal-blur fade" id="modal-categorias" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-md modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Gestionar Categorías</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <!-- Formulario para agregar -->
            <form id="form-crear-categoria" class="mb-4">
              <label class="form-label">Nueva Categoría</label>
              <div class="input-group">
                 <input type="text" id="cat-nombre-input" class="form-control" placeholder="Nombre de la categoría…" required spellcheck="false">
                <button type="submit" class="btn btn-primary">
                  <i class="ti ti-plus me-1"></i> Agregar
                </button>
              </div>
            </form>

            <label class="form-label">Categorías Existentes</label>
            <div class="border rounded-2" style="max-height: 250px; overflow-y: auto;">
              <table class="table table-vcenter card-table table-mobile-md mb-0">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th class="w-1">Acciones</th>
                  </tr>
                </thead>
                <tbody id="lista-categorias-body">
                  <tr>
                     <td colspan="2" class="text-center py-3 text-secondary">Cargando…</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-link link-secondary ms-auto" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Imprimir Etiqueta -->
    <div class="modal modal-blur fade" id="modal-etiqueta" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Imprimir etiqueta</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="text-secondary mb-3" id="etiqueta-producto-nombre">—</p>
            <div class="row g-3">
              <div class="col-sm-6">
                <label class="form-label" for="etiqueta-copias">Cantidad de copias</label>
                <input type="number" id="etiqueta-copias" class="form-control" min="1" max="99" value="1">
              </div>
              <div class="col-sm-6 d-flex align-items-end">
                <label class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="etiqueta-incluir-precio">
                  <span class="form-check-label">Incluir precio de venta</span>
                </label>
              </div>
            </div>
            <div class="barcode-label-preview mt-3" id="etiqueta-preview"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary ms-auto" id="btn-imprimir-etiqueta">
              <i class="ti ti-printer me-1"></i> Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>

    <div id="barcode-print-host" class="barcode-print-host" aria-hidden="true"></div>
  `;

  // Inicializar componentes de Bootstrap (Modales)
  const modalProd = new bootstrap.Modal(document.getElementById('modal-producto'));
  const modalTraslado = new bootstrap.Modal(document.getElementById('modal-traslado'));
  const modalEtiqueta = new bootstrap.Modal(document.getElementById('modal-etiqueta'));
  let etiquetaProductoActual = null;
  const modalCSV = new bootstrap.Modal(document.getElementById('modal-csv'));
  const modalCategorias = new bootstrap.Modal(document.getElementById('modal-categorias'));

  const selectSede = document.getElementById('select-sede-inventario');
  const searchInput = document.getElementById('search-inventario');

  const syncProdFormMeta = () => {
    const meta = document.getElementById('prod-form-meta');
    const chip = document.getElementById('prod-form-meta-codigo');
    const codigo = document.getElementById('prod-codigo')?.value.trim();
    if (!meta || !chip) return;
    if (codigo) {
      chip.textContent = codigo;
      meta.classList.remove('d-none');
    } else {
      chip.textContent = '';
      meta.classList.add('d-none');
    }
  };

  document.getElementById('prod-nombre')?.addEventListener('input', () => {
    const id = document.getElementById('producto-id').value;
    const nombre = document.getElementById('prod-nombre').value.trim();
    if (id) {
      document.getElementById('modal-producto-title').textContent = nombre || 'Editar producto';
    }
  });
  document.getElementById('prod-codigo')?.addEventListener('input', syncProdFormMeta);

  const updateEtiquetaPreview = () => {
    const preview = document.getElementById('etiqueta-preview');
    if (!preview || !etiquetaProductoActual) return;
    preview.innerHTML = renderBarcodePreview(etiquetaProductoActual, {
      includePrice: document.getElementById('etiqueta-incluir-precio')?.checked
    });
  };

  const openEtiquetaModal = (producto) => {
    etiquetaProductoActual = {
      nombre: producto.nombre,
      codigoBarras: producto.codigoBarras,
      precioVenta: producto.precioVenta
    };
    document.getElementById('etiqueta-producto-nombre').textContent = producto.nombre;
    document.getElementById('etiqueta-copias').value = '1';
    document.getElementById('etiqueta-incluir-precio').checked = false;
    updateEtiquetaPreview();
    modalEtiqueta.show();
  };

  document.getElementById('etiqueta-incluir-precio')?.addEventListener('change', updateEtiquetaPreview);
  document.getElementById('btn-imprimir-etiqueta')?.addEventListener('click', () => {
    if (!etiquetaProductoActual) return;
    const copies = parseInt(document.getElementById('etiqueta-copias').value, 10) || 1;
    printBarcodeLabels([etiquetaProductoActual], {
      copies: Math.min(99, Math.max(1, copies)),
      includePrice: document.getElementById('etiqueta-incluir-precio').checked
    });
  });

  // --- GESTIÓN DE SERIALES DESDE EL MODAL ---
  const loadModalSerials = async (productoId) => {
    const listBody = document.getElementById('modal-seriales-list-body');
    if (!listBody) return;
    listBody.innerHTML = `<tr><td colspan="2" class="text-center py-2"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></td></tr>`;
    
    try {
      const currentSedeId = selectSede.value || usuario.sedeId;
      const data = await apiFetch(`/series?producto=${productoId}`);
      const filtered = data.filter(s => s.sedeId === currentSedeId && s.estado === 'en_stock');
      
      if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="2" class="text-center text-secondary py-2">No hay seriales en stock para este producto en esta sede.</td></tr>`;
        return;
      }
      
      listBody.innerHTML = filtered.map(s => `
        <tr>
          <td><code class="fw-bold text-dark">${s.serie}</code></td>
          <td class="text-end px-3">
             <button type="button" class="btn btn-icon btn-ghost-danger btn-sm btn-delete-modal-serial" data-id="${s.id}" title="Eliminar Serial" aria-label="Eliminar serial">
              <i class="ti ti-trash"></i>
            </button>
          </td>
        </tr>
      `).join('');

      listBody.querySelectorAll('.btn-delete-modal-serial').forEach(btn => {
        btn.addEventListener('click', async () => {
          const serialId = btn.getAttribute('data-id');
          const confirmDelete = await showConfirm('Eliminar Serial', '¿Está seguro de eliminar este número de serie? Esto restará 1 unidad al stock.');
          if (confirmDelete) {
            try {
              await apiFetch(`/series/${serialId}`, { method: 'DELETE' });
              showToast('Éxito', 'Serial eliminado correctamente.', 'success');
              
              await loadModalSerials(productoId);
              
              const currentStockVal = parseStockInput(document.getElementById('prod-stock-actual').value);
              document.getElementById('prod-stock-actual').value = Math.max(0, currentStockVal - 1);
              
              loadInventario();
            } catch (err) {
              showToast('Error', err.message, 'error');
            }
          }
        });
      });
    } catch (err) {
      listBody.innerHTML = `<tr><td colspan="2" class="text-center text-danger py-2">Error al cargar seriales: ${err.message}</td></tr>`;
    }
  };

  // Inicializar listeners de seriales del modal
  setTimeout(() => {
    const modalTextarea = document.getElementById('modal-reg-imei');
    const modalCounter = document.getElementById('modal-seriales-counter');
    const btnAddSerials = document.getElementById('modal-btn-add-seriales');
    const switchSerie = document.getElementById('prod-serie');

    if (modalTextarea && modalCounter && btnAddSerials && switchSerie) {
      modalTextarea.addEventListener('input', (e) => {
        const text = e.target.value;
        const count = text.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0).length;
        modalCounter.textContent = `${count} detectados`;
      });

      btnAddSerials.addEventListener('click', async () => {
        const prodId = document.getElementById('producto-id').value;
        const currentSedeId = selectSede.value || usuario.sedeId;
        const textVal = modalTextarea.value.trim();
        
        const series = textVal.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0);
        if (series.length === 0) {
          showToast('Error', 'Por favor, ingrese al menos un número de serie válido.', 'error');
          return;
        }

        try {
          const res = await apiFetch('/series/bulk', {
            method: 'POST',
            body: JSON.stringify({ series, productoId: prodId, sedeId: currentSedeId })
          });
          showToast('Éxito', res.message, 'success');
          
          modalTextarea.value = '';
          modalCounter.textContent = '0 detectados';
          
          await loadModalSerials(prodId);
          
          const currentStockVal = parseStockInput(document.getElementById('prod-stock-actual').value);
          document.getElementById('prod-stock-actual').value = currentStockVal + series.length;
          
          loadInventario();
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
      });

      switchSerie.addEventListener('change', (e) => {
        const prodId = document.getElementById('producto-id').value;
        const secSeriales = document.getElementById('sec-gestion-seriales');
        if (e.target.checked && prodId) {
          secSeriales.classList.remove('d-none');
          loadModalSerials(prodId);
        } else {
          secSeriales.classList.add('d-none');
        }
      });
    }
  }, 100);

  // Cargar Categorías en formulario
  const loadCategoriasList = async (selectedId = null) => {
    try {
      const list = await apiFetch('/productos/categorias').catch(() => []);
      const selectCat = document.getElementById('prod-categoria');
      if (selectCat) {
        selectCat.innerHTML = list.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        if (selectedId) {
          selectCat.value = selectedId;
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  await loadCategoriasList();

  // Cargar datos iniciales
  const loadInventario = async () => {
    const sedeId = selectSede.value;
    const query = searchInput.value;

    const tbody = document.getElementById('inventario-table-body');
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const stock = await apiFetch(`/inventario/stock?sedeId=${sedeId}`);
      
      const filtered = stock.filter(item => {
        if (soloStockBajo && item.cantidad > item.producto.stockMinimo) return false;
        if (!query) return true;
        const q = query.toLowerCase();
        return item.producto.nombre.toLowerCase().includes(q) || item.producto.codigoBarras.toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        const emptyMsg = soloStockBajo
          ? 'No hay productos con stock bajo en esta sede.'
          : 'No se encontraron productos en el inventario.';
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">${emptyMsg}</td></tr>`;
        return;
      }

      const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

      tbody.innerHTML = filtered.map(item => {
        const prod = item.producto;
        const stockMin = prod.stockMinimo;
        const stockQty = item.cantidad;

        // Semáforo de stock
        let statusBadge = '';
        if (stockQty <= 0) {
          statusBadge = '<span class="badge bg-red-lt">Agotado</span>';
        } else if (stockQty <= stockMin) {
          statusBadge = '<span class="badge bg-yellow-lt">Bajo Stock</span>';
        } else {
          statusBadge = '<span class="badge bg-green-lt">Excelente</span>';
        }

        const imgHtml = prod.imagenUrl 
          ? `<img src="${prod.imagenUrl}" class="avatar avatar-sm me-2 rounded" style="object-fit: cover;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' fill=\\'none\\' stroke=\\'%23ccc\\' stroke-width=\\'2\\'><rect width=\\'20\\' height=\\'20\\' x=\\'2\\' y=\\'2\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\\'/></svg>';">` 
          : `<span class="avatar avatar-sm me-2 rounded bg-secondary-lt fw-bold">${prod.nombre.charAt(0).toUpperCase()}</span>`;

        const codigoInterno = isInternalBarcode(prod.codigoBarras)
          ? '<span class="badge bg-azure-lt ms-1">Interno</span>'
          : '';

        return `
          <tr>
            <td><code class="text-secondary">${prod.codigoBarras}</code>${codigoInterno}</td>
            <td class="fw-semibold">
              <div class="d-flex align-items-center">
                ${imgHtml}
                <div>${prod.nombre}</div>
              </div>
            </td>
            <td>${prod.categoria ? prod.categoria.nombre : 'General'}</td>
            <td>${formatter.format(prod.precioCosto)}</td>
            <td>${formatter.format(prod.precioVenta)}</td>
            <td class="text-center fw-bold ${stockQty <= stockMin ? 'text-danger' : 'text-success'}">${stockQty}</td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center">${prod.tieneNumeroSerie ? '<span class="badge bg-blue-lt">IMEI</span>' : '<span class="badge bg-secondary-lt">No aplica</span>'}</td>
            ${isAdminOrGerente ? `
              <td class="erp-td-actions">
                ${erpActions(`
                  ${erpAction('label', { className: 'btn-etiqueta', attrs: { 'data-id': item.productoId } })}
                  ${erpAction('edit', { className: 'btn-editar', attrs: { 'data-id': item.productoId } })}
                  ${erpAction('delete', { className: 'btn-eliminar', attrs: { 'data-id': item.productoId } })}
                `)}
              </td>
            ` : ''}
          </tr>
        `;
      }).join('');

      // Asignar click listeners
      document.querySelectorAll('.btn-etiqueta').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const item = stock.find(s => s.productoId === id);
          if (item?.producto) openEtiquetaModal(item.producto);
        });
      });

      document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          // Buscar producto en la lista
          const item = stock.find(s => s.productoId === id);
          if (item) {
            document.getElementById('producto-id').value = item.productoId;
            document.getElementById('prod-nombre').value = item.producto.nombre;
            document.getElementById('prod-codigo').value = item.producto.codigoBarras;
            document.getElementById('prod-descripcion').value = item.producto.descripcion || '';
            document.getElementById('prod-costo').value = item.producto.precioCosto;
            document.getElementById('prod-venta').value = item.producto.precioVenta;
            document.getElementById('prod-minimo').value = item.producto.stockMinimo;
            document.getElementById('prod-categoria').value = item.producto.categoriaId;
            document.getElementById('prod-serie').checked = item.producto.tieneNumeroSerie;
            document.getElementById('prod-iva').checked = item.producto.tieneIVA;
            document.getElementById('prod-reacondicionado').checked = item.producto.esReacondicionado;
            document.getElementById('prod-imagen-url').value = item.producto.imagenUrl || '';
            
            const stockInput = document.getElementById('prod-stock-actual');
            const adminNote = document.getElementById('admin-stock-note');
            stockInput.value = item.cantidad;
            document.getElementById('prod-stock-wrapper').classList.remove('d-none');

            if (['admin', 'superadmin'].includes(usuario.rol)) {
              stockInput.removeAttribute('readonly');
              adminNote.classList.remove('d-none');
            } else {
              stockInput.setAttribute('readonly', 'true');
              adminNote.classList.add('d-none');
            }
            
            // Mostrar u ocultar sección de seriales al abrir
            const secSeriales = document.getElementById('sec-gestion-seriales');
            if (item.producto.tieneNumeroSerie) {
              secSeriales.classList.remove('d-none');
              loadModalSerials(item.productoId);
            } else {
              secSeriales.classList.add('d-none');
            }

            document.getElementById('modal-producto-title').textContent = item.producto.nombre;
            syncProdFormMeta();
            modalProd.show();
          }
        });
      });

      document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const verificado = await showConfirm('Eliminar Producto', '¿Está seguro de eliminar este producto del catálogo de forma permanente?');
          if (verificado) {
            try {
              await apiFetch(`/productos/${id}`, { method: 'DELETE' });
              showToast('Éxito', 'Producto eliminado correctamente.', 'success');
              loadInventario();
            } catch (err) {
              showToast('Error', err.message, 'error');
            }
          }
        });
      });

    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error al cargar el inventario.</td></tr>`;
    }
  };

  // Event Listeners de Filtros
  selectSede.addEventListener('change', loadInventario);
  searchInput.addEventListener('input', loadInventario);

  // Botón Nuevo Producto
  if (isAdminOrGerente) {
    // Gestión de Categorías
    const btnGestionarCats = document.getElementById('btn-gestionar-categorias');
    if (btnGestionarCats) {
      const loadCategoriasPanel = async () => {
        const tbody = document.getElementById('lista-categorias-body');
        tbody.innerHTML = `<tr><td colspan="2" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></td></tr>`;
        try {
          const list = await apiFetch('/productos/categorias').catch(() => []);
          if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center py-3 text-secondary">No hay categorías registradas.</td></tr>`;
            return;
          }
          tbody.innerHTML = list.map(c => `
            <tr>
              <td>${c.nombre}</td>
              <td class="text-end">
                 <button class="btn btn-icon btn-ghost-danger btn-sm btn-eliminar-categoria" data-id="${c.id}" aria-label="Eliminar categoría">
                  <i class="ti ti-trash"></i>
                </button>
              </td>
            </tr>
          `).join('');

          // Escuchar botones de eliminar categoría
          tbody.querySelectorAll('.btn-eliminar-categoria').forEach(btn => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-id');
              const verificado = await showConfirm('Eliminar Categoría', '¿Está seguro de que desea eliminar esta categoría?');
              if (verificado) {
                try {
                  await apiFetch(`/productos/categorias/${id}`, { method: 'DELETE' });
                  showToast('Éxito', 'Categoría eliminada correctamente.', 'success');
                  loadCategoriasPanel();
                  await loadCategoriasList(); // Actualizar select en formulario de producto
                } catch (err) {
                  showToast('Error', err.message, 'error');
                }
              }
            });
          });
        } catch (err) {
          tbody.innerHTML = `<tr><td colspan="2" class="text-center py-3 text-danger">Error al cargar categorías.</td></tr>`;
        }
      };

      btnGestionarCats.addEventListener('click', () => {
        loadCategoriasPanel();
        modalCategorias.show();
      });

      document.getElementById('form-crear-categoria').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombreInput = document.getElementById('cat-nombre-input');
        const nombre = nombreInput.value.trim();
        if (!nombre) return;

        try {
          await apiFetch('/productos/categorias', {
            method: 'POST',
            body: JSON.stringify({ nombre })
          });
          nombreInput.value = '';
          showToast('Éxito', 'Categoría creada exitosamente.', 'success');
          loadCategoriasPanel();
          await loadCategoriasList(); // Actualizar select en formulario de producto
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
      });
    }

    document.getElementById('btn-generar-codigo')?.addEventListener('click', async () => {
      try {
        const { codigoBarras } = await apiFetch('/productos/generar-codigo');
        document.getElementById('prod-codigo').value = codigoBarras;
        syncProdFormMeta();
        showToast('Código generado', `Código interno: ${codigoBarras}`, 'success');
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    });

    document.getElementById('btn-nuevo-producto').addEventListener('click', () => {
      document.getElementById('form-producto').reset();
      document.getElementById('producto-id').value = '';
      document.getElementById('prod-stock-wrapper').classList.add('d-none');
      document.getElementById('sec-gestion-seriales').classList.add('d-none');
      document.getElementById('modal-producto-title').textContent = 'Crear producto';
      syncProdFormMeta();
      modalProd.show();
    });

    // Submit formulario de producto
    document.getElementById('form-producto').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('producto-id').value;
      const codigoRaw = document.getElementById('prod-codigo').value.trim();
      const data = {
        nombre: document.getElementById('prod-nombre').value,
        descripcion: document.getElementById('prod-descripcion').value,
        precioCosto: parseFloat(document.getElementById('prod-costo').value),
        precioVenta: parseFloat(document.getElementById('prod-venta').value),
        stockMinimo: parseInt(document.getElementById('prod-minimo').value),
        categoriaId: document.getElementById('prod-categoria').value,
        tieneNumeroSerie: document.getElementById('prod-serie').checked,
        tieneIVA: document.getElementById('prod-iva').checked,
        esReacondicionado: document.getElementById('prod-reacondicionado').checked,
        imagenUrl: document.getElementById('prod-imagen-url').value.trim() || null,
        ajusteStock: ['admin', 'superadmin'].includes(usuario.rol) ? parseStockInput(document.getElementById('prod-stock-actual').value) : null,
        sedeId: (document.getElementById('select-sede-inventario') ? document.getElementById('select-sede-inventario').value : null) || usuario.sedeId
      };
      if (codigoRaw) {
        data.codigoBarras = codigoRaw;
      }

      try {
        if (id) {
          await apiFetch(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
          showToast('Éxito', 'Producto actualizado correctamente.', 'success');
        } else {
          const created = await apiFetch('/productos', { method: 'POST', body: JSON.stringify(data) });
          if (!codigoRaw && created?.codigoBarras) {
            showToast('Producto creado', `Código interno asignado: ${created.codigoBarras}`, 'success');
          } else {
            showToast('Éxito', 'Producto creado correctamente.', 'success');
          }
        }
        modalProd.hide();
        loadInventario();
      } catch (err) {
        alert(err.message);
      }
    });

    // Botón Traslado
    document.getElementById('btn-traslado').addEventListener('click', async () => {
      // Cargar productos en el select de traslados
      try {
        const productos = await apiFetch('/productos');
        const selectProd = document.getElementById('traslado-producto');
        selectProd.innerHTML = productos.map(p => `<option value="${p.id}">${p.nombre} (${p.codigoBarras})</option>`).join('');

        const selectOrig = document.getElementById('traslado-origen');
        const selectDest = document.getElementById('traslado-destino');

        const sedesOptions = dataSedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
        selectOrig.innerHTML = sedesOptions;
        selectDest.innerHTML = sedesOptions;

        // Seleccionar sede del usuario por defecto en origen
        selectOrig.value = usuario.sedeId;

        modalTraslado.show();
      } catch (err) {
        alert(err.message);
      }
    });

    // Submit traslado
    document.getElementById('form-traslado').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        productoId: document.getElementById('traslado-producto').value,
        sedeOrigenId: document.getElementById('traslado-origen').value,
        sedeDestinoId: document.getElementById('traslado-destino').value,
        cantidad: parseInt(document.getElementById('traslado-cantidad').value),
        motivo: document.getElementById('traslado-motivo').value
      };

      try {
        await apiFetch('/inventario/traslado', { method: 'POST', body: JSON.stringify(data) });
        modalTraslado.hide();
        loadInventario();
      } catch (err) {
        alert(err.message);
      }
    });

    // Botón Importar CSV
    document.getElementById('btn-importar-csv').addEventListener('click', () => {
      document.getElementById('form-csv').reset();
      modalCSV.show();
    });

    // Submit CSV
    document.getElementById('form-csv').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('csv-file');
      if (fileInput.files.length === 0) return;

      const formData = new FormData();
      formData.append('archivo', fileInput.files[0]);

      // Fetch normal porque es un FormData (no JSON)
      const token = localStorage.getItem('token');
      try {
        const response = await fetch('/api/productos/importar-csv', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Error al importar catálogo.');
        }

        alert(data.message);
        modalCSV.hide();
        loadInventario();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Primera carga
  await loadInventario();
}

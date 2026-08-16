import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { showToast, showConfirm } from '../utils/toast.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';
import { printBarcodeLabels, renderBarcodePreview, isInternalBarcode } from '../utils/barcode-label.js';
import { formatStockUnidad, normalizeUnidadMedida } from '../utils/unidad-medida.js';
import { getLocalDateStr } from '../utils/date.js';

let dataSedes = [];
let inventarioKeydownHandler = null;

export async function initInventario(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  const canViewMovementHistory = ['admin', 'superadmin', 'gerente_sede', 'contador'].includes(usuario.rol);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

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
    <div class="container-xl erp-module inv-module">
      ${erpHeader({
        title: 'Catálogo y existencias',
        subtitle: 'Escanea o busca · stock por sede',
        actionsHtml: isAdminOrGerente ? `
          <div class="btn-list inv-header-actions">
            <button id="btn-nuevo-producto" class="btn btn-primary">
              <i class="ti ti-plus me-1"></i> Nuevo
            </button>
            <button id="btn-traslado" class="btn btn-warning">
              <i class="ti ti-arrows-left-right me-1"></i> Traslado
            </button>
            <div class="dropdown">
              <button type="button" class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                Más
              </button>
              <div class="dropdown-menu dropdown-menu-end">
                <button type="button" class="dropdown-item" id="btn-gestionar-categorias" data-bs-toggle="modal" data-bs-target="#modal-categorias">
                  <i class="ti ti-tags me-2"></i> Organizar categorías
                </button>
                <button type="button" class="dropdown-item" id="btn-importar-csv">
                  <i class="ti ti-file-upload me-2"></i> Importar CSV
                </button>
              </div>
            </div>
          </div>
        ` : ''
      })}

      <ul class="nav nav-tabs mb-3 d-print-none inv-module-tabs" data-bs-toggle="tabs" role="tablist">
        <li class="nav-item" role="presentation">
          <a href="#tab-inventario-catalogo" class="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab"><i class="ti ti-package me-1"></i>Catálogo</a>
        </li>
        ${canViewMovementHistory ? `
          <li class="nav-item" role="presentation">
            <a href="#tab-inventario-movimientos" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1"><i class="ti ti-arrows-exchange me-1"></i>Movimientos</a>
          </li>
        ` : ''}
      </ul>
      <div class="tab-content">
      <div class="tab-pane active show" id="tab-inventario-catalogo" role="tabpanel">
      <div class="erp-list-workspace">
      <div class="card erp-filter-card d-print-none" role="search">
        <div class="card-body">
          <div class="row g-2 align-items-end">
            <div class="col-6 col-md-2">
              <label class="form-label" for="select-sede-inventario">Sede</label>
              <select id="select-sede-inventario" class="form-select">
                ${dataSedes.map(s => `<option value="${s.id}" ${s.id === (usuario.sedeId || dataSedes[0]?.id) ? 'selected' : ''}>${s.nombre}</option>`).join('')}
              </select>
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label" for="filtro-categoria-inventario">Categoría</label>
              <select id="filtro-categoria-inventario" class="form-select">
                <option value="">Todas</option>
              </select>
            </div>
            <div class="col-12 col-md-3">
              <label class="form-label" for="search-inventario">Buscar / escanear</label>
              <div class="inv-scan-input">
                <i class="ti ti-barcode inv-scan-input__icon" aria-hidden="true"></i>
                <input type="text" id="search-inventario" class="form-control" placeholder="Nombre o código de barras…" spellcheck="false" autocomplete="off">
              </div>
            </div>
            <div class="col-12 col-md d-flex align-items-end">
              <div class="inv-filter-inline w-100">
                <div class="inv-chips" role="group" aria-label="Estado de stock">
                  <button type="button" class="inv-chip is-active" data-stock="todos">Todos <span class="inv-chip__n" data-stock-n="todos"></span></button>
                  <button type="button" class="inv-chip" data-stock="ok">OK <span class="inv-chip__n" data-stock-n="ok"></span></button>
                  <button type="button" class="inv-chip" data-stock="bajo" title="Con stock, pero en o bajo el mínimo">Bajo <span class="inv-chip__n" data-stock-n="bajo"></span></button>
                  <button type="button" class="inv-chip" data-stock="agotado" title="Sin unidades en esta sede">Agotado <span class="inv-chip__n" data-stock-n="agotado"></span></button>
                </div>
                <div class="inv-chips" role="group" aria-label="Tipo de producto">
                  <button type="button" class="inv-chip" data-serie="imei" aria-pressed="false">IMEI</button>
                  <button type="button" class="inv-chip" data-interno="1" aria-pressed="false">Interno</button>
                </div>
                <div class="inv-filter-meta">
                  <span class="inv-result-count" id="inv-result-count" aria-live="polite"></span>
                  <button type="button" class="btn btn-sm btn-ghost-secondary inv-clear-filters" id="btn-limpiar-filtros-inv" title="Limpiar filtros">
                    <i class="ti ti-x me-1"></i>Limpiar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card erp-table-panel inv-ledger">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover mb-0">
            <thead>
              <tr>
                <th>SKU / código</th>
                <th>Producto</th>
                <th>Cat.</th>
                <th class="text-end">Costo</th>
                <th class="text-end">Venta</th>
                <th class="text-end">Stock</th>
                <th class="text-center">Estado</th>
                <th class="text-center">Serie</th>
                ${isAdminOrGerente ? `<th class="w-1 text-end">Acciones</th>` : ''}
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
      </div>

      ${canViewMovementHistory ? `
        <div class="tab-pane" id="tab-inventario-movimientos" role="tabpanel">
          <div class="erp-list-workspace movimiento-workspace">
            <div class="card erp-filter-card">
              <div class="card-body">
                <form id="form-filtros-movimientos-inventario" class="row g-2 align-items-end">
                  ${['admin', 'superadmin'].includes(usuario.rol) ? `
                    <div class="col-md-3">
                      <label class="form-label" for="mov-inv-sede">Sede</label>
                      <select id="mov-inv-sede" class="form-select">
                        <option value="">Todas las sedes</option>
                        ${dataSedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                      </select>
                    </div>
                  ` : `<input type="hidden" id="mov-inv-sede" value="">`}
                  <div class="col-6 col-md-2">
                    <label class="form-label" for="mov-inv-desde">Desde</label>
                    <input type="date" id="mov-inv-desde" class="form-control">
                  </div>
                  <div class="col-6 col-md-2">
                    <label class="form-label" for="mov-inv-hasta">Hasta</label>
                    <input type="date" id="mov-inv-hasta" class="form-control">
                  </div>
                  <div class="col-md-3">
                    <label class="form-label" for="mov-inv-producto">Producto</label>
                    <select id="mov-inv-producto" class="form-select"><option value="">Todos los productos</option></select>
                  </div>
                  <div class="col-md-2">
                    <label class="form-label" for="mov-inv-tipo">Tipo</label>
                    <select id="mov-inv-tipo" class="form-select">
                      <option value="">Todos</option>
                      <option value="entrada">Entrada</option>
                      <option value="salida">Salida</option>
                      <option value="traslado_entrada">Traslado recibido</option>
                      <option value="traslado_salida">Traslado enviado</option>
                      <option value="ajuste">Ajuste</option>
                    </select>
                  </div>
                  <div class="col-md-2 d-flex align-items-end">
                    <button type="submit" class="btn btn-primary w-100 erp-filter-submit"><i class="ti ti-filter me-1"></i>Filtrar</button>
                  </div>
                </form>
              </div>
            </div>
            <div class="card erp-table-panel movimiento-panel">
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover mb-0 movimiento-table">
                  <thead>
                    <tr>
                      <th>Fecha y hora</th>
                      <th>Movimiento</th>
                      <th>Producto</th>
                      <th class="text-end">Unidades</th>
                      <th>Responsable</th>
                      <th>Referencia</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="movimientos-inventario-tbody">
                    <tr><td colspan="7" class="text-center py-4 text-secondary">Seleccione un período para consultar movimientos.</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="movimiento-pagination" id="movimientos-inventario-pagination" hidden>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="mov-inv-prev" title="Página anterior" aria-label="Página anterior"><i class="ti ti-chevron-left"></i></button>
                <span id="mov-inv-page-info" class="text-secondary small"></span>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="mov-inv-next" title="Página siguiente" aria-label="Página siguiente"><i class="ti ti-chevron-right"></i></button>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
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
                      <div class="col-12">
                        <label class="form-label" for="prod-nombre">Nombre del producto</label>
                        <input type="text" id="prod-nombre" class="form-control form-control-lg prod-form-input-title" required placeholder="Ej: Disco duro SSD 1 TB">
                      </div>
                      <div class="col-12">
                        <div class="prod-cat-picker" id="prod-cat-picker">
                          <div class="prod-cat-picker__label-row">
                            <label class="form-label mb-0" for="prod-cat-trigger">Categoría</label>
                            <span class="prod-cat-picker__hint">Clic para abrir el catálogo de estantes</span>
                          </div>
                          <input type="hidden" id="prod-categoria" value="" autocomplete="off">
                          <button type="button" class="prod-cat-picker__trigger" id="prod-cat-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="prod-cat-sheet">
                            <span class="prod-cat-picker__mark" aria-hidden="true"><i class="ti ti-tags"></i></span>
                            <span class="prod-cat-picker__text">
                              <span class="prod-cat-picker__leaf" id="prod-cat-leaf">Elegir categoría…</span>
                              <span class="prod-cat-picker__path d-none" id="prod-cat-path"></span>
                            </span>
                            <span class="prod-cat-picker__open">
                              <i class="ti ti-layout-sidebar" aria-hidden="true"></i>
                              <span>Abrir</span>
                            </span>
                          </button>
                        </div>
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
                      <p class="prod-form-card__desc">Cada unidad con IMEI o serial propio se registra aparte del código de catálogo. En productos nuevos, los seriales quedan en cola hasta Guardar.</p>
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
                      <div class="prod-price-field">
                        <label class="prod-price-field__label" for="prod-unidad">Unidad de medida</label>
                        <select id="prod-unidad" class="form-select">
                          <option value="und">und (pieza)</option>
                          <option value="m">m (metro)</option>
                        </select>
                      </div>
                    </div>
                    <p class="prod-form-card__desc mb-0 mt-2" id="prod-unidad-hint">
                      En metros, 1 und de stock = 1 metro. Precio costo/venta es por metro.
                    </p>
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
                        <input class="prod-form-prop__input" type="checkbox" id="prod-iva">
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
                      <label class="prod-form-prop">
                        <input class="prod-form-prop__input" type="checkbox" id="prod-servicio">
                        <span class="prod-form-prop__box">
                          <i class="ti ti-tool" aria-hidden="true"></i>
                          <span class="prod-form-prop__text">
                            <strong>Es servicio</strong>
                            <small>No descuenta inventario (mano de obra)</small>
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

          <!-- Panel interno (sin 2.º modal Bootstrap → evita pantalla negra) -->
          <div class="prod-cat-sheet" id="prod-cat-sheet" hidden>
            <div class="prod-cat-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="modal-prod-categoria-title">
              <header class="prod-cat-sheet__header">
                <div>
                  <p class="prod-cat-modal__eyebrow mb-0">Inventario · estante</p>
                  <h5 class="modal-title" id="modal-prod-categoria-title">Elegir categoría</h5>
                  <p class="prod-cat-modal__lede mb-0" id="prod-cat-modal-count">Busca o elige el estante del producto</p>
                </div>
                <button type="button" class="btn-close" id="btn-prod-cat-sheet-close" aria-label="Cerrar"></button>
              </header>
              <div class="prod-cat-sheet__body">
                <div class="prod-cat-modal__search">
                  <i class="ti ti-search" aria-hidden="true"></i>
                  <input type="search" id="prod-cat-search" class="form-control" placeholder="Buscar… ej. cables, parlantes, tinta" autocomplete="off" spellcheck="false" aria-label="Buscar categoría">
                </div>
                <div class="prod-cat-picker__rails" id="prod-cat-rails" aria-label="Categorías frecuentes"></div>
                <ul class="prod-cat-picker__list" id="prod-cat-list" role="listbox" aria-label="Categorías"></ul>
                <p class="prod-cat-picker__empty d-none" id="prod-cat-empty">Sin coincidencias. Prueba otra palabra o créala en Organizar categorías.</p>
              </div>
              <footer class="prod-cat-sheet__footer">
                <button type="button" class="btn btn-outline-secondary ms-auto" id="btn-prod-cat-sheet-done">Listo</button>
              </footer>
            </div>
          </div>
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

    <!-- Modal Organizar Categorías -->
    <div class="modal modal-blur fade" id="modal-categorias" tabindex="-1" role="dialog" aria-labelledby="modal-categorias-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content inv-cat-modal">
          <div class="modal-header inv-cat-modal__header">
            <div class="inv-cat-modal__intro">
              <p class="inv-cat-modal__eyebrow mb-0">Inventario · estantes</p>
              <h5 class="modal-title" id="modal-categorias-title">Organizar categorías</h5>
              <p class="inv-cat-modal__lede mb-0">Crea, renombra o limpia vacías del catálogo</p>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body inv-cat-modal__body">
            <form id="form-crear-categoria" class="inv-cat-create" autocomplete="off">
              <label class="inv-cat-create__label" for="cat-nombre-input">Nueva categoría</label>
              <div class="inv-cat-create__row">
                <input type="text" id="cat-nombre-input" class="form-control inv-cat-create__input" placeholder="Ej. Cables · o Servitec Gamers / Accesorios" required spellcheck="false" autocomplete="off">
                <button type="submit" class="btn btn-primary inv-cat-create__btn">
                  <i class="ti ti-plus" aria-hidden="true"></i>
                  <span>Crear</span>
                </button>
              </div>
            </form>

            <div class="inv-cat-toolbar">
              <div class="inv-cat-search">
                <i class="ti ti-search" aria-hidden="true"></i>
                <input type="search" id="inv-cat-filter" class="form-control" placeholder="Buscar estante…" autocomplete="off" spellcheck="false" aria-label="Buscar categoría">
              </div>
              <button type="button" class="inv-chip" id="inv-cat-solo-vacias" aria-pressed="false" title="Mostrar solo categorías sin productos">
                Solo vacías
              </button>
              <span class="inv-cat-toolbar__meta" id="inv-cat-list-meta"></span>
            </div>

            <div class="inv-cat-list-wrap" id="lista-categorias-body" role="list" aria-label="Categorías">
              <div class="inv-cat-list-status text-secondary">Cargando…</div>
            </div>
          </div>
          <div class="modal-footer inv-cat-modal__footer">
            <button type="button" class="btn btn-outline-secondary ms-auto" data-bs-dismiss="modal">Listo</button>
          </div>

          <!-- Sheet interno (sin 2.º modal Bootstrap → evita pantalla negra) -->
          <div class="inv-cat-sheet" id="inv-cat-reasignar-sheet" hidden>
            <div class="inv-cat-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="inv-cat-reasignar-title">
              <header class="inv-cat-sheet__header">
                <div>
                  <p class="inv-cat-modal__eyebrow mb-0">Antes de eliminar</p>
                  <h5 class="modal-title" id="inv-cat-reasignar-title">Reasignar productos</h5>
                  <p class="inv-cat-modal__lede mb-0" id="cat-reasignar-msg">Esta categoría tiene productos.</p>
                </div>
                <button type="button" class="btn-close" id="btn-cat-reasignar-close" aria-label="Cerrar"></button>
              </header>
              <div class="inv-cat-sheet__body">
                <label class="form-label" for="cat-reasignar-destino">Mover productos a</label>
                <select id="cat-reasignar-destino" class="form-select"></select>
              </div>
              <footer class="inv-cat-sheet__footer">
                <button type="button" class="btn btn-link link-secondary" id="btn-cat-reasignar-cancel">Cancelar</button>
                <button type="button" class="btn btn-danger" id="btn-cat-reasignar-confirm">Eliminar categoría</button>
              </footer>
            </div>
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
            <p class="text-secondary mb-1" id="etiqueta-producto-nombre">—</p>
            <p class="text-secondary small mb-3">Optimizado para impresora térmica de etiquetas adhesivas <strong>58×40 mm</strong> (USB económica).</p>
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

    <div class="modal modal-blur fade" id="modal-detalle-movimiento-inventario" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content" id="detalle-movimiento-inventario-content"></div>
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
  const modalDetalleMovimientoInventario = canViewMovementHistory
    ? new bootstrap.Modal(document.getElementById('modal-detalle-movimiento-inventario'))
    : null;
  let catPendingDelete = null;

  /** Quita backdrops huérfanos de modales anidados rotos (pantalla negra). */
  const scrubOrphanModalBackdrops = () => {
    const openModals = document.querySelectorAll('.modal.show').length;
    const backdrops = [...document.querySelectorAll('.modal-backdrop')];
    if (openModals === 0) {
      backdrops.forEach((el) => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');
      return;
    }
    while (backdrops.length > openModals) {
      backdrops.pop()?.remove();
    }
  };
  scrubOrphanModalBackdrops();

  const selectSede = document.getElementById('select-sede-inventario');
  const searchInput = document.getElementById('search-inventario');
  const selectCategoria = document.getElementById('filtro-categoria-inventario');
  const resultCountEl = document.getElementById('inv-result-count');
  const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros-inv');

  let stockCache = [];
  let stockCacheSedeId = null;
  let filtroStock = soloStockBajo ? 'bajo' : 'todos';
  let filtroSerie = false;
  let filtroInterno = false;
  let movimientosInventarioLoaded = false;
  let movimientosInventarioPage = 1;
  let movimientosInventarioCache = [];
  let movimientosInventarioMeta = { page: 1, totalPages: 1, total: 0 };

  const formatMovimientoFecha = (fecha) => {
    const date = new Date(fecha);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-CO', {
      dateStyle: 'short', timeStyle: 'short'
    });
  };

  const setDefaultMovimientoFechas = () => {
    const hasta = getLocalDateStr();
    const desdeDate = new Date();
    desdeDate.setDate(desdeDate.getDate() - 30);
    const desde = getLocalDateStr(desdeDate);
    const desdeEl = document.getElementById('mov-inv-desde');
    const hastaEl = document.getElementById('mov-inv-hasta');
    if (desdeEl && !desdeEl.value) desdeEl.value = desde;
    if (hastaEl && !hastaEl.value) hastaEl.value = hasta;
  };

  const movimientoTipoLabel = (tipo) => ({
    entrada: 'Entrada',
    salida: 'Salida',
    traslado_entrada: 'Traslado recibido',
    traslado_salida: 'Traslado enviado',
    ajuste: 'Ajuste'
  })[tipo] || tipo;

  const loadMovimientoProductos = async () => {
    const select = document.getElementById('mov-inv-producto');
    if (!select || select.dataset.loaded) return;
    try {
      const productos = await apiFetch('/productos');
      select.innerHTML = `<option value="">Todos los productos</option>${productos.map((producto) =>
        `<option value="${producto.id}">${escapeHtml(producto.nombre)}${producto.codigoBarras ? ` · ${escapeHtml(producto.codigoBarras)}` : ''}</option>`
      ).join('')}`;
      select.dataset.loaded = '1';
    } catch (error) {
      console.error('No se pudieron cargar los productos para el historial:', error);
    }
  };

  const renderMovimientosInventario = (data) => {
    const tbody = document.getElementById('movimientos-inventario-tbody');
    const pagination = document.getElementById('movimientos-inventario-pagination');
    if (!tbody || !pagination) return;
    movimientosInventarioCache = data.items || [];
    movimientosInventarioMeta = data.pagination || movimientosInventarioMeta;

    if (!movimientosInventarioCache.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-secondary">No hay movimientos de inventario para los filtros seleccionados.</td></tr>';
      pagination.hidden = true;
      return;
    }

    tbody.innerHTML = movimientosInventarioCache.map((movimiento) => {
      const isEntrada = movimiento.direccion === 'entrada';
      const directionClass = isEntrada ? 'movimiento-direction--in' : 'movimiento-direction--out';
      const directionIcon = isEntrada ? 'ti-arrow-down-left' : 'ti-arrow-up-right';
      return `
        <tr class="movimiento-row">
          <td class="text-nowrap text-secondary small">${escapeHtml(formatMovimientoFecha(movimiento.fecha))}</td>
          <td><span class="movimiento-direction ${directionClass}"><i class="ti ${directionIcon}"></i>${isEntrada ? 'Entrada' : 'Salida'}</span></td>
          <td>
            <div class="fw-semibold">${escapeHtml(movimiento.producto)}</div>
            <div class="small text-secondary">${escapeHtml(movimientoTipoLabel(movimiento.tipo))} · ${escapeHtml(movimiento.codigo)}</div>
          </td>
          <td class="text-end text-nowrap fw-bold ${isEntrada ? 'text-success' : 'text-danger'}">${isEntrada ? '+' : '−'}${escapeHtml(movimiento.cantidad)}</td>
          <td>${escapeHtml(movimiento.responsable)}</td>
          <td><code class="small">${escapeHtml(movimiento.referencia)}</code></td>
          <td class="text-end erp-td-actions">${erpAction('view', { className: 'btn-ver-movimiento-inventario', attrs: { 'data-id': movimiento.id }, label: 'Ver detalle' })}</td>
        </tr>
      `;
    }).join('');

    pagination.hidden = false;
    document.getElementById('mov-inv-page-info').textContent = `Página ${movimientosInventarioMeta.page} de ${movimientosInventarioMeta.totalPages} · ${movimientosInventarioMeta.total} movimientos`;
    document.getElementById('mov-inv-prev').disabled = movimientosInventarioMeta.page <= 1;
    document.getElementById('mov-inv-next').disabled = movimientosInventarioMeta.page >= movimientosInventarioMeta.totalPages;
    tbody.querySelectorAll('.btn-ver-movimiento-inventario').forEach((button) => {
      button.addEventListener('click', () => openDetalleMovimientoInventario(button.dataset.id));
    });
  };

  const loadMovimientosInventario = async (page = 1) => {
    if (!canViewMovementHistory) return;
    movimientosInventarioPage = page;
    setDefaultMovimientoFechas();
    const tbody = document.getElementById('movimientos-inventario-tbody');
    const pagination = document.getElementById('movimientos-inventario-pagination');
    if (!tbody || !pagination) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></td></tr>';
    pagination.hidden = true;
    try {
      await loadMovimientoProductos();
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      const sede = document.getElementById('mov-inv-sede')?.value;
      const desde = document.getElementById('mov-inv-desde')?.value;
      const hasta = document.getElementById('mov-inv-hasta')?.value;
      const productoId = document.getElementById('mov-inv-producto')?.value;
      const tipo = document.getElementById('mov-inv-tipo')?.value;
      if (sede) params.set('sede', sede);
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      if (productoId) params.set('productoId', productoId);
      if (tipo) params.set('tipo', tipo);
      renderMovimientosInventario(await apiFetch(`/inventario/movimientos?${params.toString()}`));
      movimientosInventarioLoaded = true;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error al cargar movimientos: ${escapeHtml(error.message)}</td></tr>`;
    }
  };

  const openDetalleMovimientoInventario = (id) => {
    const movimiento = movimientosInventarioCache.find((item) => item.id === id);
    if (!movimiento || !modalDetalleMovimientoInventario) return;
    const isEntrada = movimiento.direccion === 'entrada';
    const content = document.getElementById('detalle-movimiento-inventario-content');
    content.innerHTML = `
      <div class="modal-header">
        <div>
          <p class="text-secondary small mb-1">Movimiento de inventario</p>
          <h5 class="modal-title mb-0">${escapeHtml(movimiento.producto)}</h5>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
      </div>
      <div class="modal-body">
        <div class="movimiento-detail-amount ${isEntrada ? 'movimiento-detail-amount--in' : 'movimiento-detail-amount--out'}">
          <span>${isEntrada ? 'Entrada' : 'Salida'}</span>
          <strong>${isEntrada ? '+' : '−'}${escapeHtml(movimiento.cantidad)} unidades</strong>
        </div>
        <dl class="movimiento-detail-grid mb-0">
          <div><dt>Fecha y hora</dt><dd>${escapeHtml(formatMovimientoFecha(movimiento.fecha))}</dd></div>
          <div><dt>Tipo</dt><dd>${escapeHtml(movimientoTipoLabel(movimiento.tipo))}</dd></div>
          <div><dt>Responsable</dt><dd>${escapeHtml(movimiento.responsable)}</dd></div>
          <div><dt>Referencia</dt><dd>${escapeHtml(movimiento.referencia)}</dd></div>
          <div class="movimiento-detail-grid__wide"><dt>Motivo</dt><dd>${escapeHtml(movimiento.detalle)}</dd></div>
        </dl>
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-outline-secondary ms-auto" data-bs-dismiss="modal">Cerrar</button></div>
    `;
    modalDetalleMovimientoInventario.show();
  };

  document.getElementById('form-filtros-movimientos-inventario')?.addEventListener('submit', (event) => {
    event.preventDefault();
    loadMovimientosInventario(1);
  });
  document.getElementById('mov-inv-prev')?.addEventListener('click', () => {
    if (movimientosInventarioMeta.page > 1) loadMovimientosInventario(movimientosInventarioMeta.page - 1);
  });
  document.getElementById('mov-inv-next')?.addEventListener('click', () => {
    if (movimientosInventarioMeta.page < movimientosInventarioMeta.totalPages) loadMovimientosInventario(movimientosInventarioMeta.page + 1);
  });
  document.querySelector('a[href="#tab-inventario-movimientos"]')?.addEventListener('shown.bs.tab', () => {
    if (!movimientosInventarioLoaded) loadMovimientosInventario(1);
  });

  const stockStatusOf = (item) => {
    const qty = item.cantidad;
    const min = item.producto?.stockMinimo ?? 0;
    if (qty <= 0) return 'agotado';
    if (qty <= min) return 'bajo';
    return 'ok';
  };

  const syncStockChips = () => {
    document.querySelectorAll('.inv-chip[data-stock]').forEach((chip) => {
      chip.classList.toggle('is-active', chip.getAttribute('data-stock') === filtroStock);
    });
  };

  const syncToggleChip = (selector, on) => {
    const chip = document.querySelector(selector);
    if (!chip) return;
    chip.classList.toggle('is-active', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  syncStockChips();
  if (soloStockBajo) {
    syncToggleChip('.inv-chip[data-stock="bajo"]', true);
  }

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

  const syncProdUnidadHint = () => {
    const hint = document.getElementById('prod-unidad-hint');
    const unidad = normalizeUnidadMedida(document.getElementById('prod-unidad')?.value);
    if (!hint) return;
    hint.textContent = unidad === 'm'
      ? 'En metros, 1 und de stock = 1 metro. Precio costo/venta es por metro.'
      : 'Unidad por pieza. El stock y los precios son por und.';
  };

  document.getElementById('prod-nombre')?.addEventListener('input', () => {
    const id = document.getElementById('producto-id').value;
    const nombre = document.getElementById('prod-nombre').value.trim();
    if (id) {
      document.getElementById('modal-producto-title').textContent = nombre || 'Editar producto';
    }
  });
  document.getElementById('prod-codigo')?.addEventListener('input', syncProdFormMeta);
  document.getElementById('prod-unidad')?.addEventListener('change', syncProdUnidadHint);

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
  /** Seriales encolados al crear producto (aún sin id); se envían con /series/bulk al Guardar. */
  let pendingSerials = [];

  const parseSerialText = (text) =>
    String(text || '')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const renderPendingSerials = () => {
    const listBody = document.getElementById('modal-seriales-list-body');
    if (!listBody) return;

    if (pendingSerials.length === 0) {
      listBody.innerHTML = `<tr><td colspan="2" class="text-center text-secondary py-2">Agrega seriales arriba; se registrarán al guardar el producto.</td></tr>`;
      return;
    }

    listBody.innerHTML = pendingSerials.map((serie, idx) => `
      <tr>
        <td>
          <code class="fw-bold text-dark">${serie}</code>
          <span class="badge bg-azure-lt ms-2">Pendiente</span>
        </td>
        <td class="text-end px-3">
          <button type="button" class="btn btn-icon btn-ghost-danger btn-sm btn-remove-pending-serial" data-idx="${idx}" title="Quitar" aria-label="Quitar serial pendiente">
            <i class="ti ti-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');

    listBody.querySelectorAll('.btn-remove-pending-serial').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (!Number.isNaN(idx)) {
          pendingSerials.splice(idx, 1);
          renderPendingSerials();
        }
      });
    });
  };

  const clearPendingSerials = () => {
    pendingSerials = [];
    const modalTextarea = document.getElementById('modal-reg-imei');
    const modalCounter = document.getElementById('modal-seriales-counter');
    if (modalTextarea) modalTextarea.value = '';
    if (modalCounter) modalCounter.textContent = '0 detectados';
  };

  const syncSerialSectionVisibility = () => {
    const switchSerie = document.getElementById('prod-serie');
    const secSeriales = document.getElementById('sec-gestion-seriales');
    if (!switchSerie || !secSeriales) return;

    const prodId = document.getElementById('producto-id')?.value;
    if (switchSerie.checked) {
      secSeriales.classList.remove('d-none');
      if (prodId) {
        loadModalSerials(prodId);
      } else {
        renderPendingSerials();
      }
    } else {
      secSeriales.classList.add('d-none');
      if (!prodId) {
        clearPendingSerials();
        renderPendingSerials();
      }
    }
  };

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
              
              loadInventario({ force: true });
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
        const count = parseSerialText(e.target.value).length;
        modalCounter.textContent = `${count} detectados`;
      });

      btnAddSerials.addEventListener('click', async () => {
        const prodId = document.getElementById('producto-id').value;
        const currentSedeId = selectSede.value || usuario.sedeId;
        const series = parseSerialText(modalTextarea.value);
        if (series.length === 0) {
          showToast('Error', 'Por favor, ingrese al menos un número de serie válido.', 'error');
          return;
        }

        // Crear producto: encolar hasta Guardar (aún no hay productoId)
        if (!prodId) {
          const existing = new Set(pendingSerials.map((s) => s.toLowerCase()));
          let added = 0;
          for (const s of series) {
            if (!existing.has(s.toLowerCase())) {
              pendingSerials.push(s);
              existing.add(s.toLowerCase());
              added += 1;
            }
          }
          modalTextarea.value = '';
          modalCounter.textContent = '0 detectados';
          renderPendingSerials();
          showToast(
            'Seriales listos',
            added
              ? `${added} serial${added === 1 ? '' : 'es'} en cola. Se registrarán al guardar el producto.`
              : 'Esos seriales ya estaban en la lista pendiente.',
            added ? 'success' : 'info'
          );
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
          
          loadInventario({ force: true });
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
      });

      switchSerie.addEventListener('change', () => {
        syncSerialSectionVisibility();
      });
    }
  }, 100);

  let categoriasCache = [];
  const CAT_RECENT_KEY = 'inv-cat-recent';

  const escapeCatHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

  const splitCatNombre = (nombre) => {
    const parts = String(nombre || '').split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return { leaf: '—', path: '' };
    if (parts.length === 1) return { leaf: parts[0], path: '' };
    return { leaf: parts[parts.length - 1], path: parts.slice(0, -1).join(' · ') };
  };

  const readRecentCatIds = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(CAT_RECENT_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(String) : [];
    } catch {
      return [];
    }
  };

  const rememberRecentCat = (id) => {
    if (!id) return;
    const next = [String(id), ...readRecentCatIds().filter((x) => x !== String(id))].slice(0, 8);
    localStorage.setItem(CAT_RECENT_KEY, JSON.stringify(next));
  };

  const closeProdCatPanel = () => {
    const sheet = document.getElementById('prod-cat-sheet');
    const trigger = document.getElementById('prod-cat-trigger');
    const picker = document.getElementById('prod-cat-picker');
    if (sheet) {
      sheet.hidden = true;
      sheet.classList.remove('is-open');
    }
    trigger?.setAttribute('aria-expanded', 'false');
    picker?.classList.remove('is-open');
    document.getElementById('modal-producto')?.classList.remove('prod-cat-sheet-open');
  };

  const setProdCategoria = (id, { remember = false } = {}) => {
    const input = document.getElementById('prod-categoria');
    const leafEl = document.getElementById('prod-cat-leaf');
    const pathEl = document.getElementById('prod-cat-path');
    const trigger = document.getElementById('prod-cat-trigger');
    if (!input || !leafEl) return;

    input.value = id ? String(id) : '';
    const cat = id ? categoriasCache.find((c) => String(c.id) === String(id)) : null;

    if (!cat) {
      leafEl.textContent = 'Elegir categoría…';
      if (pathEl) {
        pathEl.textContent = '';
        pathEl.classList.add('d-none');
      }
      trigger?.classList.remove('is-filled');
      trigger?.setAttribute('aria-label', 'Elegir categoría');
      return;
    }

    const { leaf, path } = splitCatNombre(cat.nombre);
    leafEl.textContent = leaf;
    if (pathEl) {
      if (path) {
        pathEl.textContent = path;
        pathEl.classList.remove('d-none');
      } else {
        pathEl.textContent = '';
        pathEl.classList.add('d-none');
      }
    }
    trigger?.classList.add('is-filled');
    trigger?.setAttribute('aria-label', path ? `Categoría: ${leaf}. ${path}` : `Categoría: ${leaf}`);
    if (remember) rememberRecentCat(cat.id);
  };

  const pickProdCategoria = (id) => {
    setProdCategoria(id, { remember: true });
    closeProdCatPanel();
  };

  const refreshProdCatModalContent = (query = '') => {
    const countEl = document.getElementById('prod-cat-modal-count');
    const n = categoriasCache.length;
    if (countEl) {
      countEl.textContent = n
        ? `${n} estante${n === 1 ? '' : 's'} · busca o elige`
        : 'Aún no hay categorías. Créalas en Organizar categorías.';
    }
    renderProdCatRails();
    renderProdCatList(query);
  };

  const renderProdCatRails = () => {
    const rails = document.getElementById('prod-cat-rails');
    if (!rails) return;

    const byCount = [...categoriasCache]
      .filter((c) => (c.productCount ?? 0) > 0)
      .sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0));

    const recentIds = readRecentCatIds();
    const recent = recentIds
      .map((id) => categoriasCache.find((c) => String(c.id) === id))
      .filter(Boolean);

    const seen = new Set();
    const picks = [];
    for (const c of [...recent, ...byCount]) {
      const key = String(c.id);
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(c);
      if (picks.length >= 6) break;
    }

    if (!picks.length) {
      rails.innerHTML = '';
      rails.classList.add('d-none');
      return;
    }

    rails.classList.remove('d-none');
    rails.innerHTML = picks.map((c) => {
      const { leaf } = splitCatNombre(c.nombre);
      const n = c.productCount ?? 0;
      const active = String(document.getElementById('prod-categoria')?.value || '') === String(c.id);
      return `
        <button type="button" class="prod-cat-rail${active ? ' is-active' : ''}" data-cat-id="${c.id}" title="${escapeCatHtml(c.nombre)}">
          <span class="prod-cat-rail__name">${escapeCatHtml(leaf)}</span>
          ${n ? `<span class="prod-cat-rail__n">${n}</span>` : ''}
        </button>
      `;
    }).join('');

    rails.querySelectorAll('.prod-cat-rail').forEach((btn) => {
      btn.addEventListener('click', () => pickProdCategoria(btn.dataset.catId));
    });
  };

  const renderProdCatList = (query = '') => {
    const list = document.getElementById('prod-cat-list');
    const empty = document.getElementById('prod-cat-empty');
    if (!list) return;

    const q = query.trim().toLowerCase();
    const selected = String(document.getElementById('prod-categoria')?.value || '');
    const filtered = categoriasCache.filter((c) => {
      if (!q) return true;
      return String(c.nombre || '').toLowerCase().includes(q);
    });

    if (!filtered.length) {
      list.innerHTML = '';
      empty?.classList.remove('d-none');
      return;
    }
    empty?.classList.add('d-none');

    const ranked = [...filtered].sort((a, b) => {
      if (q) {
        const aName = String(a.nombre || '').toLowerCase();
        const bName = String(b.nombre || '').toLowerCase();
        const aLeaf = splitCatNombre(a.nombre).leaf.toLowerCase();
        const bLeaf = splitCatNombre(b.nombre).leaf.toLowerCase();
        const score = (leaf, full) => (leaf.startsWith(q) ? 0 : full.startsWith(q) ? 1 : leaf.includes(q) ? 2 : 3);
        const sd = score(aLeaf, aName) - score(bLeaf, bName);
        if (sd !== 0) return sd;
      }
      const an = (a.productCount ?? 0);
      const bn = (b.productCount ?? 0);
      if (bn !== an) return bn - an;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });

    list.innerHTML = ranked.map((c) => {
      const { leaf, path } = splitCatNombre(c.nombre);
      const n = c.productCount ?? 0;
      const active = selected === String(c.id);
      return `
        <li role="option" class="prod-cat-option${active ? ' is-active' : ''}" data-cat-id="${c.id}" aria-selected="${active ? 'true' : 'false'}">
          <span class="prod-cat-option__main">
            <span class="prod-cat-option__leaf">${escapeCatHtml(leaf)}</span>
            ${path ? `<span class="prod-cat-option__path">${escapeCatHtml(path)}</span>` : ''}
          </span>
          <span class="prod-cat-option__meta">
            ${n ? `<span class="prod-cat-option__n">${n}</span>` : '<span class="prod-cat-option__n is-zero">0</span>'}
            ${active ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}
          </span>
        </li>
      `;
    }).join('');

    list.querySelectorAll('.prod-cat-option').forEach((row) => {
      row.addEventListener('click', () => pickProdCategoria(row.dataset.catId));
    });
  };

  const openProdCatPanel = () => {
    const sheet = document.getElementById('prod-cat-sheet');
    const trigger = document.getElementById('prod-cat-trigger');
    const picker = document.getElementById('prod-cat-picker');
    const search = document.getElementById('prod-cat-search');
    if (!sheet || !trigger) return;

    scrubOrphanModalBackdrops();
    if (search) search.value = '';
    sheet.hidden = false;
    sheet.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    picker?.classList.add('is-open');
    document.getElementById('modal-producto')?.classList.add('prod-cat-sheet-open');
    refreshProdCatModalContent('');
    requestAnimationFrame(() => {
      search?.focus();
      search?.select();
    });
  };

  const bindProdCatPicker = () => {
    const trigger = document.getElementById('prod-cat-trigger');
    const search = document.getElementById('prod-cat-search');
    if (!trigger || trigger.dataset.bound === '1') return;
    trigger.dataset.bound = '1';

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openProdCatPanel();
    });

    search?.addEventListener('input', () => {
      renderProdCatList(search.value);
    });

    search?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeProdCatPanel();
        trigger.focus();
        return;
      }
      if (e.key === 'Enter') {
        const first = document.querySelector('#prod-cat-list .prod-cat-option');
        if (first) {
          e.preventDefault();
          pickProdCategoria(first.dataset.catId);
        }
      }
    });

    document.getElementById('btn-prod-cat-sheet-close')?.addEventListener('click', () => closeProdCatPanel());
    document.getElementById('btn-prod-cat-sheet-done')?.addEventListener('click', () => closeProdCatPanel());

    document.getElementById('modal-producto')?.addEventListener('show.bs.modal', () => {
      scrubOrphanModalBackdrops();
      closeProdCatPanel();
    });

    document.getElementById('modal-producto')?.addEventListener('hidden.bs.modal', () => {
      closeProdCatPanel();
      scrubOrphanModalBackdrops();
    });
  };

  const countByStockStatus = () => {
    const counts = { todos: 0, ok: 0, bajo: 0, agotado: 0 };
    for (const item of stockCache) {
      if (!item.producto) continue;
      counts.todos += 1;
      const st = stockStatusOf(item);
      if (st === 'ok') counts.ok += 1;
      else if (st === 'bajo') counts.bajo += 1;
      else if (st === 'agotado') counts.agotado += 1;
    }
    return counts;
  };

  const syncStockChipCounts = () => {
    const counts = countByStockStatus();
    document.querySelectorAll('[data-stock-n]').forEach((el) => {
      const key = el.getAttribute('data-stock-n');
      const n = counts[key] ?? 0;
      el.textContent = n ? String(n) : '';
    });
  };

  const countProductsInCategoria = (catId) => {
    if (!catId) return stockCache.filter((i) => i.producto).length;
    return stockCache.filter((i) => {
      const prod = i.producto;
      if (!prod) return false;
      return String(prod.categoriaId || prod.categoria?.id || '') === String(catId);
    }).length;
  };

  // Cargar Categorías en formulario + filtro (con conteo de la sede actual)
  const loadCategoriasList = async (selectedId = null) => {
    try {
      const list = await apiFetch('/productos/categorias').catch(() => []);
      categoriasCache = Array.isArray(list) ? list : [];
      bindProdCatPicker();
      if (selectedId) {
        setProdCategoria(selectedId);
      } else {
        const current = document.getElementById('prod-categoria')?.value;
        if (current) setProdCategoria(current);
      }
      renderProdCatRails();
      if (selectCategoria) {
        const current = selectCategoria.value;
        const totalSede = countProductsInCategoria('');
        selectCategoria.innerHTML = [
          `<option value="">Todas (${totalSede})</option>`,
          ...categoriasCache.map((c) => {
            const n = countProductsInCategoria(c.id);
            return `<option value="${c.id}">${c.nombre} (${n})</option>`;
          })
        ].join('');
        if (current && categoriasCache.some((c) => String(c.id) === String(current))) {
          selectCategoria.value = current;
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  await loadCategoriasList();

  const applyInventarioFilters = () => {
    const tbody = document.getElementById('inventario-table-body');
    const query = (searchInput.value || '').trim().toLowerCase();
    const catId = selectCategoria?.value || '';
    const stock = stockCache;

    const filtered = stock.filter((item) => {
      const prod = item.producto;
      if (!prod) return false;
      if (catId && String(prod.categoriaId || prod.categoria?.id || '') !== String(catId)) return false;
      const status = stockStatusOf(item);
      if (filtroStock === 'ok' && status !== 'ok') return false;
      // Bajo = con stock pero en/bajo mínimo; Agotado = sin unidades (separados para el recorrido de bodega)
      if (filtroStock === 'bajo' && status !== 'bajo') return false;
      if (filtroStock === 'agotado' && status !== 'agotado') return false;
      if (filtroSerie && !prod.tieneNumeroSerie) return false;
      if (filtroInterno && !isInternalBarcode(prod.codigoBarras)) return false;
      if (!query) return true;
      return (prod.nombre || '').toLowerCase().includes(query) || (prod.codigoBarras || '').toLowerCase().includes(query);
    });

    if (resultCountEl) {
      resultCountEl.textContent = filtered.length
        ? `${filtered.length} producto${filtered.length === 1 ? '' : 's'}`
        : 'Sin resultados';
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">No hay productos con estos filtros. Prueba otra categoría, estado o búsqueda.</td></tr>`;
      return;
    }

    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    tbody.innerHTML = filtered.map(item => {
      const prod = item.producto;
      const stockMin = prod.stockMinimo;
      const stockQty = item.cantidad;

      let statusBadge = '';
      let statusClass = '';
      if (stockQty <= 0) {
        statusBadge = '<span class="inv-status inv-status--out">Agotado</span>';
        statusClass = 'inv-qty--out';
      } else if (stockQty <= stockMin) {
        statusBadge = '<span class="inv-status inv-status--low">Bajo</span>';
        statusClass = 'inv-qty--low';
      } else {
        statusBadge = '<span class="inv-status inv-status--ok">OK</span>';
        statusClass = 'inv-qty--ok';
      }

      const imgHtml = prod.imagenUrl 
        ? `<img src="${prod.imagenUrl}" class="inv-thumb" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' fill=\\'none\\' stroke=\\'%23ccc\\' stroke-width=\\'2\\'><rect width=\\'20\\' height=\\'20\\' x=\\'2\\' y=\\'2\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\\'/></svg>';">` 
        : `<span class="inv-thumb inv-thumb--letter">${prod.nombre.charAt(0).toUpperCase()}</span>`;

      const codigoInterno = isInternalBarcode(prod.codigoBarras)
        ? '<span class="inv-sku__tag">Interno</span>'
        : '';

      const rowInteractive = isAdminOrGerente;

      return `
        <tr class="${rowInteractive ? 'inv-row is-clickable' : ''}" ${rowInteractive ? `data-id="${item.productoId}" tabindex="0" role="button" aria-label="Editar ${prod.nombre}"` : ''}>
          <td>
            <div class="inv-sku">
              <code class="inv-sku__code">${prod.codigoBarras}</code>
              ${codigoInterno}
            </div>
          </td>
          <td>
            <div class="inv-product">
              ${imgHtml}
              <span class="inv-product__name" title="${prod.nombre}">${prod.nombre}</span>
            </div>
          </td>
          <td class="inv-cat">${prod.categoria?.nombre || categoriasCache.find((c) => String(c.id) === String(prod.categoriaId))?.nombre || '—'}</td>
          <td class="text-end inv-money">${formatter.format(prod.precioCosto)}</td>
          <td class="text-end inv-money inv-money--sale">${formatter.format(prod.precioVenta)}</td>
          <td class="text-end"><span class="inv-qty ${statusClass}">${formatStockUnidad(stockQty, prod.unidadMedida)}</span></td>
          <td class="text-center">${statusBadge}</td>
          <td class="text-center">${prod.tieneNumeroSerie ? '<span class="inv-status inv-status--imei">IMEI</span>' : '<span class="text-secondary">—</span>'}</td>
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
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-id');
        const item = stockCache.find(s => s.productoId === id);
        if (item?.producto) openEtiquetaModal(item.producto);
      });
    });

    const abrirEdicionProducto = (id) => {
      const item = stockCache.find(s => s.productoId === id);
      if (!item) return;

      document.getElementById('producto-id').value = item.productoId;
      document.getElementById('prod-nombre').value = item.producto.nombre;
      document.getElementById('prod-codigo').value = item.producto.codigoBarras;
      document.getElementById('prod-descripcion').value = item.producto.descripcion || '';
      document.getElementById('prod-costo').value = item.producto.precioCosto;
      document.getElementById('prod-venta').value = item.producto.precioVenta;
      document.getElementById('prod-minimo').value = item.producto.stockMinimo;
      setProdCategoria(item.producto.categoriaId);
      document.getElementById('prod-serie').checked = item.producto.tieneNumeroSerie;
      document.getElementById('prod-iva').checked = item.producto.tieneIVA;
      document.getElementById('prod-reacondicionado').checked = item.producto.esReacondicionado;
      document.getElementById('prod-servicio').checked = !!item.producto.esServicio;
      document.getElementById('prod-imagen-url').value = item.producto.imagenUrl || '';
      document.getElementById('prod-unidad').value = normalizeUnidadMedida(item.producto.unidadMedida);
      syncProdUnidadHint();

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

      const secSeriales = document.getElementById('sec-gestion-seriales');
      clearPendingSerials();
      if (item.producto.tieneNumeroSerie) {
        secSeriales.classList.remove('d-none');
        loadModalSerials(item.productoId);
      } else {
        secSeriales.classList.add('d-none');
      }

      document.getElementById('modal-producto-title').textContent = item.producto.nombre;
      syncProdFormMeta();
      modalProd.show();
    };

    document.querySelectorAll('.btn-editar').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirEdicionProducto(e.currentTarget.getAttribute('data-id'));
      });
    });

    document.querySelectorAll('.btn-eliminar').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-id');
        const verificado = await showConfirm('Eliminar Producto', '¿Está seguro de eliminar este producto del catálogo de forma permanente?');
        if (verificado) {
          try {
            await apiFetch(`/productos/${id}`, { method: 'DELETE' });
            showToast('Éxito', 'Producto eliminado correctamente.', 'success');
            stockCacheSedeId = null;
            loadInventario({ force: true });
          } catch (err) {
            showToast('Error', err.message, 'error');
          }
        }
      });
    });

    // Fila completa clickeable (abre edición); botones internos ya detienen la propagación
    document.querySelectorAll('.inv-row.is-clickable').forEach(row => {
      row.addEventListener('click', () => abrirEdicionProducto(row.getAttribute('data-id')));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          abrirEdicionProducto(row.getAttribute('data-id'));
        }
      });
    });
  };

  const loadInventario = async ({ force = false } = {}) => {
    const sedeId = selectSede.value;
    const tbody = document.getElementById('inventario-table-body');

    if (!force && stockCacheSedeId === sedeId) {
      syncStockChipCounts();
      applyInventarioFilters();
      return;
    }

    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    if (resultCountEl) resultCountEl.textContent = 'Cargando…';

    try {
      stockCache = await apiFetch(`/inventario/stock?sedeId=${sedeId}`);
      stockCacheSedeId = sedeId;
      await loadCategoriasList();
      syncStockChipCounts();
      applyInventarioFilters();
    } catch (e) {
      console.error(e);
      stockCache = [];
      stockCacheSedeId = null;
      syncStockChipCounts();
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error al cargar el inventario.</td></tr>`;
      if (resultCountEl) resultCountEl.textContent = '';
    }
  };

  // Event Listeners de Filtros
  selectSede.addEventListener('change', () => {
    stockCacheSedeId = null;
    loadInventario({ force: true });
  });
  searchInput.addEventListener('input', () => applyInventarioFilters());
  selectCategoria?.addEventListener('change', () => applyInventarioFilters());

  // F2 → enfocar buscar/escanear (mismo atajo que POS; no actúa si hay modal abierto)
  if (inventarioKeydownHandler) {
    document.removeEventListener('keydown', inventarioKeydownHandler);
  }
  inventarioKeydownHandler = (e) => {
    if (e.key !== 'F2') return;
    const input = document.getElementById('search-inventario');
    if (!input) return;
    if (document.querySelector('.modal.show')) return;
    e.preventDefault();
    input.focus();
    input.select();
  };
  document.addEventListener('keydown', inventarioKeydownHandler);

  document.querySelectorAll('.inv-chip[data-stock]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filtroStock = chip.getAttribute('data-stock') || 'todos';
      syncStockChips();
      applyInventarioFilters();
    });
  });

  document.querySelector('.inv-chip[data-serie="imei"]')?.addEventListener('click', () => {
    filtroSerie = !filtroSerie;
    syncToggleChip('.inv-chip[data-serie="imei"]', filtroSerie);
    applyInventarioFilters();
  });

  document.querySelector('.inv-chip[data-interno="1"]')?.addEventListener('click', () => {
    filtroInterno = !filtroInterno;
    syncToggleChip('.inv-chip[data-interno="1"]', filtroInterno);
    applyInventarioFilters();
  });

  btnLimpiarFiltros?.addEventListener('click', () => {
    searchInput.value = '';
    if (selectCategoria) selectCategoria.value = '';
    filtroStock = 'todos';
    filtroSerie = false;
    filtroInterno = false;
    syncStockChips();
    syncToggleChip('.inv-chip[data-serie="imei"]', false);
    syncToggleChip('.inv-chip[data-interno="1"]', false);
    applyInventarioFilters();
  });

  // Botón Nuevo Producto
  if (isAdminOrGerente) {
    // Organizar categorías (rename, conteos, reasignar al borrar)
    const btnGestionarCats = document.getElementById('btn-gestionar-categorias');
    if (btnGestionarCats) {
      const escapeHtml = (s) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');

      let catPanelQuery = '';
      let catPanelSoloVacias = false;

      const closeCatReasignarSheet = () => {
        const sheet = document.getElementById('inv-cat-reasignar-sheet');
        if (!sheet) return;
        sheet.hidden = true;
        sheet.classList.remove('is-open');
        document.getElementById('modal-categorias')?.classList.remove('inv-cat-sheet-open');
        catPendingDelete = null;
      };

      const openCatReasignarSheet = () => {
        const sheet = document.getElementById('inv-cat-reasignar-sheet');
        if (!sheet) return;
        scrubOrphanModalBackdrops();
        sheet.hidden = false;
        sheet.classList.add('is-open');
        document.getElementById('modal-categorias')?.classList.add('inv-cat-sheet-open');
        requestAnimationFrame(() => document.getElementById('cat-reasignar-destino')?.focus());
      };

      const normalizeCatNombre = (raw) => {
        const typed = String(raw || '').trim();
        if (!typed) return '';
        if (!typed.includes('/')) return typed;
        return typed.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean).join(' / ');
      };

      const syncCatRowDirty = (input) => {
        const row = input.closest('.inv-cat-row');
        const btn = row?.querySelector('.btn-guardar-categoria');
        const nombre = normalizeCatNombre(input.value);
        const dirty = Boolean(nombre) && nombre !== (input.dataset.original || '');
        btn?.classList.toggle('d-none', !dirty);
        row?.classList.toggle('is-dirty', dirty);
        return dirty;
      };

      const resetCatInput = (input, fullNombre) => {
        const nombre = String(fullNombre || '');
        input.dataset.original = nombre;
        input.value = nombre;
        input.title = nombre;
        syncCatRowDirty(input);
      };

      const focusCatEdit = (input, { select = true } = {}) => {
        if (!input) return;
        input.focus();
        if (select) input.select();
      };

      const rowSaveCategoria = async (input) => {
        const id = input.dataset.id;
        const nombre = normalizeCatNombre(input.value);
        if (!nombre) {
          showToast('Error', 'El nombre no puede quedar vacío.', 'error');
          return;
        }
        if (nombre === input.dataset.original) {
          input.value = nombre;
          syncCatRowDirty(input);
          return;
        }
        try {
          await apiFetch(`/productos/categorias/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ nombre })
          });
          const cached = categoriasCache.find((c) => String(c.id) === String(id));
          if (cached) cached.nombre = nombre;
          resetCatInput(input, nombre);
          showToast('Guardado', 'Categoría actualizada.', 'success');
          await loadCategoriasList();
          loadInventario({ force: true });
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
      };

      const bindCategoriasPanelRows = (listEl) => {
        listEl.querySelectorAll('.inv-cat-row').forEach((row) => {
          row.addEventListener('click', (e) => {
            if (e.target.closest('button, a, select, label')) return;
            const input = row.querySelector('.inv-cat-name');
            if (!input || document.activeElement === input) return;
            focusCatEdit(input);
          });
        });

        listEl.querySelectorAll('.inv-cat-name').forEach((input) => {
          input.addEventListener('input', () => syncCatRowDirty(input));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              rowSaveCategoria(input);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              resetCatInput(input, input.dataset.original || '');
              input.blur();
            }
          });
        });

        listEl.querySelectorAll('.btn-editar-categoria').forEach((btn) => {
          btn.addEventListener('click', () => {
            const input = btn.closest('.inv-cat-row')?.querySelector('.inv-cat-name');
            focusCatEdit(input);
          });
        });

        listEl.querySelectorAll('.btn-guardar-categoria').forEach((btn) => {
          btn.addEventListener('mousedown', (e) => e.preventDefault()); // evita blur antes del click
          btn.addEventListener('click', () => {
            const input = btn.closest('.inv-cat-row')?.querySelector('.inv-cat-name');
            if (input) rowSaveCategoria(input);
          });
        });

        listEl.querySelectorAll('.btn-eliminar-categoria').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const nombre = btn.dataset.nombre || 'esta categoría';
            const count = parseInt(btn.dataset.count, 10) || 0;

            if (count <= 0) {
              const ok = await showConfirm('Eliminar categoría', `¿Eliminar «${nombre}»? No tiene productos.`);
              if (!ok) return;
              try {
                await apiFetch(`/productos/categorias/${id}`, { method: 'DELETE' });
                showToast('Éxito', 'Categoría eliminada.', 'success');
                await loadCategoriasPanel();
                await loadCategoriasList();
              } catch (err) {
                showToast('Error', err.message, 'error');
              }
              return;
            }

            const otras = categoriasCache.filter((c) => String(c.id) !== String(id));
            if (!otras.length) {
              showToast('No se puede eliminar', 'Crea otra categoría para reasignar los productos primero.', 'warning');
              return;
            }

            catPendingDelete = { id, nombre, count };
            const msg = document.getElementById('cat-reasignar-msg');
            const dest = document.getElementById('cat-reasignar-destino');
            if (msg) {
              msg.textContent = `«${nombre}» tiene ${count} producto${count === 1 ? '' : 's'}. Elige a dónde moverlos.`;
            }
            if (dest) {
              dest.innerHTML = otras.map((c) =>
                `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`
              ).join('');
            }
            openCatReasignarSheet();
          });
        });
      };

      const getFilteredCategorias = () => {
        const q = catPanelQuery.trim().toLowerCase();
        let list = [...categoriasCache];
        if (catPanelSoloVacias) {
          list = list.filter((c) => (c.productCount ?? 0) === 0);
        }
        if (q) {
          list = list.filter((c) => String(c.nombre || '').toLowerCase().includes(q));
        }
        list.sort((a, b) => {
          const ac = a.productCount ?? 0;
          const bc = b.productCount ?? 0;
          // Vacías primero (limpieza), luego por nombre
          if (ac === 0 && bc !== 0) return -1;
          if (bc === 0 && ac !== 0) return 1;
          if (ac !== bc) return ac - bc;
          return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
        });
        return list;
      };

      const renderCategoriasPanel = () => {
        const listEl = document.getElementById('lista-categorias-body');
        const metaEl = document.getElementById('inv-cat-list-meta');
        if (!listEl) return;

        const filtered = getFilteredCategorias();
        const emptyCount = categoriasCache.filter((c) => (c.productCount ?? 0) === 0).length;
        if (metaEl) {
          const total = categoriasCache.length;
          if (!total) {
            metaEl.textContent = '';
          } else if (catPanelQuery || catPanelSoloVacias) {
            metaEl.textContent = `${filtered.length} de ${total}`;
          } else {
            metaEl.textContent = emptyCount
              ? `${total} · ${emptyCount} vacía${emptyCount === 1 ? '' : 's'}`
              : `${total}`;
          }
        }

        if (!categoriasCache.length) {
          listEl.innerHTML = `<div class="inv-cat-list-status">No hay categorías. Crea la primera arriba.</div>`;
          return;
        }
        if (!filtered.length) {
          listEl.innerHTML = `<div class="inv-cat-list-status">Sin coincidencias. Prueba otra búsqueda${catPanelSoloVacias ? ' o quita «Solo vacías»' : ''}.</div>`;
          return;
        }

        listEl.innerHTML = filtered.map((c) => {
          const count = c.productCount ?? 0;
          const nombre = String(c.nombre || '');
          const depth = nombre.split(/\s*\/\s*/).filter(Boolean).length;
          return `
            <article class="inv-cat-row${count === 0 ? ' is-empty' : ''}" data-cat-id="${c.id}" role="listitem">
              <span class="inv-cat-row__rail" aria-hidden="true"></span>
              <div class="inv-cat-row__main">
                <div class="inv-cat-row__identity"${depth > 1 ? ` style="--cat-depth:${Math.min(depth - 1, 3)}"` : ''}>
                  <input type="text" class="inv-cat-name" value="${escapeHtml(nombre)}" data-id="${c.id}" data-original="${escapeHtml(nombre)}" title="${escapeHtml(nombre)}" aria-label="Nombre de categoría: ${escapeHtml(nombre)}" spellcheck="false" autocomplete="off">
                </div>
                <span class="inv-cat-count${count === 0 ? ' is-zero' : ''}" title="${count} producto${count === 1 ? '' : 's'}">${count}</span>
                <div class="inv-cat-row__actions">
                  <button type="button" class="btn btn-sm btn-primary btn-guardar-categoria d-none" data-id="${c.id}" title="Guardar (Enter)">
                    <i class="ti ti-check" aria-hidden="true"></i>
                    <span>Guardar</span>
                  </button>
                  <button type="button" class="btn btn-icon btn-ghost-secondary btn-sm btn-editar-categoria" data-id="${c.id}" title="Editar nombre" aria-label="Editar ${escapeHtml(nombre)}">
                    <i class="ti ti-pencil" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="btn btn-icon btn-ghost-danger btn-sm btn-eliminar-categoria" data-id="${c.id}" data-nombre="${escapeHtml(nombre)}" data-count="${count}" title="Eliminar" aria-label="Eliminar ${escapeHtml(nombre)}">
                    <i class="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            </article>
          `;
        }).join('');
        bindCategoriasPanelRows(listEl);
      };

      const loadCategoriasPanel = async () => {
        const listEl = document.getElementById('lista-categorias-body');
        if (!listEl) return;
        if (categoriasCache.length) {
          renderCategoriasPanel();
        } else {
          listEl.innerHTML = `<div class="inv-cat-list-status"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>`;
        }
        try {
          const list = await apiFetch('/productos/categorias');
          categoriasCache = Array.isArray(list) ? list : [];
          renderCategoriasPanel();
        } catch (err) {
          console.error(err);
          if (!categoriasCache.length) {
            listEl.innerHTML = `<div class="inv-cat-list-status text-danger">Error al cargar categorías.</div>`;
          }
        }
      };

      // Abrir con data-bs-toggle; cargar/listar al mostrar (más fiable que click en dropdown-item)
      const modalCategoriasEl = document.getElementById('modal-categorias');
      modalCategoriasEl?.addEventListener('show.bs.modal', () => {
        catPanelQuery = '';
        catPanelSoloVacias = false;
        const filterInput = document.getElementById('inv-cat-filter');
        const soloBtn = document.getElementById('inv-cat-solo-vacias');
        if (filterInput) filterInput.value = '';
        soloBtn?.classList.remove('is-active');
        soloBtn?.setAttribute('aria-pressed', 'false');
        closeCatReasignarSheet();
        loadCategoriasPanel();
        requestAnimationFrame(() => filterInput?.focus());
      });
      modalCategoriasEl?.addEventListener('hidden.bs.modal', () => {
        closeCatReasignarSheet();
        scrubOrphanModalBackdrops();
      });
      btnGestionarCats.addEventListener('click', () => {
        const dropdownToggle = btnGestionarCats.closest('.dropdown')?.querySelector('[data-bs-toggle="dropdown"]');
        bootstrap.Dropdown.getInstance(dropdownToggle)?.hide();
      });

      document.getElementById('inv-cat-filter')?.addEventListener('input', (e) => {
        catPanelQuery = e.target.value || '';
        renderCategoriasPanel();
      });

      document.getElementById('inv-cat-solo-vacias')?.addEventListener('click', (e) => {
        catPanelSoloVacias = !catPanelSoloVacias;
        e.currentTarget.classList.toggle('is-active', catPanelSoloVacias);
        e.currentTarget.setAttribute('aria-pressed', catPanelSoloVacias ? 'true' : 'false');
        renderCategoriasPanel();
      });

      document.getElementById('btn-cat-reasignar-close')?.addEventListener('click', closeCatReasignarSheet);
      document.getElementById('btn-cat-reasignar-cancel')?.addEventListener('click', closeCatReasignarSheet);

      document.getElementById('btn-cat-reasignar-confirm')?.addEventListener('click', async () => {
        if (!catPendingDelete) return;
        const dest = document.getElementById('cat-reasignar-destino')?.value;
        if (!dest) {
          showToast('Error', 'Elige una categoría destino.', 'error');
          return;
        }
        try {
          const res = await apiFetch(`/productos/categorias/${catPendingDelete.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reasignarA: dest })
          });
          closeCatReasignarSheet();
          showToast('Éxito', res.message || 'Categoría eliminada.', 'success');
          loadCategoriasPanel();
          await loadCategoriasList();
          loadInventario({ force: true });
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
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
          showToast('Éxito', 'Categoría creada.', 'success');
          loadCategoriasPanel();
          await loadCategoriasList();
          document.getElementById('inv-cat-filter')?.focus();
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
      clearPendingSerials();
      document.getElementById('sec-gestion-seriales').classList.add('d-none');
      document.getElementById('modal-producto-title').textContent = 'Crear producto';
      document.getElementById('prod-unidad').value = 'und';
      setProdCategoria('');
      const catSearch = document.getElementById('prod-cat-search');
      if (catSearch) catSearch.value = '';
      closeProdCatPanel();
      syncProdFormMeta();
      syncProdUnidadHint();
      modalProd.show();
    });

    // Submit formulario de producto
    document.getElementById('form-producto').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('producto-id').value;
      const codigoRaw = document.getElementById('prod-codigo').value.trim();
      const sedeId = (document.getElementById('select-sede-inventario') ? document.getElementById('select-sede-inventario').value : null) || usuario.sedeId;
      const categoriaId = document.getElementById('prod-categoria').value;
      if (!categoriaId) {
        showToast('Falta categoría', 'Elige el estante / categoría del producto.', 'warning');
        openProdCatPanel();
        return;
      }
      rememberRecentCat(categoriaId);
      const data = {
        nombre: document.getElementById('prod-nombre').value,
        descripcion: document.getElementById('prod-descripcion').value,
        precioCosto: parseFloat(document.getElementById('prod-costo').value),
        precioVenta: parseFloat(document.getElementById('prod-venta').value),
        stockMinimo: parseInt(document.getElementById('prod-minimo').value),
        categoriaId,
        tieneNumeroSerie: document.getElementById('prod-serie').checked,
        tieneIVA: document.getElementById('prod-iva').checked,
        esReacondicionado: document.getElementById('prod-reacondicionado').checked,
        esServicio: document.getElementById('prod-servicio').checked,
        unidadMedida: normalizeUnidadMedida(document.getElementById('prod-unidad').value),
        imagenUrl: document.getElementById('prod-imagen-url').value.trim() || null,
        ajusteStock: ['admin', 'superadmin'].includes(usuario.rol) ? parseStockInput(document.getElementById('prod-stock-actual').value) : null,
        sedeId
      };
      if (codigoRaw) {
        data.codigoBarras = codigoRaw;
      }

      // Incluir texto pendiente del textarea al crear (por si no pulsó Agregar)
      const textareaSerials = parseSerialText(document.getElementById('modal-reg-imei')?.value);
      const serialsToFlush = [];
      if (!id && data.tieneNumeroSerie) {
        const seen = new Set(pendingSerials.map((s) => s.toLowerCase()));
        serialsToFlush.push(...pendingSerials);
        for (const s of textareaSerials) {
          if (!seen.has(s.toLowerCase())) {
            serialsToFlush.push(s);
            seen.add(s.toLowerCase());
          }
        }
      }

      try {
        if (id) {
          await apiFetch(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
          showToast('Éxito', 'Producto actualizado correctamente.', 'success');
        } else {
          const created = await apiFetch('/productos', { method: 'POST', body: JSON.stringify(data) });
          const newId = created?.id || created?.producto?.id;

          if (serialsToFlush.length > 0 && newId) {
            try {
              const res = await apiFetch('/series/bulk', {
                method: 'POST',
                body: JSON.stringify({ series: serialsToFlush, productoId: newId, sedeId })
              });
              showToast('Seriales registrados', res.message || `${serialsToFlush.length} serial(es) agregados.`, 'success');
            } catch (serialErr) {
              showToast('Producto creado', `El producto se guardó, pero falló el registro de seriales: ${serialErr.message}`, 'warning');
            }
          }

          if (!codigoRaw && created?.codigoBarras) {
            showToast('Producto creado', `Código interno asignado: ${created.codigoBarras}`, 'success');
          } else if (serialsToFlush.length === 0) {
            showToast('Éxito', 'Producto creado correctamente.', 'success');
          }
        }
        clearPendingSerials();
        modalProd.hide();
        stockCacheSedeId = null;
        loadInventario({ force: true });
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
        stockCacheSedeId = null;
        loadInventario({ force: true });
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
        stockCacheSedeId = null;
        loadInventario({ force: true });
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Primera carga
  await loadInventario();
}

export function destroyInventario() {
  if (inventarioKeydownHandler) {
    document.removeEventListener('keydown', inventarioKeydownHandler);
    inventarioKeydownHandler = null;
  }
}

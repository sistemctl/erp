import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

let dataSedes = [];

export async function initInventario(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'gerente_sede'].includes(usuario.rol);
  
  // Cargar sedes para los formularios y traslados
  try {
    dataSedes = await apiFetch('/config/sedes');
  } catch (e) {
    console.error('Error al obtener sedes en inventario:', e);
  }

  // Renderizar maquetación base
  container.innerHTML = `
    <div class="container-xl">
      <!-- Header -->
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Catálogo e Inventario de Productos</h2>
            <div class="text-secondary mt-1">Control de existencias, traslados y administración de catálogo</div>
          </div>
          <div class="col-auto ms-auto d-print-none">
            <div class="btn-list">
              ${isAdminOrGerente ? `
                <button id="btn-nuevo-producto" class="btn btn-primary">
                  <i class="ti ti-plus me-2"></i> Nuevo Producto
                </button>
                <button id="btn-traslado" class="btn btn-warning">
                  <i class="ti ti-arrows-left-right me-2"></i> Traslado de Stock
                </button>
                <button id="btn-importar-csv" class="btn btn-outline-secondary">
                  <i class="ti ti-file-upload me-2"></i> Importar CSV
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Filtro de Sede -->
      <div class="card mb-3">
        <div class="card-body">
          <div class="row align-items-center">
            <div class="col-md-4">
              <label class="form-label">Sede a Consultar</label>
              <select id="select-sede-inventario" class="form-select">
                ${dataSedes.map(s => `<option value="${s.id}" ${s.id === usuario.sedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
              </select>
            </div>
            <div class="col-md-6 mt-3 mt-md-0">
              <label class="form-label">Buscador</label>
              <input type="text" id="search-inventario" class="form-control" placeholder="Buscar por nombre o código de barras...">
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
                <td colspan="9" class="text-center py-4">Cargando inventario...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal Nuevo/Editar Producto -->
    <div class="modal modal-blur fade" id="modal-producto" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modal-producto-title">Crear Producto</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-producto">
            <input type="hidden" id="producto-id">
            <div class="modal-body">
              <div class="row">
                <div class="col-lg-6">
                  <div class="mb-3">
                    <label class="form-label">Nombre del Producto</label>
                    <input type="text" id="prod-nombre" class="form-control" required placeholder="Ej: iPhone 15 Pro">
                  </div>
                </div>
                <div class="col-lg-6">
                  <div class="mb-3">
                    <label class="form-label">Código de Barras</label>
                    <input type="text" id="prod-codigo" class="form-control" required placeholder="Ej: 0190199543210">
                  </div>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Descripción</label>
                <textarea id="prod-descripcion" class="form-control" rows="3" placeholder="Detalle técnico del equipo..."></textarea>
              </div>
              <div class="mb-3">
                <label class="form-label">URL de la Imagen (Foto del Producto)</label>
                <input type="url" id="prod-imagen-url" class="form-control" placeholder="Ej: https://ejemplo.com/foto.jpg">
              </div>
              <div class="row">
                <div class="col-lg-4">
                  <div class="mb-3">
                    <label class="form-label">Precio Costo (COP)</label>
                    <input type="number" id="prod-costo" class="form-control" required step="0.01" min="0">
                  </div>
                </div>
                <div class="col-lg-4">
                  <div class="mb-3">
                    <label class="form-label">Precio Venta (COP)</label>
                    <input type="number" id="prod-venta" class="form-control" required step="0.01" min="0">
                  </div>
                </div>
                <div class="col-lg-4">
                  <div class="mb-3">
                    <label class="form-label">Stock Mínimo Alerta</label>
                    <input type="number" id="prod-minimo" class="form-control" required min="0" value="3">
                  </div>
                </div>
              </div>
              <div class="row">
                <div class="col-lg-6">
                  <div class="mb-3">
                    <label class="form-label">Categoría</label>
                    <select id="prod-categoria" class="form-select" required></select>
                  </div>
                </div>
                <div class="col-lg-6">
                  <div class="mb-3">
                    <div class="form-label">Propiedades</div>
                    <label class="form-check form-switch mt-2">
                      <input class="form-check-input" type="checkbox" id="prod-serie">
                      <span class="form-check-label">¿Tiene Número de Serie / IMEI?</span>
                    </label>
                    <label class="form-check form-switch mt-2">
                      <input class="form-check-input" type="checkbox" id="prod-iva" checked>
                      <span class="form-check-label">Aplica IVA 19%</span>
                    </label>
                    <label class="form-check form-switch mt-2">
                      <input class="form-check-input" type="checkbox" id="prod-reacondicionado">
                      <span class="form-check-label">¿Es Reacondicionado (Usado)?</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Guardar Producto</button>
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
                <code>nombre,codigoBarras,descripcion,precioVenta,precioCosto,tieneIVA,stockMinimo,tieneNumeroSerie,esReacondicionado,categoriaNombre</code>
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
  `;

  // Inicializar componentes de Bootstrap (Modales)
  const modalProd = new bootstrap.Modal(document.getElementById('modal-producto'));
  const modalTraslado = new bootstrap.Modal(document.getElementById('modal-traslado'));
  const modalCSV = new bootstrap.Modal(document.getElementById('modal-csv'));

  const selectSede = document.getElementById('select-sede-inventario');
  const searchInput = document.getElementById('search-inventario');

  // Cargar Categorías en formulario
  let categorias = [];
  try {
    categorias = await apiFetch('/config/usuarios'); // usaremos esto para buscar configuraciones, o creamos un config de categorias
    // En las semillas, categorías están creadas. Vamos a consultar categorías reales.
    // Como no definimos un endpoint específico de categorías en routes/config, podemos hacer una consulta a productos y mapear o crear un endpoint rápido.
    // Wait, let's just make a quick fetch de categorías de la base de datos!
    // Podemos crear un endpoint rápido en routes/config o fetch todas las categorías.
    // De momento, hagamos un query simple o carguemos por defecto las categorías semillas si falla el fetch.
    categorias = await apiFetch('/productos').then(prods => {
      const catsMap = {};
      prods.forEach(p => {
        if (p.categoria) {
          catsMap[p.categoriaId] = p.categoria.nombre;
        }
      });
      return Object.keys(catsMap).map(id => ({ id, nombre: catsMap[id] }));
    }).catch(() => []);
    
    if (categorias.length === 0) {
      // Fallback
      categorias = [
        { id: '1', nombre: 'Computadores' },
        { id: '2', nombre: 'Celulares' },
        { id: '3', nombre: 'Consolas' },
        { id: '4', nombre: 'Repuestos' },
        { id: '5', nombre: 'Accesorios' }
      ];
    }

    const selectCat = document.getElementById('prod-categoria');
    selectCat.innerHTML = categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  } catch (e) {
    console.error(e);
  }

  // Cargar datos iniciales
  const loadInventario = async () => {
    const sedeId = selectSede.value;
    const query = searchInput.value;

    const tbody = document.getElementById('inventario-table-body');
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const stock = await apiFetch(`/inventario/stock?sedeId=${sedeId}`);
      
      const filtered = stock.filter(item => {
        if (!query) return true;
        const q = query.toLowerCase();
        return item.producto.nombre.toLowerCase().includes(q) || item.producto.codigoBarras.toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">No se encontraron productos en el inventario.</td></tr>`;
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

        return `
          <tr>
            <td><code class="text-secondary">${prod.codigoBarras}</code></td>
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
              <td>
                <div class="btn-list flex-nowrap">
                  <button class="btn btn-sm btn-white btn-editar" data-id="${item.productoId}">Editar</button>
                  <button class="btn btn-sm btn-danger btn-eliminar" data-id="${item.productoId}">Eliminar</button>
                </div>
              </td>
            ` : ''}
          </tr>
        `;
      }).join('');

      // Asignar click listeners
      document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.getAttribute('data-id');
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
            document.getElementById('prod-reacondicionado').checked = item.producto.esReacondicionado;
            document.getElementById('prod-imagen-url').value = item.producto.imagenUrl || '';
            
            document.getElementById('modal-producto-title').textContent = 'Editar Producto';
            modalProd.show();
          }
        });
      });

      document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.getAttribute('data-id');
          if (confirm('¿Está seguro de eliminar este producto del catálogo?')) {
            try {
              await apiFetch(`/productos/${id}`, { method: 'DELETE' });
              loadInventario();
            } catch (err) {
              alert(err.message);
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
    document.getElementById('btn-nuevo-producto').addEventListener('click', () => {
      document.getElementById('form-producto').reset();
      document.getElementById('producto-id').value = '';
      document.getElementById('modal-producto-title').textContent = 'Crear Producto';
      modalProd.show();
    });

    // Submit formulario de producto
    document.getElementById('form-producto').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('producto-id').value;
      const data = {
        nombre: document.getElementById('prod-nombre').value,
        codigoBarras: document.getElementById('prod-codigo').value,
        descripcion: document.getElementById('prod-descripcion').value,
        precioCosto: parseFloat(document.getElementById('prod-costo').value),
        precioVenta: parseFloat(document.getElementById('prod-venta').value),
        stockMinimo: parseInt(document.getElementById('prod-minimo').value),
        categoriaId: document.getElementById('prod-categoria').value,
        tieneNumeroSerie: document.getElementById('prod-serie').checked,
        tieneIVA: document.getElementById('prod-iva').checked,
        esReacondicionado: document.getElementById('prod-reacondicionado').checked,
        imagenUrl: document.getElementById('prod-imagen-url').value.trim() || null
      };

      try {
        if (id) {
          await apiFetch(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        } else {
          await apiFetch('/productos', { method: 'POST', body: JSON.stringify(data) });
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

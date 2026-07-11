import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';

export async function initTradeIn(container) {
  const usuario = getUsuario();
  const needsSedePicker = !usuario.sedeId || ['admin', 'superadmin'].includes(usuario.rol);

  let clientes = [];
  let sedes = [];
  try {
    clientes = await apiFetch('/clientes').catch(() => []);
    if (needsSedePicker) {
      sedes = await apiFetch('/config/sedes').catch(() => []);
    }
  } catch (e) {
    console.error(e);
  }

  const defaultSedeId = usuario.sedeId || (sedes[0]?.id || '');

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Trade-In',
        title: 'Equipos como parte de pago',
        subtitle: 'Recepción, valoración y reingreso al inventario'
      })}

      <div class="row row-cards">
        <!-- FORMULARIO DE VALORACIÓN -->
        <div class="col-lg-5">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Registrar y Valorar Equipo</h3></div>
            <div class="card-body">
              <form id="form-registrar-tradein">
                <div class="mb-3">
                  <label class="form-label">Cliente que Entrega</label>
                  <select id="ti-cliente" class="form-select" required>
                    <option value="">-- Seleccionar Cliente --</option>
                    ${clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.documento || 'Sin doc'})</option>`).join('')}
                  </select>
                </div>

                ${needsSedePicker ? `
                <div class="mb-3">
                  <label class="form-label required">Sede destino (inventario)</label>
                  <select id="ti-sede" class="form-select" required>
                    ${sedes.length === 0 ? '<option value="">Sin sedes</option>' : sedes.map(s => `<option value="${s.id}" ${s.id === defaultSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                  </select>
                </div>
                ` : ''}

                <div class="mb-3">
                  <label class="form-label">Tipo de Equipo</label>
                  <input type="text" id="ti-tipo" class="form-control" placeholder="Ej: Celular, Consola, Portátil" required>
                </div>

                <div class="row">
                  <div class="col-6 mb-3">
                    <label class="form-label">Marca</label>
                    <input type="text" id="ti-marca" class="form-control" placeholder="Ej: Apple, Sony" required>
                  </div>
                  <div class="col-6 mb-3">
                    <label class="form-label">Modelo</label>
                    <input type="text" id="ti-modelo" class="form-control" placeholder="Ej: iPhone 13 Pro" required>
                  </div>
                </div>

                <div class="mb-3">
                  <label class="form-label">Número de Serie / IMEI (Recomendado)</label>
                  <input type="text" id="ti-imei" class="form-control" placeholder="Ej: 357890123456789">
                </div>

                <div class="mb-3">
                  <label class="form-label">Estado Físico del Equipo</label>
                  <select id="ti-estado" class="form-select" required>
                    <option value="excelente">Excelente (Como nuevo)</option>
                    <option value="bueno">Bueno (Pocos rayones)</option>
                    <option value="regular">Regular (Desgaste notorio)</option>
                    <option value="malo">Malo (Daños estéticos / pantalla rota)</option>
                  </select>
                </div>

                <div class="mb-3">
                  <label class="form-label">Valoración / Costo (COP)</label>
                  <div class="input-group">
                    <span class="input-group-text">$</span>
                    <input type="number" id="ti-valoracion" class="form-control form-control-lg fw-bold text-success" placeholder="Ej: 800000" min="0" step="1000" required>
                  </div>
                  <div class="text-secondary small mt-1">Lo que pagas o recibes por el equipo. Se registra como costo en inventario.</div>
                </div>

                <div class="row g-3 mb-3">
                  <div class="col-md-5">
                    <label class="form-label">Margen sugerido</label>
                    <select id="ti-margen" class="form-select">
                      <option value="20">20%</option>
                      <option value="30" selected>30%</option>
                      <option value="50">50%</option>
                      <option value="custom">Personalizado</option>
                    </select>
                  </div>
                  <div class="col-md-7">
                    <label class="form-label">Precio de venta (COP)</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" id="ti-precio-venta" class="form-control fw-bold" placeholder="Ej: 1040000" min="0" step="1000" required>
                    </div>
                  </div>
                </div>
                <p class="text-secondary small mb-4" id="ti-precio-hint">Sugerido: costo + margen. Puede editar el precio de venta manualmente.</p>

                <button type="submit" class="btn btn-success w-100 btn-lg">
                  <i class="ti ti-plus me-1"></i> Confirmar y Registrar en Inventario
                </button>
              </form>
            </div>
          </div>
        </div>

        <!-- HISTORIAL DE TRADE-INS -->
        <div class="col-lg-7">
          <div class="card erp-table-panel">
            <div class="card-header"><h3 class="card-title">Historial de Equipos Recibidos</h3></div>
            <div class="table-responsive">
              <table class="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Equipo</th>
                    <th>IMEI/Serie</th>
                    <th>Estado</th>
                    <th class="text-end">Valoración</th>
                    <th>Sede</th>
                  </tr>
                </thead>
                <tbody id="tradeins-table-body">
                  <tr><td colspan="6" class="text-center py-4 text-secondary">Cargando trade-ins…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  const valoracionEl = document.getElementById('ti-valoracion');
  const margenEl = document.getElementById('ti-margen');
  const precioVentaEl = document.getElementById('ti-precio-venta');
  const precioHintEl = document.getElementById('ti-precio-hint');
  let precioVentaManual = false;

  const calcPrecioSugerido = () => {
    const costo = parseFloat(valoracionEl.value) || 0;
    const margen = parseFloat(margenEl.value);
    if (margenEl.value === 'custom' || !Number.isFinite(margen)) return null;
    return Math.round(costo * (1 + margen / 100));
  };

  const updatePrecioHint = () => {
    if (!precioHintEl) return;
    const costo = parseFloat(valoracionEl.value) || 0;
    const venta = parseFloat(precioVentaEl.value) || 0;
    if (!costo || !venta) {
      precioHintEl.textContent = 'Sugerido: costo + margen. Puede editar el precio de venta manualmente.';
      return;
    }
    const margenReal = ((venta - costo) / costo) * 100;
    precioHintEl.textContent = `Margen sobre costo: ${margenReal.toFixed(1)}%. También se usará como saldo a favor en el POS.`;
  };

  const syncPrecioVenta = () => {
    if (precioVentaManual || margenEl.value === 'custom') {
      updatePrecioHint();
      return;
    }
    const sugerido = calcPrecioSugerido();
    if (sugerido !== null) {
      precioVentaEl.value = sugerido || '';
    }
    updatePrecioHint();
  };

  valoracionEl.addEventListener('input', () => {
    precioVentaManual = false;
    if (margenEl.value === 'custom') margenEl.value = '30';
    syncPrecioVenta();
  });

  margenEl.addEventListener('change', () => {
    if (margenEl.value === 'custom') {
      precioVentaManual = true;
      precioVentaEl.focus();
      updatePrecioHint();
      return;
    }
    precioVentaManual = false;
    syncPrecioVenta();
  });

  precioVentaEl.addEventListener('input', () => {
    precioVentaManual = true;
    if (margenEl.value !== 'custom') margenEl.value = 'custom';
    updatePrecioHint();
  });

  // Submit Trade-In
  document.getElementById('form-registrar-tradein').addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      clienteId: document.getElementById('ti-cliente').value,
      tipoEquipo: document.getElementById('ti-tipo').value.trim(),
      marca: document.getElementById('ti-marca').value.trim(),
      modelo: document.getElementById('ti-modelo').value.trim(),
      imei: document.getElementById('ti-imei').value.trim() || null,
      estadoFisico: document.getElementById('ti-estado').value,
      valoracion: parseFloat(document.getElementById('ti-valoracion').value),
      precioVenta: parseFloat(document.getElementById('ti-precio-venta').value)
    };

    if (!Number.isFinite(payload.valoracion) || payload.valoracion < 0) {
      alert('Ingrese una valoración válida.');
      return;
    }
    if (!Number.isFinite(payload.precioVenta) || payload.precioVenta < 0) {
      alert('Ingrese un precio de venta válido.');
      return;
    }

    if (needsSedePicker) {
      const sedeVal = document.getElementById('ti-sede')?.value;
      if (!sedeVal) {
        alert('Debe seleccionar la sede destino.');
        return;
      }
      payload.sedeId = sedeVal;
    }

    try {
      const res = await apiFetch('/trade-in', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      alert(`Trade-In registrado correctamente.\nEl equipo ingresó al inventario como producto reacondicionado y está listo para ser facturado o usado como parte de pago.`);
      
      // Guardar en el localStorage del POS para cargarlo inmediatamente si están en venta activa
      localStorage.setItem('appliedTradeIn', JSON.stringify({
        id: res.id,
        productoId: res.productoInventarioId,
        valoracion: res.valoracion,
        descripcion: `${payload.marca} ${payload.modelo} (IMEI: ${res.imei})`
      }));

      document.getElementById('form-registrar-tradein').reset();
      precioVentaManual = false;
      margenEl.value = '30';
      loadTradeIns();

    } catch (err) {
      alert(err.message);
    }
  });

  // Cargar Historial
  const loadTradeIns = async () => {
    const tbody = document.getElementById('tradeins-table-body');
    if (!tbody) return;

    try {
      const filterSedeId = usuario.sedeId || document.getElementById('ti-sede')?.value || '';
      const query = filterSedeId ? `?sede=${filterSedeId}` : '';
      const data = await apiFetch(`/trade-in${query}`);

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-secondary">No se han registrado equipos usados todavía.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(ti => {
        let physicalBadge = 'bg-success-lt';
        if (ti.estadoFisico === 'regular') physicalBadge = 'bg-warning-lt';
        else if (ti.estadoFisico === 'malo') physicalBadge = 'bg-danger-lt';

        return `
          <tr>
            <td>${new Date(ti.createdAt).toLocaleDateString()}</td>
            <td>
              <strong class="text-dark">${ti.marca} ${ti.modelo}</strong><br>
              <span class="text-secondary small">${ti.tipoEquipo}</span>
            </td>
            <td><code>${ti.imei || 'N/A'}</code></td>
            <td><span class="badge ${physicalBadge}">${ti.estadoFisico.toUpperCase()}</span></td>
            <td class="text-end fw-bold text-success">${formatter.format(ti.valoracion)}</td>
            <td>${ti.sede ? ti.sede.nombre : 'N/A'}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  };

  await loadTradeIns();
}

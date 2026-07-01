import { apiFetch } from '../api.js';
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  FONT_OPTIONS,
  applyTheme,
  fillThemeForm,
  getPresetTheme,
  isDarkMode,
  mergeTheme,
  readThemeFromForm,
  resolveColorsForMode
} from '../utils/theme.js';

export function renderAparienciaTabHtml() {
  const presetCards = Object.entries(THEME_PRESETS).map(([id, p]) => `
    <button type="button" class="theme-preset-card" data-preset="${id}" title="${p.description}">
      <span class="theme-preset-swatch" style="background:${p.colors.accent}"></span>
      <span class="theme-preset-label">${p.label}</span>
    </button>
  `).join('');

  const fontOptions = FONT_OPTIONS.map(f =>
    `<option value="${f.id}">${f.label}</option>`
  ).join('');

  return `
    <div id="tab-config-apariencia" class="tab-pane" role="tabpanel">
      <form id="form-config-apariencia">
        <input type="hidden" id="theme-preset" value="modern-blue">

        <div class="row g-4">
          <div class="col-lg-7">
            <section class="mb-4">
              <h4 class="text-secondary border-bottom pb-2 mb-3">
                <i class="ti ti-palette me-1"></i> Paletas predefinidas
              </h4>
              <div class="theme-preset-grid">${presetCards}</div>
            </section>

            <section class="mb-4">
              <h4 class="text-secondary border-bottom pb-2 mb-3">
                <i class="ti ti-color-swatch me-1"></i> Colores modo claro
              </h4>
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Acento principal</label>
                  <input type="color" id="theme-accent" class="form-control form-control-color w-100" value="#2563eb">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Acento hover</label>
                  <input type="color" id="theme-accent-hover" class="form-control form-control-color w-100" value="#1d4ed8">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Acento modo oscuro</label>
                  <input type="color" id="theme-accent-dark" class="form-control form-control-color w-100" value="#3b82f6">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Fondo general</label>
                  <input type="color" id="theme-canvas" class="form-control form-control-color w-100" value="#f4f7fb">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Superficie (cards)</label>
                  <input type="color" id="theme-surface" class="form-control form-control-color w-100" value="#ffffff">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Texto principal</label>
                  <input type="color" id="theme-ink" class="form-control form-control-color w-100" value="#0b1220">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Texto secundario</label>
                  <input type="color" id="theme-ink-secondary" class="form-control form-control-color w-100" value="#64748b">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Texto atenuado</label>
                  <input type="color" id="theme-ink-muted" class="form-control form-control-color w-100" value="#94a3b8">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Borde visible</label>
                  <input type="color" id="theme-border-subtle" class="form-control form-control-color w-100" value="#cbd5e1">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Éxito</label>
                  <input type="color" id="theme-success" class="form-control form-control-color w-100" value="#059669">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Advertencia</label>
                  <input type="color" id="theme-warning" class="form-control form-control-color w-100" value="#d97706">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Error</label>
                  <input type="color" id="theme-danger" class="form-control form-control-color w-100" value="#dc2626">
                </div>
                <input type="hidden" id="theme-border-hairline" value="rgba(15, 23, 42, 0.04)">
              </div>
            </section>

            <section class="mb-4 theme-dark-colors-section">
              <h4 class="text-secondary border-bottom pb-2 mb-3">
                <i class="ti ti-moon me-1"></i> Colores modo oscuro
              </h4>
              <p class="text-secondary small mb-3">Ajusta fondos y textos cuando el usuario activa el modo oscuro. El acento usa el color «Acento modo oscuro» de arriba.</p>
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Fondo general</label>
                  <input type="color" id="theme-dark-canvas" class="form-control form-control-color w-100 theme-color-input" value="#0a0e17">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Superficie (cards)</label>
                  <input type="color" id="theme-dark-surface" class="form-control form-control-color w-100 theme-color-input" value="#121a2b">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Texto principal</label>
                  <input type="color" id="theme-dark-ink" class="form-control form-control-color w-100 theme-color-input" value="#f1f5f9">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Texto secundario</label>
                  <input type="color" id="theme-dark-ink-secondary" class="form-control form-control-color w-100 theme-color-input" value="#94a3b8">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Texto atenuado</label>
                  <input type="color" id="theme-dark-ink-muted" class="form-control form-control-color w-100 theme-color-input" value="#64748b">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Borde visible</label>
                  <input type="color" id="theme-dark-border" class="form-control form-control-color w-100 theme-color-input" value="#334155">
                </div>
              </div>
            </section>

            <section class="mb-4">
              <h4 class="text-secondary border-bottom pb-2 mb-3">
                <i class="ti ti-typography me-1"></i> Tipografía y forma
              </h4>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Fuente principal</label>
                  <select id="theme-font" class="form-select">${fontOptions}</select>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Intensidad de sombras</label>
                  <select id="theme-shadow" class="form-select">
                    <option value="low">Suave</option>
                    <option value="medium" selected>Media</option>
                    <option value="high">Marcada</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold d-flex justify-content-between">
                    <span>Ancho sidebar</span>
                    <span id="theme-sidebar-width-val" class="text-secondary fw-normal">252px</span>
                  </label>
                  <input type="range" id="theme-sidebar-width" class="form-range" min="220" max="300" step="2" value="252">
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold d-flex justify-content-between">
                    <span>Radio de tarjetas</span>
                    <span id="theme-radius-lg-val" class="text-secondary fw-normal">16px</span>
                  </label>
                  <input type="range" id="theme-radius-lg" class="form-range" min="4" max="28" step="2" value="16">
                </div>
                <input type="hidden" id="theme-radius-sm" value="8">
                <input type="hidden" id="theme-radius-md" value="12">
                <input type="hidden" id="theme-radius-xl" value="20">
              </div>
            </section>

            <section class="mb-4">
              <h4 class="text-secondary border-bottom pb-2 mb-3">
                <i class="ti ti-components me-1"></i> Componentes
              </h4>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Estilo de botones</label>
                  <div class="btn-group w-100" role="group">
                    <input type="radio" class="btn-check" name="theme-btn-style" id="btn-style-rounded" value="rounded" checked>
                    <label class="btn btn-outline-secondary" for="btn-style-rounded">Redondeado</label>
                    <input type="radio" class="btn-check" name="theme-btn-style" id="btn-style-pill" value="pill">
                    <label class="btn btn-outline-secondary" for="btn-style-pill">Píldora</label>
                    <input type="radio" class="btn-check" name="theme-btn-style" id="btn-style-square" value="square">
                    <label class="btn btn-outline-secondary" for="btn-style-square">Cuadrado</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Estilo de tarjetas</label>
                  <div class="btn-group w-100" role="group">
                    <input type="radio" class="btn-check" name="theme-card-style" id="card-style-flat" value="flat">
                    <label class="btn btn-outline-secondary" for="card-style-flat">Plano</label>
                    <input type="radio" class="btn-check" name="theme-card-style" id="card-style-elevated" value="elevated" checked>
                    <label class="btn btn-outline-secondary" for="card-style-elevated">Elevado</label>
                    <input type="radio" class="btn-check" name="theme-card-style" id="card-style-bordered" value="bordered">
                    <label class="btn btn-outline-secondary" for="card-style-bordered">Borde</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-check form-switch mt-2">
                    <input class="form-check-input" type="checkbox" id="theme-mesh" checked>
                    <span class="form-check-label fw-semibold">Gradiente ambiental en fondo</span>
                  </label>
                </div>
                <div class="col-md-6">
                  <label class="form-check form-switch mt-2">
                    <input class="form-check-input" type="checkbox" id="theme-nav-bar" checked>
                    <span class="form-check-label fw-semibold">Barra de acento en menú activo</span>
                  </label>
                </div>
              </div>
            </section>

            <div class="d-flex flex-wrap gap-2">
              <button type="submit" class="btn btn-primary">
                <i class="ti ti-device-floppy me-1"></i> Guardar apariencia
              </button>
              <button type="button" class="btn btn-outline-secondary" id="btn-theme-reset">
                <i class="ti ti-refresh me-1"></i> Restaurar predeterminado
              </button>
            </div>
          </div>

          <div class="col-lg-5">
            <div class="theme-preview-panel sticky-top" style="top: 5rem;">
              <h4 class="text-secondary mb-1"><i class="ti ti-eye me-1"></i> Vista previa en vivo</h4>
              <p class="theme-preview-mode-label small mb-3" id="theme-preview-mode-label">Modo claro</p>
              <div class="theme-preview-mock">
                <div class="theme-preview-sidebar">
                  <div class="theme-preview-brand">TechStore</div>
                  <div class="theme-preview-nav-item active">Dashboard</div>
                  <div class="theme-preview-nav-item">Punto de venta</div>
                  <div class="theme-preview-nav-item">Inventario</div>
                </div>
                <div class="theme-preview-main">
                  <div class="theme-preview-card">
                    <div class="theme-preview-card-title">Ventas del día</div>
                    <div class="theme-preview-card-value">$ 2.450.000</div>
                    <button type="button" class="theme-preview-btn">Ver detalle</button>
                  </div>
                  <div class="theme-preview-input"></div>
                </div>
              </div>
              <p class="text-secondary small mt-3 mb-0">Los cambios se aplican al instante. Guarda para que todos los usuarios vean la misma apariencia.</p>
            </div>
          </div>
        </div>
      </form>
    </div>
  `;
}

function syncPreviewPanel(theme) {
  const panel = document.querySelector('.theme-preview-mock');
  if (!panel) return;
  const dark = isDarkMode();
  const colors = resolveColorsForMode(theme, dark);
  const { layout, buttons, cards } = theme;
  panel.style.setProperty('--preview-accent', colors.accent);
  panel.style.setProperty('--preview-canvas', colors.canvas);
  panel.style.setProperty('--preview-surface', colors.surface);
  panel.style.setProperty('--preview-ink', colors.ink);
  panel.style.setProperty('--preview-ink-secondary', colors.inkSecondary);
  panel.style.setProperty('--preview-border', colors.borderHairline);
  panel.style.setProperty('--preview-radius', `${layout.borderRadiusLg}px`);
  panel.style.setProperty('--preview-btn-radius', buttons.style === 'pill' ? '999px' : buttons.style === 'square' ? '4px' : `${layout.borderRadiusMd}px`);
  panel.dataset.previewTheme = dark ? 'dark' : 'light';
  panel.classList.toggle('preview-card-flat', cards.style === 'flat');
  panel.classList.toggle('preview-card-bordered', cards.style === 'bordered');

  const modeLabel = document.getElementById('theme-preview-mode-label');
  if (modeLabel) {
    modeLabel.textContent = dark
      ? 'Mostrando modo oscuro (como lo ve el usuario ahora)'
      : 'Mostrando modo claro (como lo ve el usuario ahora)';
  }
}

function bindLivePreview(form) {
  const preview = () => {
    const theme = readThemeFromForm(form);
    applyTheme(theme);
    syncPreviewPanel(theme);
    highlightActivePreset(form, theme.preset);
  };

  form.addEventListener('input', preview);
  form.addEventListener('change', preview);

  form.querySelector('#theme-sidebar-width')?.addEventListener('input', (e) => {
    form.querySelector('#theme-sidebar-width-val').textContent = `${e.target.value}px`;
  });
  form.querySelector('#theme-radius-lg')?.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    form.querySelector('#theme-radius-lg-val').textContent = `${v}px`;
    form.querySelector('#theme-radius-sm').value = Math.max(4, v - 8);
    form.querySelector('#theme-radius-md').value = Math.max(6, v - 4);
    form.querySelector('#theme-radius-xl').value = v + 4;
  });

  return preview;
}

function highlightActivePreset(form, presetId) {
  form.querySelectorAll('.theme-preset-card').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === presetId);
  });
}

let aparienciaPanelReady = false;

export function initConfigApariencia(currentTheme) {
  const form = document.getElementById('form-config-apariencia');
  if (!form) return;

  const theme = mergeTheme(currentTheme || DEFAULT_THEME);
  fillThemeForm(form, theme);
  applyTheme(theme);
  syncPreviewPanel(theme);
  highlightActivePreset(form, theme.preset);

  if (aparienciaPanelReady) return;
  aparienciaPanelReady = true;

  const livePreview = bindLivePreview(form);

  window.addEventListener('erp:theme-applied', () => {
    const current = readThemeFromForm(form);
    syncPreviewPanel(current);
  });

  const observer = new MutationObserver(() => {
    syncPreviewPanel(readThemeFromForm(form));
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-bs-theme'] });

  form.querySelectorAll('.theme-preset-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetId = btn.dataset.preset;
      const presetTheme = getPresetTheme(presetId);
      fillThemeForm(form, presetTheme);
      form.querySelector('#theme-preset').value = presetId;
      livePreview();
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const temaInterfaz = readThemeFromForm(form);
    try {
      await apiFetch('/config/sistema', {
        method: 'PUT',
        body: JSON.stringify({ temaInterfaz })
      });
      applyTheme(temaInterfaz);
      alert('Apariencia guardada. Todos los usuarios verán estos cambios al recargar.');
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btn-theme-reset')?.addEventListener('click', () => {
    fillThemeForm(form, DEFAULT_THEME);
    form.querySelector('#theme-preset').value = 'modern-blue';
    livePreview();
  });
}

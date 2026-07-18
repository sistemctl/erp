import { apiFetch } from '../api.js';
import { showToast, showConfirm } from '../utils/toast.js';
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  FONT_OPTIONS,
  applyTheme,
  fillThemeForm,
  getPresetTheme,
  detectPresetId,
  mergeTheme,
  readThemeFromForm,
  resolveColorsForMode,
  themesLookEqual
} from '../utils/theme.js';

let aparienciaBound = false;
let savedTheme = null;
let brandMeta = { empresa: 'ERP', logoUrl: '' };
let onThemeSaved = null;
let previewDark = false;
let dirty = false;

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
              <div class="theme-preset-grid">
                ${presetCards}
                <button type="button" class="theme-preset-card theme-preset-card--custom" data-preset="custom" title="Colores y controles ajustados a mano">
                  <span class="theme-preset-swatch theme-preset-swatch--custom"></span>
                  <span class="theme-preset-label">Personalizado</span>
                </button>
              </div>
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
              <p class="text-secondary small mb-3">Fondos, textos y acento cuando el usuario activa el modo oscuro. Usa el interruptor de la vista previa para afinarlos.</p>
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Acento modo oscuro</label>
                  <input type="color" id="theme-accent-dark" class="form-control form-control-color w-100" value="#3b82f6">
                </div>
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
                    <span id="theme-sidebar-width-val" class="text-secondary fw-normal">236px</span>
                  </label>
                  <input type="range" id="theme-sidebar-width" class="form-range" min="220" max="300" step="2" value="236">
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

            <div class="d-flex flex-wrap gap-2 align-items-center">
              <button type="submit" class="btn btn-primary" id="btn-theme-save" disabled>
                <i class="ti ti-device-floppy me-1"></i> Guardar apariencia
              </button>
              <button type="button" class="btn btn-outline-secondary" id="btn-theme-discard" disabled>
                <i class="ti ti-arrow-back-up me-1"></i> Descartar
              </button>
              <button type="button" class="btn btn-outline-secondary" id="btn-theme-reset">
                <i class="ti ti-refresh me-1"></i> Restaurar predeterminado
              </button>
              <span class="theme-dirty-hint text-secondary small ms-1 d-none" id="theme-dirty-hint">Cambios sin guardar</span>
            </div>
          </div>

          <div class="col-lg-5">
            <div class="theme-preview-panel sticky-top" style="top: 5rem;">
              <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <h4 class="text-secondary mb-1"><i class="ti ti-eye me-1"></i> Vista previa</h4>
                  <p class="theme-preview-mode-label small mb-0" id="theme-preview-mode-label">Modo claro</p>
                </div>
                <div class="btn-group btn-group-sm theme-preview-mode-toggle" role="group" aria-label="Modo de vista previa">
                  <button type="button" class="btn btn-outline-secondary" id="btn-preview-light" data-preview-mode="light">Claro</button>
                  <button type="button" class="btn btn-outline-secondary" id="btn-preview-dark" data-preview-mode="dark">Oscuro</button>
                </div>
              </div>
              <div class="theme-preview-mock" id="theme-preview-mock">
                <div class="theme-preview-sidebar">
                  <div class="theme-preview-brand" id="theme-preview-brand">
                    <img id="theme-preview-logo" class="theme-preview-logo d-none" alt="" />
                    <span id="theme-preview-brand-name">ERP</span>
                  </div>
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
              <p class="text-secondary small mt-3 mb-0">La vista previa no cambia el ERP hasta que guardes. Así evitas dejar un tema a medias en esta sesión.</p>
            </div>
          </div>
        </div>
      </form>
    </div>
  `;
}

function setDirty(next) {
  dirty = !!next;
  const saveBtn = document.getElementById('btn-theme-save');
  const discardBtn = document.getElementById('btn-theme-discard');
  const hint = document.getElementById('theme-dirty-hint');
  if (saveBtn) saveBtn.disabled = !dirty;
  if (discardBtn) discardBtn.disabled = !dirty;
  hint?.classList.toggle('d-none', !dirty);
}

export function isAparienciaDirty() {
  return dirty;
}

function syncBrandPreview() {
  const nameEl = document.getElementById('theme-preview-brand-name');
  const logoEl = document.getElementById('theme-preview-logo');
  const name = (brandMeta.empresa || 'ERP').trim() || 'ERP';
  if (nameEl) nameEl.textContent = name;
  if (logoEl) {
    const url = (brandMeta.logoUrl || '').trim();
    if (url) {
      logoEl.src = url;
      logoEl.alt = name;
      logoEl.classList.remove('d-none');
    } else {
      logoEl.removeAttribute('src');
      logoEl.classList.add('d-none');
    }
  }
}

function syncPreviewPanel(theme) {
  const panel = document.getElementById('theme-preview-mock');
  if (!panel) return;
  const dark = previewDark;
  const colors = resolveColorsForMode(theme, dark);
  const { layout, buttons, cards } = theme;
  panel.style.setProperty('--preview-accent', colors.accent);
  panel.style.setProperty('--preview-canvas', colors.canvas);
  panel.style.setProperty('--preview-surface', colors.surface);
  panel.style.setProperty('--preview-ink', colors.ink);
  panel.style.setProperty('--preview-ink-secondary', colors.inkSecondary);
  panel.style.setProperty('--preview-border', colors.borderHairline);
  panel.style.setProperty('--preview-radius', `${layout.borderRadiusLg}px`);
  panel.style.setProperty(
    '--preview-btn-radius',
    buttons.style === 'pill' ? '999px' : buttons.style === 'square' ? '4px' : `${layout.borderRadiusMd}px`
  );
  panel.dataset.previewTheme = dark ? 'dark' : 'light';
  panel.classList.toggle('preview-card-flat', cards.style === 'flat');
  panel.classList.toggle('preview-card-bordered', cards.style === 'bordered');

  const modeLabel = document.getElementById('theme-preview-mode-label');
  if (modeLabel) {
    modeLabel.textContent = dark ? 'Vista previa · modo oscuro' : 'Vista previa · modo claro';
  }

  document.getElementById('btn-preview-light')?.classList.toggle('active', !dark);
  document.getElementById('btn-preview-dark')?.classList.toggle('active', dark);
  syncBrandPreview();
}

function highlightActivePreset(form, presetId) {
  form.querySelectorAll('.theme-preset-card').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === presetId);
  });
}

function refreshFromForm(form, { markDirty = true } = {}) {
  let theme = readThemeFromForm(form);
  const detected = detectPresetId(theme);
  theme = mergeTheme({ ...theme, preset: detected });
  const presetInput = form.querySelector('#theme-preset');
  if (presetInput) presetInput.value = detected;
  highlightActivePreset(form, detected);
  syncPreviewPanel(theme);

  if (markDirty && savedTheme) {
    setDirty(!themesLookEqual(theme, savedTheme));
  }
  return theme;
}

function loadThemeIntoForm(form, theme, { markClean = false } = {}) {
  const merged = mergeTheme(theme || DEFAULT_THEME);
  const preset = detectPresetId(merged);
  const withPreset = mergeTheme({ ...merged, preset });
  fillThemeForm(form, withPreset);
  form.querySelector('#theme-preset').value = preset;
  highlightActivePreset(form, preset);
  syncPreviewPanel(withPreset);
  if (markClean) {
    savedTheme = mergeTheme(withPreset);
    setDirty(false);
  }
}

/**
 * @param {object|null} currentTheme
 * @param {{ empresa?: string, logoUrl?: string, onSaved?: (t: object) => void, forceReload?: boolean }} [options]
 */
export function initConfigApariencia(currentTheme, options = {}) {
  const form = document.getElementById('form-config-apariencia');
  if (!form) return;

  brandMeta = {
    empresa: options.empresa || document.getElementById('cfg-empresa')?.value || 'ERP',
    logoUrl: options.logoUrl || document.getElementById('cfg-logourl')?.value || ''
  };
  if (typeof options.onSaved === 'function') onThemeSaved = options.onSaved;

  if (dirty && !options.forceReload) {
    syncBrandPreview();
    refreshFromForm(form, { markDirty: true });
    return;
  }

  loadThemeIntoForm(form, currentTheme || DEFAULT_THEME, { markClean: true });

  if (aparienciaBound) return;
  aparienciaBound = true;

  form.addEventListener('input', () => refreshFromForm(form));
  form.addEventListener('change', () => refreshFromForm(form));

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

  form.querySelectorAll('.theme-preset-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetId = btn.dataset.preset;
      if (presetId === 'custom') {
        form.querySelector('#theme-preset').value = 'custom';
        highlightActivePreset(form, 'custom');
        refreshFromForm(form);
        return;
      }
      const presetTheme = getPresetTheme(presetId);
      fillThemeForm(form, presetTheme);
      form.querySelector('#theme-preset').value = presetId;
      refreshFromForm(form);
    });
  });

  document.getElementById('btn-preview-light')?.addEventListener('click', () => {
    previewDark = false;
    syncPreviewPanel(readThemeFromForm(form));
  });
  document.getElementById('btn-preview-dark')?.addEventListener('click', () => {
    previewDark = true;
    syncPreviewPanel(readThemeFromForm(form));
  });
  document.getElementById('btn-preview-light')?.classList.add('active');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!dirty) return;
    const temaInterfaz = refreshFromForm(form, { markDirty: false });
    const saveBtn = document.getElementById('btn-theme-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="ti ti-loader-2 me-1"></i> Guardando…';
    }
    try {
      await apiFetch('/config/sistema', {
        method: 'PUT',
        body: JSON.stringify({ temaInterfaz })
      });
      applyTheme(temaInterfaz);
      savedTheme = mergeTheme(temaInterfaz);
      setDirty(false);
      onThemeSaved?.(temaInterfaz);
      showToast('Apariencia', 'Guardada. Todos los usuarios la verán al recargar.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'No se pudo guardar la apariencia.', 'error');
      setDirty(true);
    } finally {
      if (saveBtn) {
        saveBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar apariencia';
        saveBtn.disabled = !dirty;
      }
    }
  });

  document.getElementById('btn-theme-discard')?.addEventListener('click', async () => {
    if (!dirty) return;
    const ok = await showConfirm(
      'Descartar cambios',
      'Se perderán los ajustes de apariencia que no hayas guardado.'
    );
    if (!ok) return;
    loadThemeIntoForm(form, savedTheme || DEFAULT_THEME, { markClean: true });
    showToast('Apariencia', 'Cambios descartados.', 'success');
  });

  document.getElementById('btn-theme-reset')?.addEventListener('click', async () => {
    const ok = await showConfirm(
      'Restaurar predeterminado',
      'Se cargará el tema azul moderno en el formulario. Debes guardar para aplicarlo a todos.'
    );
    if (!ok) return;
    fillThemeForm(form, DEFAULT_THEME);
    form.querySelector('#theme-preset').value = 'modern-blue';
    refreshFromForm(form);
  });

  const aparienciaTabLink = document.querySelector('a[href="#tab-config-apariencia"]');
  if (aparienciaTabLink) {
    aparienciaTabLink.addEventListener('hide.bs.tab', async (ev) => {
      if (!dirty) return;
      ev.preventDefault();
      const ok = await showConfirm(
        'Cambios sin guardar',
        'Tienes cambios de apariencia sin guardar. ¿Salir y descartarlos?'
      );
      if (!ok) return;
      loadThemeIntoForm(form, savedTheme || DEFAULT_THEME, { markClean: true });
      const target = ev.relatedTarget;
      if (target) {
        bootstrap.Tab.getOrCreateInstance(target).show();
      }
    });
  }
}

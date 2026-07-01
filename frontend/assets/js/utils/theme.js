/**
 * ERP Theme Engine — applies interface customization via CSS variables + body classes.
 */

export const DEFAULT_DARK_COLORS = {
  canvas: '#0a0e17',
  surface: '#121a2b',
  ink: '#f1f5f9',
  inkSecondary: '#94a3b8',
  inkMuted: '#64748b',
  borderSubtle: 'rgba(255, 255, 255, 0.09)',
  borderHairline: 'rgba(255, 255, 255, 0.05)',
};

export function isDarkMode() {
  return document.body.getAttribute('data-bs-theme') === 'dark';
}

export function deriveDarkColors(lightColors = {}) {
  const accent = lightColors.accentDark || lightColors.accent || '#3b82f6';
  return {
    ...DEFAULT_DARK_COLORS,
    accentSoft: hexToRgba(accent, 0.14),
    accentGlow: hexToRgba(accent, 0.22),
  };
}

export function resolveColorsForMode(theme, dark = isDarkMode()) {
  const light = theme.colors || DEFAULT_THEME.colors;
  if (!dark) return { ...light };

  const derived = deriveDarkColors(light);
  const custom = theme.colorsDark || {};
  const accent = custom.accent || light.accentDark || light.accent;

  return {
    ...light,
    ...derived,
    ...custom,
    accent,
    accentHover: custom.accentHover || light.accentDark || light.accentHover,
    accentDark: custom.accentDark || light.accentDark || accent,
    accentSoft: custom.accentSoft || derived.accentSoft,
    accentGlow: custom.accentGlow || derived.accentGlow,
  };
}

const DARK_SHADOW_SCALES = {
  low: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 2px 8px rgba(0, 0, 0, 0.25)',
    md: '0 8px 24px -4px rgba(0, 0, 0, 0.35)',
    lg: '0 16px 40px -8px rgba(0, 0, 0, 0.45)'
  },
  medium: {
    xs: '0 1px 3px rgba(0, 0, 0, 0.22)',
    sm: '0 4px 12px rgba(0, 0, 0, 0.28)',
    md: '0 12px 32px -6px rgba(0, 0, 0, 0.38)',
    lg: '0 20px 48px -10px rgba(0, 0, 0, 0.5)'
  },
  high: {
    xs: '0 2px 6px rgba(0, 0, 0, 0.3)',
    sm: '0 6px 16px rgba(0, 0, 0, 0.35)',
    md: '0 16px 40px -8px rgba(0, 0, 0, 0.45)',
    lg: '0 24px 56px -12px rgba(0, 0, 0, 0.55)'
  }
};

export const DEFAULT_THEME = {
  preset: 'modern-blue',
  colors: {
    accent: '#2563eb',
    accentHover: '#1d4ed8',
    accentDark: '#3b82f6',
    accentSoft: 'rgba(37, 99, 235, 0.08)',
    accentGlow: 'rgba(37, 99, 235, 0.12)',
    canvas: '#f4f7fb',
    surface: '#ffffff',
    ink: '#0b1220',
    inkSecondary: '#64748b',
    inkMuted: '#94a3b8',
    borderSubtle: 'rgba(15, 23, 42, 0.07)',
    borderHairline: 'rgba(15, 23, 42, 0.04)',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626'
  },
  colorsDark: {
    ...DEFAULT_DARK_COLORS,
    accentSoft: 'rgba(59, 130, 246, 0.14)',
    accentGlow: 'rgba(59, 130, 246, 0.22)',
  },
  typography: {
    fontFamily: 'Plus Jakarta Sans',
    fontWeights: '300;400;500;600;700;800'
  },
  layout: {
    sidebarWidth: 252,
    borderRadiusSm: 8,
    borderRadiusMd: 12,
    borderRadiusLg: 16,
    borderRadiusXl: 20
  },
  buttons: {
    style: 'rounded'
  },
  cards: {
    style: 'elevated'
  },
  effects: {
    meshGradient: true,
    shadowIntensity: 'medium',
    sidebarAccentBar: true
  }
};

export const THEME_PRESETS = {
  'modern-blue': {
    label: 'Azul moderno',
    description: 'Blanco limpio con acento azul — predeterminado',
    colors: { accent: '#2563eb', accentHover: '#1d4ed8', accentDark: '#3b82f6' }
  },
  'ocean-teal': {
    label: 'Océano teal',
    description: 'Fresco y profesional para retail tech',
    colors: { accent: '#0d9488', accentHover: '#0f766e', accentDark: '#14b8a6', accentSoft: 'rgba(13, 148, 136, 0.08)', accentGlow: 'rgba(13, 148, 136, 0.12)' }
  },
  'violet-pro': {
    label: 'Violeta pro',
    description: 'Sofisticado con acento púrpura',
    colors: { accent: '#7c3aed', accentHover: '#6d28d9', accentDark: '#8b5cf6', accentSoft: 'rgba(124,  58, 237, 0.08)', accentGlow: 'rgba(124, 58, 237, 0.12)' }
  },
  'emerald-retail': {
    label: 'Esmeralda retail',
    description: 'Verde confiable para operaciones',
    colors: { accent: '#059669', accentHover: '#047857', accentDark: '#10b981', accentSoft: 'rgba(5, 150, 105, 0.08)', accentGlow: 'rgba(5, 150, 105, 0.12)' }
  },
  'indigo-night': {
    label: 'Índigo corporativo',
    description: 'Profundo y serio para finanzas',
    colors: { accent: '#4f46e5', accentHover: '#4338ca', accentDark: '#6366f1', accentSoft: 'rgba(79, 70, 229, 0.08)', accentGlow: 'rgba(79, 70, 229, 0.12)' }
  },
  'slate-minimal': {
    label: 'Slate minimal',
    description: 'Neutro, casi monocromático',
    colors: { accent: '#334155', accentHover: '#1e293b', accentDark: '#475569', accentSoft: 'rgba(51, 65, 85, 0.08)', accentGlow: 'rgba(51, 65, 85, 0.1)', canvas: '#f8fafc' }
  }
};

export const FONT_OPTIONS = [
  { id: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', weights: '300;400;500;600;700;800' },
  { id: 'Inter', label: 'Inter', weights: '400;500;600;700;800' },
  { id: 'DM Sans', label: 'DM Sans', weights: '400;500;600;700' },
  { id: 'Outfit', label: 'Outfit', weights: '400;500;600;700;800' },
  { id: 'Sora', label: 'Sora', weights: '400;500;600;700' },
  { id: 'Manrope', label: 'Manrope', weights: '400;500;600;700;800' }
];

const SHADOW_SCALES = {
  low: {
    xs: '0 1px 2px rgba(15, 23, 42, 0.02)',
    sm: '0 1px 4px rgba(15, 23, 42, 0.03)',
    md: '0 4px 16px -4px rgba(15, 23, 42, 0.05)',
    lg: '0 8px 32px -8px rgba(15, 23, 42, 0.07)'
  },
  medium: {
    xs: '0 1px 2px rgba(15, 23, 42, 0.03)',
    sm: '0 2px 8px rgba(15, 23, 42, 0.04)',
    md: '0 8px 32px -8px rgba(15, 23, 42, 0.07)',
    lg: '0 16px 48px -12px rgba(15, 23, 42, 0.09)'
  },
  high: {
    xs: '0 2px 4px rgba(15, 23, 42, 0.05)',
    sm: '0 4px 12px rgba(15, 23, 42, 0.07)',
    md: '0 12px 40px -8px rgba(15, 23, 42, 0.1)',
    lg: '0 24px 64px -12px rgba(15, 23, 42, 0.14)'
  }
};

const STORAGE_KEY = 'erp_theme';
let fontLinkEl = null;

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return structuredClone(base);
  const out = structuredClone(base);
  for (const key of Object.keys(override)) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      out[key] = deepMerge(out[key] || {}, override[key]);
    } else if (override[key] !== undefined && override[key] !== null) {
      out[key] = override[key];
    }
  }
  return out;
}

export function mergeTheme(custom) {
  return deepMerge(DEFAULT_THEME, custom);
}

export function getPresetTheme(presetId) {
  const preset = THEME_PRESETS[presetId];
  if (!preset) return mergeTheme({ preset: 'modern-blue' });
  return mergeTheme({ preset: presetId, ...preset, colors: { ...DEFAULT_THEME.colors, ...preset.colors } });
}

function loadFont(typography) {
  const family = typography.fontFamily || DEFAULT_THEME.typography.fontFamily;
  const weights = typography.fontWeights || '400;500;600;700';
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights}&display=swap`;

  if (!fontLinkEl) {
    fontLinkEl = document.getElementById('theme-font-link');
  }
  if (!fontLinkEl) {
    fontLinkEl = document.createElement('link');
    fontLinkEl.id = 'theme-font-link';
    fontLinkEl.rel = 'stylesheet';
    document.head.appendChild(fontLinkEl);
  }
  if (fontLinkEl.getAttribute('href') !== href) {
    fontLinkEl.href = href;
  }
}

export function applyTheme(rawTheme) {
  const theme = mergeTheme(rawTheme);
  const root = document.documentElement;
  const { layout, typography, buttons, cards, effects } = theme;
  const dark = isDarkMode();
  const colors = resolveColorsForMode(theme, dark);

  const shadowSource = dark ? DARK_SHADOW_SCALES : SHADOW_SCALES;
  const shadows = shadowSource[effects.shadowIntensity] || shadowSource.medium;

  root.style.setProperty('--accent-color', colors.accent);
  root.style.setProperty('--accent-hover', colors.accentHover);
  root.style.setProperty('--accent-dark', colors.accentDark);
  root.style.setProperty('--accent-soft', colors.accentSoft || hexToRgba(colors.accent, dark ? 0.14 : 0.08));
  root.style.setProperty('--accent-glow', colors.accentGlow || hexToRgba(colors.accent, dark ? 0.22 : 0.12));
  root.style.setProperty('--canvas', colors.canvas);
  root.style.setProperty('--surface', colors.surface);
  root.style.setProperty('--ink', colors.ink);
  root.style.setProperty('--ink-secondary', colors.inkSecondary);
  root.style.setProperty('--ink-muted', colors.inkMuted);
  root.style.setProperty('--border-subtle', colors.borderSubtle);
  root.style.setProperty('--border-hairline', colors.borderHairline);
  root.style.setProperty('--color-success', colors.success);
  root.style.setProperty('--color-warning', colors.warning);
  root.style.setProperty('--color-danger', colors.danger);

  root.style.setProperty('--erp-ink', colors.ink);
  root.style.setProperty('--erp-muted', colors.inkSecondary);
  root.style.setProperty('--erp-line', colors.borderSubtle);
  root.style.setProperty('--erp-surface', colors.surface);
  root.style.setProperty('--erp-accent', colors.accent);
  root.style.setProperty('--erp-accent-soft', colors.accentSoft || hexToRgba(colors.accent, dark ? 0.14 : 0.12));

  root.style.setProperty('--sidebar-width', `${layout.sidebarWidth}px`);
  root.style.setProperty('--radius-sm', `${layout.borderRadiusSm}px`);
  root.style.setProperty('--radius-md', `${layout.borderRadiusMd}px`);
  root.style.setProperty('--radius-lg', `${layout.borderRadiusLg}px`);
  root.style.setProperty('--radius-xl', `${layout.borderRadiusXl}px`);

  root.style.setProperty('--shadow-xs', shadows.xs);
  root.style.setProperty('--shadow-sm', shadows.sm);
  root.style.setProperty('--shadow-md', shadows.md);
  root.style.setProperty('--shadow-lg', shadows.lg);

  loadFont(typography);
  document.body.style.fontFamily = `'${typography.fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`;
  document.body.style.backgroundColor = colors.canvas;
  document.body.style.color = colors.ink;
  document.body.classList.toggle('erp-dark', dark);

  document.body.dataset.themePreset = theme.preset || 'custom';

  document.body.classList.toggle('theme-no-mesh', !effects.meshGradient);
  document.body.classList.toggle('theme-no-nav-bar', !effects.sidebarAccentBar);

  document.body.classList.remove('btn-style-rounded', 'btn-style-pill', 'btn-style-square');
  document.body.classList.add(`btn-style-${buttons.style || 'rounded'}`);

  document.body.classList.remove('card-style-flat', 'card-style-elevated', 'card-style-bordered');
  document.body.classList.add(`card-style-${cards.style || 'elevated'}`);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', colors.surface);

  const loginStage = dark ? colors.canvas : colors.ink;
  const loginInputBg = dark ? hexToRgba(colors.ink, 0.06) : colors.canvas;
  const loginInputHover = dark ? hexToRgba(colors.ink, 0.09) : hexToRgba(colors.ink, 0.04);

  root.style.setProperty('--login-ink', colors.ink);
  root.style.setProperty('--login-muted', colors.inkSecondary);
  root.style.setProperty('--login-canvas', colors.canvas);
  root.style.setProperty('--login-surface', colors.surface);
  root.style.setProperty('--login-accent', colors.accent);
  root.style.setProperty('--login-accent-hover', colors.accentHover);
  root.style.setProperty('--login-accent-glow', colors.accentDark);
  root.style.setProperty('--login-accent-soft', colors.accentSoft || hexToRgba(colors.accent, dark ? 0.14 : 0.08));
  root.style.setProperty('--login-accent-ring', hexToRgba(colors.accent, dark ? 0.28 : 0.12));
  root.style.setProperty('--login-stage', loginStage);
  root.style.setProperty('--login-stage-surface', dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.06)');
  root.style.setProperty('--login-stage-glow', hexToRgba(colors.accent, 0.35));
  root.style.setProperty('--login-input-bg', loginInputBg);
  root.style.setProperty('--login-input-hover', loginInputHover);
  root.style.setProperty('--login-radius-md', `${layout.borderRadiusMd}px`);
  root.style.setProperty('--login-radius-lg', `${layout.borderRadiusLg}px`);
  root.style.setProperty('--login-radius-xl', `${layout.borderRadiusXl}px`);
  root.style.setProperty('--login-shadow-lg', shadows.lg);
  root.style.setProperty('--login-danger', colors.danger);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch (_) { /* quota */ }

  window.dispatchEvent(new CustomEvent('erp:theme-applied', { detail: { ...theme, activeColors: colors, dark } }));
  return theme;
}

export function applyThemeFromCache() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return applyTheme(JSON.parse(cached));
  } catch (_) { /* ignore */ }
  return applyTheme(DEFAULT_THEME);
}

export async function initThemeFromServer(apiFetchFn) {
  try {
    const config = await apiFetchFn('/config/sistema');
    if (config?.temaInterfaz && Object.keys(config.temaInterfaz).length > 0) {
      return applyTheme(config.temaInterfaz);
    }
  } catch (_) {
    /* not authenticated or network error */
  }
  return applyThemeFromCache();
}

export function readThemeFromForm(formRoot) {
  const val = (id) => formRoot.querySelector(`#${id}`)?.value;
  const checked = (id) => formRoot.querySelector(`#${id}`)?.checked;

  const borderHex = val('theme-border-subtle') || '#cbd5e1';

  return mergeTheme({
    preset: val('theme-preset') || 'custom',
    colors: {
      accent: val('theme-accent'),
      accentHover: val('theme-accent-hover'),
      accentDark: val('theme-accent-dark'),
      canvas: val('theme-canvas'),
      surface: val('theme-surface'),
      ink: val('theme-ink'),
      inkSecondary: val('theme-ink-secondary'),
      inkMuted: val('theme-ink-muted'),
      borderSubtle: hexToRgba(borderHex, 0.35),
      borderHairline: hexToRgba(borderHex, 0.18),
      success: val('theme-success'),
      warning: val('theme-warning'),
      danger: val('theme-danger')
    },
    colorsDark: {
      canvas: val('theme-dark-canvas'),
      surface: val('theme-dark-surface'),
      ink: val('theme-dark-ink'),
      inkSecondary: val('theme-dark-ink-secondary'),
      inkMuted: val('theme-dark-ink-muted'),
      borderSubtle: hexToRgba(val('theme-dark-border') || '#334155', 0.45),
      borderHairline: hexToRgba(val('theme-dark-border') || '#334155', 0.22),
    },
    typography: {
      fontFamily: val('theme-font'),
      fontWeights: FONT_OPTIONS.find(f => f.id === val('theme-font'))?.weights || '400;600;700'
    },
    layout: {
      sidebarWidth: parseInt(val('theme-sidebar-width'), 10) || 252,
      borderRadiusSm: parseInt(val('theme-radius-sm'), 10) || 8,
      borderRadiusMd: parseInt(val('theme-radius-md'), 10) || 12,
      borderRadiusLg: parseInt(val('theme-radius-lg'), 10) || 16,
      borderRadiusXl: parseInt(val('theme-radius-xl'), 10) || 20
    },
    buttons: { style: formRoot.querySelector('input[name="theme-btn-style"]:checked')?.value || 'rounded' },
    cards: { style: formRoot.querySelector('input[name="theme-card-style"]:checked')?.value || 'elevated' },
    effects: {
      meshGradient: checked('theme-mesh'),
      shadowIntensity: val('theme-shadow') || 'medium',
      sidebarAccentBar: checked('theme-nav-bar')
    }
  });
}

export function fillThemeForm(formRoot, theme) {
  const t = mergeTheme(theme);
  const set = (id, value) => {
    const el = formRoot.querySelector(`#${id}`);
    if (el) el.value = value;
  };
  const setCheck = (id, value) => {
    const el = formRoot.querySelector(`#${id}`);
    if (el) el.checked = !!value;
  };

  set('theme-preset', t.preset);
  set('theme-accent', t.colors.accent);
  set('theme-accent-hover', t.colors.accentHover);
  set('theme-accent-dark', t.colors.accentDark);
  set('theme-canvas', t.colors.canvas);
  set('theme-surface', t.colors.surface);
  set('theme-ink', t.colors.ink);
  set('theme-ink-secondary', t.colors.inkSecondary);
  set('theme-ink-muted', t.colors.inkMuted);
  set('theme-border-subtle', rgbaToHex(t.colors.borderSubtle) || '#e2e8f0');
  set('theme-border-hairline', rgbaToHex(t.colors.borderHairline) || '#f1f5f9');
  set('theme-success', t.colors.success);
  set('theme-warning', t.colors.warning);
  set('theme-danger', t.colors.danger);
  const dark = t.colorsDark || DEFAULT_THEME.colorsDark;
  set('theme-dark-canvas', dark.canvas || DEFAULT_DARK_COLORS.canvas);
  set('theme-dark-surface', dark.surface || DEFAULT_DARK_COLORS.surface);
  set('theme-dark-ink', dark.ink || DEFAULT_DARK_COLORS.ink);
  set('theme-dark-ink-secondary', dark.inkSecondary || DEFAULT_DARK_COLORS.inkSecondary);
  set('theme-dark-ink-muted', dark.inkMuted || DEFAULT_DARK_COLORS.inkMuted);
  set('theme-dark-border', rgbaToHex(dark.borderSubtle) || '#334155');
  set('theme-font', t.typography.fontFamily);
  set('theme-sidebar-width', t.layout.sidebarWidth);
  set('theme-radius-sm', t.layout.borderRadiusSm);
  set('theme-radius-md', t.layout.borderRadiusMd);
  set('theme-radius-lg', t.layout.borderRadiusLg);
  set('theme-radius-xl', t.layout.borderRadiusXl);
  set('theme-shadow', t.effects.shadowIntensity);
  setCheck('theme-mesh', t.effects.meshGradient);
  setCheck('theme-nav-bar', t.effects.sidebarAccentBar);

  const btnRadio = formRoot.querySelector(`input[name="theme-btn-style"][value="${t.buttons.style}"]`);
  if (btnRadio) btnRadio.checked = true;
  const cardRadio = formRoot.querySelector(`input[name="theme-card-style"][value="${t.cards.style}"]`);
  if (cardRadio) cardRadio.checked = true;

  formRoot.querySelector('#theme-sidebar-width-val')?.replaceChildren(document.createTextNode(`${t.layout.sidebarWidth}px`));
  formRoot.querySelector('#theme-radius-lg-val')?.replaceChildren(document.createTextNode(`${t.layout.borderRadiusLg}px`));
}

function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return `rgba(37, 99, 235, ${alpha})`;
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function rgbaToHex(color) {
  if (!color) return null;
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(x => parseInt(x, 10).toString(16).padStart(2, '0')).join('');
}

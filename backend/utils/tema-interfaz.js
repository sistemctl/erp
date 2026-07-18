const PRESET_IDS = new Set([
  'modern-blue',
  'ocean-teal',
  'violet-pro',
  'emerald-retail',
  'indigo-night',
  'slate-minimal',
  'custom'
]);

const FONT_IDS = new Set([
  'Plus Jakarta Sans',
  'Inter',
  'DM Sans',
  'Outfit',
  'Sora',
  'Manrope'
]);

const BUTTON_STYLES = new Set(['rounded', 'pill', 'square']);
const CARD_STYLES = new Set(['flat', 'elevated', 'bordered']);
const SHADOW_LEVELS = new Set(['low', 'medium', 'high']);

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGBA_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;

const MAX_JSON_CHARS = 24_000;

function isColor(value) {
  if (typeof value !== 'string' || value.length > 64) return false;
  return HEX_RE.test(value) || RGBA_RE.test(value);
}

function pickColors(src, keys) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return undefined;
  const out = {};
  for (const key of keys) {
    if (src[key] === undefined || src[key] === null) continue;
    if (!isColor(src[key])) {
      const err = new Error(`Color inválido en temaInterfaz: ${key}`);
      err.status = 400;
      throw err;
    }
    out[key] = src[key];
  }
  return Object.keys(out).length ? out : undefined;
}

const LIGHT_COLOR_KEYS = [
  'accent', 'accentHover', 'accentDark', 'accentSoft', 'accentGlow',
  'canvas', 'surface', 'ink', 'inkSecondary', 'inkMuted',
  'borderSubtle', 'borderHairline', 'success', 'warning', 'danger'
];

const DARK_COLOR_KEYS = [
  'accent', 'accentHover', 'accentDark', 'accentSoft', 'accentGlow',
  'canvas', 'surface', 'ink', 'inkSecondary', 'inkMuted',
  'borderSubtle', 'borderHairline'
];

/**
 * Validates and returns a sanitized temaInterfaz object.
 * @param {unknown} raw
 * @returns {object}
 */
function sanitizeTemaInterfaz(raw) {
  if (raw === undefined || raw === null) {
    const err = new Error('temaInterfaz es obligatorio.');
    err.status = 400;
    throw err;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('temaInterfaz debe ser un objeto.');
    err.status = 400;
    throw err;
  }

  let serialized;
  try {
    serialized = JSON.stringify(raw);
  } catch (_) {
    const err = new Error('temaInterfaz no es JSON válido.');
    err.status = 400;
    throw err;
  }
  if (serialized.length > MAX_JSON_CHARS) {
    const err = new Error('temaInterfaz supera el tamaño máximo permitido.');
    err.status = 400;
    throw err;
  }

  const allowedTop = new Set([
    'preset', 'colors', 'colorsDark', 'typography', 'layout', 'buttons', 'cards', 'effects'
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedTop.has(key)) {
      const err = new Error(`Clave no permitida en temaInterfaz: ${key}`);
      err.status = 400;
      throw err;
    }
  }

  const out = {};

  if (raw.preset !== undefined) {
    if (!PRESET_IDS.has(raw.preset)) {
      const err = new Error('Preset de tema inválido.');
      err.status = 400;
      throw err;
    }
    out.preset = raw.preset;
  }

  const colors = pickColors(raw.colors, LIGHT_COLOR_KEYS);
  if (colors) out.colors = colors;

  const colorsDark = pickColors(raw.colorsDark, DARK_COLOR_KEYS);
  if (colorsDark) out.colorsDark = colorsDark;

  if (raw.typography !== undefined) {
    if (!raw.typography || typeof raw.typography !== 'object') {
      const err = new Error('typography inválida.');
      err.status = 400;
      throw err;
    }
    const fontFamily = raw.typography.fontFamily;
    if (fontFamily !== undefined && !FONT_IDS.has(fontFamily)) {
      const err = new Error('Fuente no permitida.');
      err.status = 400;
      throw err;
    }
    out.typography = {};
    if (fontFamily) out.typography.fontFamily = fontFamily;
    if (typeof raw.typography.fontWeights === 'string' && raw.typography.fontWeights.length <= 40) {
      out.typography.fontWeights = raw.typography.fontWeights;
    }
  }

  if (raw.layout !== undefined) {
    if (!raw.layout || typeof raw.layout !== 'object') {
      const err = new Error('layout inválido.');
      err.status = 400;
      throw err;
    }
    const layout = {};
    const intField = (key, min, max) => {
      if (raw.layout[key] === undefined) return;
      const n = parseInt(raw.layout[key], 10);
      if (!Number.isFinite(n) || n < min || n > max) {
        const err = new Error(`layout.${key} fuera de rango (${min}-${max}).`);
        err.status = 400;
        throw err;
      }
      layout[key] = n;
    };
    intField('sidebarWidth', 200, 360);
    intField('borderRadiusSm', 0, 32);
    intField('borderRadiusMd', 0, 40);
    intField('borderRadiusLg', 0, 48);
    intField('borderRadiusXl', 0, 56);
    if (Object.keys(layout).length) out.layout = layout;
  }

  if (raw.buttons !== undefined) {
    const style = raw.buttons?.style;
    if (!BUTTON_STYLES.has(style)) {
      const err = new Error('buttons.style inválido.');
      err.status = 400;
      throw err;
    }
    out.buttons = { style };
  }

  if (raw.cards !== undefined) {
    const style = raw.cards?.style;
    if (!CARD_STYLES.has(style)) {
      const err = new Error('cards.style inválido.');
      err.status = 400;
      throw err;
    }
    out.cards = { style };
  }

  if (raw.effects !== undefined) {
    if (!raw.effects || typeof raw.effects !== 'object') {
      const err = new Error('effects inválido.');
      err.status = 400;
      throw err;
    }
    const effects = {};
    if (raw.effects.meshGradient !== undefined) effects.meshGradient = !!raw.effects.meshGradient;
    if (raw.effects.sidebarAccentBar !== undefined) effects.sidebarAccentBar = !!raw.effects.sidebarAccentBar;
    if (raw.effects.shadowIntensity !== undefined) {
      if (!SHADOW_LEVELS.has(raw.effects.shadowIntensity)) {
        const err = new Error('effects.shadowIntensity inválido.');
        err.status = 400;
        throw err;
      }
      effects.shadowIntensity = raw.effects.shadowIntensity;
    }
    if (Object.keys(effects).length) out.effects = effects;
  }

  return out;
}

module.exports = { sanitizeTemaInterfaz };

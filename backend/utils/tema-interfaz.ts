import type { HttpError } from './http-error';
export interface TemaInterfaz { preset?: string; colors?: Record<string, string>; colorsDark?: Record<string, string>; typography?: { fontFamily?: string; fontWeights?: string }; layout?: Record<string, number>; buttons?: { style: string }; cards?: { style: string }; effects?: { meshGradient?: boolean; sidebarAccentBar?: boolean; shadowIntensity?: string } }
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

function isColor(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  return HEX_RE.test(value) || RGBA_RE.test(value);
}

function pickColors(input: unknown, keys: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const src = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of keys) {
    if (src[key] === undefined || src[key] === null) continue;
    if (!isColor(src[key])) {
      const err: HttpError = new Error(`Color inválido en temaInterfaz: ${key}`);
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
function sanitizeTemaInterfaz(input: unknown): TemaInterfaz {
  if (input === undefined || input === null) {
    const err: HttpError = new Error('temaInterfaz es obligatorio.');
    err.status = 400;
    throw err;
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    const err: HttpError = new Error('temaInterfaz debe ser un objeto.');
    err.status = 400;
    throw err;
  }

  const raw = input as Record<string, unknown>;
  let serialized;
  try {
    serialized = JSON.stringify(raw);
  } catch (_) {
    const err: HttpError = new Error('temaInterfaz no es JSON válido.');
    err.status = 400;
    throw err;
  }
  if (serialized.length > MAX_JSON_CHARS) {
    const err: HttpError = new Error('temaInterfaz supera el tamaño máximo permitido.');
    err.status = 400;
    throw err;
  }

  const allowedTop = new Set([
    'preset', 'colors', 'colorsDark', 'typography', 'layout', 'buttons', 'cards', 'effects'
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedTop.has(key)) {
      const err: HttpError = new Error(`Clave no permitida en temaInterfaz: ${key}`);
      err.status = 400;
      throw err;
    }
  }

  const out: TemaInterfaz = {};

  if (raw.preset !== undefined) {
    if (typeof raw.preset !== 'string' || !PRESET_IDS.has(raw.preset)) {
      const err: HttpError = new Error('Preset de tema inválido.');
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
      const err: HttpError = new Error('typography inválida.');
      err.status = 400;
      throw err;
    }
    const typography = raw.typography as Record<string, unknown>;
    const fontFamily = typography.fontFamily;
    if (fontFamily !== undefined && (typeof fontFamily !== 'string' || !FONT_IDS.has(fontFamily))) {
      const err: HttpError = new Error('Fuente no permitida.');
      err.status = 400;
      throw err;
    }
    out.typography = {};
    if (typeof fontFamily === 'string' && fontFamily) out.typography.fontFamily = fontFamily;
    if (typeof typography.fontWeights === 'string' && typography.fontWeights.length <= 40) {
      out.typography.fontWeights = typography.fontWeights;
    }
  }

  if (raw.layout !== undefined) {
    if (!raw.layout || typeof raw.layout !== 'object') {
      const err: HttpError = new Error('layout inválido.');
      err.status = 400;
      throw err;
    }
    const layout: Record<string, number> = {};
    const layoutInput = raw.layout as Record<string, unknown>;
    const intField = (key: string, min: number, max: number) => {
      if (layoutInput[key] === undefined) return;
      const n = parseInt(String(layoutInput[key]), 10);
      if (!Number.isFinite(n) || n < min || n > max) {
        const err: HttpError = new Error(`layout.${key} fuera de rango (${min}-${max}).`);
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
    const style = raw.buttons && typeof raw.buttons === 'object' ? (raw.buttons as Record<string, unknown>).style : undefined;
    if (typeof style !== 'string' || !BUTTON_STYLES.has(style)) {
      const err: HttpError = new Error('buttons.style inválido.');
      err.status = 400;
      throw err;
    }
    out.buttons = { style };
  }

  if (raw.cards !== undefined) {
    const style = raw.cards && typeof raw.cards === 'object' ? (raw.cards as Record<string, unknown>).style : undefined;
    if (typeof style !== 'string' || !CARD_STYLES.has(style)) {
      const err: HttpError = new Error('cards.style inválido.');
      err.status = 400;
      throw err;
    }
    out.cards = { style };
  }

  if (raw.effects !== undefined) {
    if (!raw.effects || typeof raw.effects !== 'object') {
      const err: HttpError = new Error('effects inválido.');
      err.status = 400;
      throw err;
    }
    const effects: NonNullable<TemaInterfaz["effects"]> = {};
    const effectsInput = raw.effects as Record<string, unknown>;
    if (effectsInput.meshGradient !== undefined) effects.meshGradient = !!effectsInput.meshGradient;
    if (effectsInput.sidebarAccentBar !== undefined) effects.sidebarAccentBar = !!effectsInput.sidebarAccentBar;
    if (effectsInput.shadowIntensity !== undefined) {
      if (typeof effectsInput.shadowIntensity !== 'string' || !SHADOW_LEVELS.has(effectsInput.shadowIntensity)) {
        const err: HttpError = new Error('effects.shadowIntensity inválido.');
        err.status = 400;
        throw err;
      }
      effects.shadowIntensity = effectsInput.shadowIntensity;
    }
    if (Object.keys(effects).length) out.effects = effects;
  }

  return out;
}

export { sanitizeTemaInterfaz };

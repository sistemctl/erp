const fs = require('node:fs');
const path = require('node:path');
const { numerical } = require('./ts-backend-tools.cjs');
const source = path.resolve(__dirname, '../../backend/utils/tema-interfaz.js');
let text = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
text = text.replace('function isColor(value)', 'function isColor(value: unknown): value is string')
 .replace('function pickColors(src, keys)', 'function pickColors(input: unknown, keys: string[])')
 .replace("  if (!src || typeof src !== 'object' || Array.isArray(src)) return undefined;", "  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;\n  const src = input as Record<string, unknown>;")
 .replace('const out = {};', 'const out: Record<string, string> = {};')
 .replace('function sanitizeTemaInterfaz(raw)', 'function sanitizeTemaInterfaz(input: unknown): TemaInterfaz')
 .replaceAll('raw === undefined || raw === null', 'input === undefined || input === null')
 .replaceAll("typeof raw !== 'object' || Array.isArray(raw)", "typeof input !== 'object' || Array.isArray(input)")
 .replace('  let serialized;', '  const raw = input as Record<string, unknown>;\n  let serialized;')
 .replace('  const out = {};', '  const out: TemaInterfaz = {};')
 .replaceAll('const err = new Error(', 'const err: HttpError = new Error(')
 .replace('!PRESET_IDS.has(raw.preset)', "typeof raw.preset !== 'string' || !PRESET_IDS.has(raw.preset)")
 .replace('const fontFamily = raw.typography.fontFamily;', 'const typography = raw.typography as Record<string, unknown>;\n    const fontFamily = typography.fontFamily;')
 .replace("fontFamily !== undefined && !FONT_IDS.has(fontFamily)", "fontFamily !== undefined && (typeof fontFamily !== 'string' || !FONT_IDS.has(fontFamily))")
 .replace('if (fontFamily) out.typography.fontFamily = fontFamily;', "if (typeof fontFamily === 'string' && fontFamily) out.typography.fontFamily = fontFamily;")
 .replaceAll('raw.typography.fontWeights', 'typography.fontWeights')
 .replace('const layout = {};', 'const layout: Record<string, number> = {};\n    const layoutInput = raw.layout as Record<string, unknown>;')
 .replace('const intField = (key, min, max)', 'const intField = (key: string, min: number, max: number)')
 .replaceAll('raw.layout[key]', 'layoutInput[key]')
 .replace('const style = raw.buttons?.style;', "const style = raw.buttons && typeof raw.buttons === 'object' ? (raw.buttons as Record<string, unknown>).style : undefined;")
 .replace('const style = raw.cards?.style;', "const style = raw.cards && typeof raw.cards === 'object' ? (raw.cards as Record<string, unknown>).style : undefined;")
 .replace('!BUTTON_STYLES.has(style)', "typeof style !== 'string' || !BUTTON_STYLES.has(style)")
 .replace('!CARD_STYLES.has(style)', "typeof style !== 'string' || !CARD_STYLES.has(style)")
 .replace('const effects = {};', 'const effects: NonNullable<TemaInterfaz["effects"]> = {};\n    const effectsInput = raw.effects as Record<string, unknown>;')
 .replaceAll('raw.effects.', 'effectsInput.')
 .replace('!SHADOW_LEVELS.has(effectsInput.shadowIntensity)', "typeof effectsInput.shadowIntensity !== 'string' || !SHADOW_LEVELS.has(effectsInput.shadowIntensity)")
 .replace('module.exports = { sanitizeTemaInterfaz };', 'export { sanitizeTemaInterfaz };');
const header = `import type { HttpError } from './http-error';
export interface TemaInterfaz { preset?: string; colors?: Record<string, string>; colorsDark?: Record<string, string>; typography?: { fontFamily?: string; fontWeights?: string }; layout?: Record<string, number>; buttons?: { style: string }; cards?: { style: string }; effects?: { meshGradient?: boolean; sidebarAccentBar?: boolean; shadowIntensity?: string } }
`;
fs.writeFileSync(source.replace(/\.js$/, '.ts'), header + numerical(text));
fs.unlinkSync(source);

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../backend/utils');
function convert(name, header, changes) {
  const source = path.join(root, name + '.js');
  let text = fs.readFileSync(source, 'utf8');
  for (const [from, to] of changes) {
    if (!text.includes(from)) throw new Error(name + ': missing ' + from);
    text = text.replaceAll(from, to);
  }
  text = text.replace(/module\.exports = \{[\s\S]*?\};\s*$/, '');
  fs.writeFileSync(path.join(root, name + '.ts'), header + '\n' + text);
  fs.unlinkSync(source);
}
convert('numero-a-letras', '', [
  ['const ESPECIALES = {', 'const ESPECIALES: Record<number, string> = {'],
  ['function centenas(n)', 'function centenas(n: number): string'],
  ['function decenasYUnidades(n)', 'function decenasYUnidades(n: number): string'],
  ['function seccion(n, divisor, singular, plural)', 'function seccion(n: number, divisor: number, singular: string, plural: string): string'],
  ['function convertirEntero(n)', 'function convertirEntero(n: number): string'],
  ['function numeroALetras(valor)', 'export function numeroALetras(valor: unknown)'],
  ['parseFloat(valor)', 'parseFloat(String(valor))']
]);
convert('nomina-periodo', 'interface NominaConfig { nominaFrecuenciaDefault?: string | null; nominaDiaCorteQuincena?: number | string | null; nominaDiaPago1?: number | string | null; nominaDiaPago2?: number | string | null; }', [
  ['const MESES =', 'export const MESES ='], ['const DEFAULTS =', 'export const DEFAULTS ='],
  ['function clampDia(d, fallback = 1)', 'function clampDia(d: unknown, fallback = 1)'],
  ['parseInt(d, 10)', 'parseInt(String(d), 10)'],
  ['function parseNominaConfig(config = {})', 'export function parseNominaConfig(config: NominaConfig = {})'],
  ['function obtenerPeriodoPagoQuincenal(refDate = new Date(), config = {})', 'export function obtenerPeriodoPagoQuincenal(refDate = new Date(), config: NominaConfig = {})']
]);
convert('cotizacion-iva', 'interface CotItem { tieneIVA?: boolean | null; producto?: { tieneIVA?: boolean | null } | null; subtotal?: string | number | null; cantidad?: string | number | null; precioUnitario?: string | number | null; }', [
  ['function itemAplicaIva(item)', 'export function itemAplicaIva(item: CotItem)'],
  ['function calcCotIvaItems(items, ivaPct = 19)', 'export function calcCotIvaItems(items: readonly CotItem[] | null | undefined, ivaPct: number | string = 19)'],
  ['parseFloat(ivaPct)', 'parseFloat(String(ivaPct))'], ['parseFloat(item.subtotal)', 'parseFloat(String(item.subtotal))'],
  ['parseFloat(item.cantidad)', 'parseFloat(String(item.cantidad))'], ['parseFloat(item.precioUnitario)', 'parseFloat(String(item.precioUnitario))'],
  ['function etiquetaIvaCot(iva, ivaPct = 19)', 'export function etiquetaIvaCot(iva: number, ivaPct: number | string = 19)']
]);
convert('document-number', "import type { Sequelize, Transaction } from 'sequelize';", [
  ["const { QueryTypes } = require('sequelize');", "import { QueryTypes } from 'sequelize';"],
  ['const DOCUMENTS = {', 'export const DOCUMENTS: Record<string, readonly [string, string]> = {'],
  ['async function initializeDocumentSequences(sequelize, transaction)', 'export async function initializeDocumentSequences(sequelize: Sequelize, transaction?: Transaction)'],
  ['async function nextDocumentNumber(sequelize, prefix, transaction)', 'export async function nextDocumentNumber(sequelize: Sequelize, prefix: string, transaction?: Transaction)'],
  ['const rows = await sequelize.query(', 'const rows = await sequelize.query<{ value: string }>(']
]);
convert('internal-barcode', "import type { Transaction } from 'sequelize';\nimport models = require('../models');", [
  ["const { Producto } = require('../models');", 'const { Producto } = models;'],
  ["const { Op } = require('sequelize');", "import { Op } from 'sequelize';"],
  ['const PREFIX =', 'export const PREFIX ='], ['const FIRST_CODE =', 'export const FIRST_CODE ='],
  ['function isInternalBarcode(codigo)', 'export function isInternalBarcode(codigo: unknown): codigo is string'],
  ['function findMaxInternalSequence(transaction)', 'function findMaxInternalSequence(transaction?: Transaction)'],
  ['function formatInternalCode(sequence)', 'function formatInternalCode(sequence: bigint)'],
  ['function codeExists(codigo, transaction)', 'function codeExists(codigo: string, transaction?: Transaction)'],
  ['function generateInternalBarcode(transaction)', 'export function generateInternalBarcode(transaction?: Transaction)'],
  ['function normalizeCodigoBarras(value)', 'export function normalizeCodigoBarras(value: unknown)']
]);
convert('server-config', "import type { ModelStatic } from 'sequelize';\nimport type Configuracion = require('../models/ConfiguracionSistema');", [
  ["const fs = require('fs');", "import fs = require('node:fs');"],
  ["const path = require('path');", "import path = require('node:path');"],
  ["const { ENV_PATH } = require('./runtime-paths');", "import runtimePaths = require('./runtime-paths');\nconst { ENV_PATH } = runtimePaths;"],
  ['const DEFAULT_PORT =', 'export const DEFAULT_PORT ='], ['const MIN_PORT =', 'export const MIN_PORT ='], ['const MAX_PORT =', 'export const MAX_PORT ='],
  ['function clampPort(value)', 'export function clampPort(value: unknown)'], ['parseInt(value, 10)', 'parseInt(String(value), 10)'],
  ['function buildCorsOrigins(port)', 'export function buildCorsOrigins(port: number)'],
  ["function buildAppUrl(port, host = 'localhost')", "export function buildAppUrl(port: number, host = 'localhost')"],
  ['function resolveStartupPort(ConfiguracionSistema)', 'export function resolveStartupPort(ConfiguracionSistema: ModelStatic<Configuracion>)'],
  ['function updateEnvPort(port)', 'export function updateEnvPort(port: unknown)']
]);
convert('credito', "import type { ModelStatic, Transaction } from 'sequelize';\nimport type Configuracion = require('../models/ConfiguracionSistema');", [
  ['function calcularFechaVencimientoCredito(diasPlazo = 30)', 'export function calcularFechaVencimientoCredito(diasPlazo: number | string = 30)'],
  ['parseInt(diasPlazo, 10)', 'parseInt(String(diasPlazo), 10)'],
  ['function getDiasPlazoCredito(ConfiguracionSistema, transaction)', 'export function getDiasPlazoCredito(ConfiguracionSistema: ModelStatic<Configuracion>, transaction?: Transaction)'],
  ['parseInt(config?.diasPlazoCredito, 10)', 'parseInt(String(config?.diasPlazoCredito), 10)']
]);
convert('consumidor-final', "import type { Transaction } from 'sequelize';\nimport models = require('../models');", [
  ["const { Op } = require('sequelize');", "import { Op } from 'sequelize';"],
  ["const { Cliente, Sede } = require('../models');", 'const { Cliente, Sede } = models;'],
  ['const DOC_CONSUMIDOR =', 'export const DOC_CONSUMIDOR ='], ['const NOMBRE_CONSUMIDOR =', 'export const NOMBRE_CONSUMIDOR ='],
  ['function ensureConsumidorFinal({ sedeId, transaction } = {})', 'export function ensureConsumidorFinal({ sedeId, transaction }: { sedeId?: string; transaction?: Transaction } = {})'],
  ['const patch = {};', 'const patch: { nombre?: string; documento?: string } = {};'],
  ['function bootstrapConsumidorFinal()', 'export function bootstrapConsumidorFinal()']
]);

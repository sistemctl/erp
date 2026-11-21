const fs = require('node:fs');
const path = require('node:path');
const { imports, numerical, controller } = require('./ts-backend-tools.cjs');
const root = path.resolve(__dirname, '../../backend');
function convert(file, header, edits) {
  const source = path.join(root, file + '.js');
  let text = imports(fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n'));
  text = text.replace(/exports\.(\w+) =/g, 'export const $1 =').replace(/exports\.(\w+)/g, '$1');
  for (const [from, to] of edits) {
    if (!text.includes(from)) throw new Error(file + ': missing ' + from);
    text = text.replaceAll(from, to);
  }
  text = text.replaceAll('err.message', '(err instanceof Error ? err.message : String(err))');
  fs.writeFileSync(source.replace(/\.js$/, '.ts'), header + '\n' + numerical(text));
  fs.unlinkSync(source);
}
convert('services/gemini.service', 'export interface ChatMessage { role?: string; content?: unknown }\ninterface ModelOptions { model?: string }', [
  ['async (prompt, options = {})', 'async (prompt: string, options: ModelOptions = {})'],
  ['async (messages, options = {})', 'async (messages: ChatMessage[], options: ModelOptions = {})']
]);
convert('services/twilio.service', "import twilio = require('twilio');", [
  ['function getTwilioClient(sid, token)', 'function getTwilioClient(sid: string | null, token: string | null)'],
  ["    const twilio = require('twilio');\n", ''],
  ['async (ordenId, estado)', 'async (ordenId: string, estado: string)'],
  ["let template = '';", "let template: string | null = '';"],
  ['formatter.format(orden.totalCobrado)', 'formatter.format(Number(orden.totalCobrado))'],
  ["let smsEstado = 'enviado';", "let smsEstado: 'enviado' | 'fallido' = 'enviado';"],
  ["let waEstado = 'enviado';", "let waEstado: 'enviado' | 'fallido' = 'enviado';"],
  ['let errorDetalle = null;', 'let errorDetalle: string | null = null;'],
  ['from: config.twilioFromNumber,', "from: config.twilioFromNumber || '',"],
  ["config.twilioFromNumber.startsWith('whatsapp:')", "(config.twilioFromNumber || '').startsWith('whatsapp:')"]
]);
convert('services/email.service', `import type { IncludeOptions } from 'sequelize';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Mail from 'nodemailer/lib/mailer';
import nodemailer = require('nodemailer');
import type Configuracion = require('../models/ConfiguracionSistema');
import type Cuenta = require('../models/CuentaPorCobrar');
import type ClienteModel = require('../models/Cliente');
import type FacturaModel = require('../models/Factura');
type SmtpConfig = Pick<Configuracion, 'smtpPort' | 'smtpSecure' | 'smtpHost' | 'smtpUser' | 'smtpPass' | 'smtpIgnoreTlsErrors' | 'smtpFromName' | 'smtpFromEmail' | 'empresa'>;
interface EmailInput { to: string; subject: string; text: string; html?: string; attachments?: Mail.Attachment[] }
interface EmailNotification { ordenReparacionId?: string; facturaId?: string; clienteId: string; mensaje: string; estado: 'enviado' | 'fallido'; errorDetalle: string | null }
type CuentaEmail = Pick<Cuenta, 'fechaVencimiento' | 'saldoPendiente' | 'facturaId' | 'clienteId'> & { cliente?: ClienteModel | null; factura?: FacturaModel | null };
`, [
  ["return require('nodemailer');", 'return nodemailer;'],
  ['const FACTURA_PDF_INCLUDES = [', 'const FACTURA_PDF_INCLUDES: IncludeOptions[] = ['],
  ['function renderPlantilla(template, vars)', 'function renderPlantilla(template: string | null, vars: Record<string, string | null | undefined>)'],
  ['function normalizeSmtpTransport(config)', 'function normalizeSmtpTransport(config: SmtpConfig)'],
  ['function buildTlsOptions(config = {})', "function buildTlsOptions(config: Pick<SmtpConfig, 'smtpIgnoreTlsErrors'> = { smtpIgnoreTlsErrors: null })"],
  ["minVersion: 'TLSv1.2',", "minVersion: 'TLSv1.2' as const,"],
  ['function getTransporter(config)', 'function getTransporter(config: SmtpConfig)'],
  ['const transportConfig = {', 'const transportConfig: SMTPTransport.Options = {'],
  ['async function sendEmail(config, { to, subject, text, html, attachments })', 'async function sendEmail(config: SmtpConfig, { to, subject, text, html, attachments }: EmailInput)'],
  ['  errorDetalle\n}) {', '  errorDetalle\n}: EmailNotification) {'],
  ['async function loadFacturaForPdf(facturaId)', 'async function loadFacturaForPdf(facturaId: string)'],
  ['async (config) =>', 'async (config: SmtpConfig) =>'],
  ['async (config, emailDestino) =>', 'async (config: SmtpConfig, emailDestino: string) =>'],
  ['async (config, emailDestino, subject, text) =>', 'async (config: SmtpConfig, emailDestino: string, subject: string, text: string) =>'],
  ['async (facturaId) =>', 'async (facturaId: string) =>'],
  ['async (ordenId, estadoReparacion) =>', 'async (ordenId: string, estadoReparacion: string) =>'],
  ['async (config, cuentaPorCobrar) =>', 'async (config: Configuracion, cuentaPorCobrar: Cuenta | CuentaEmail) =>'],
  ["const plain = typeof cuentaPorCobrar.get === 'function'\n    ? cuentaPorCobrar.get({ plain: true })\n    : cuentaPorCobrar;", "const plain: CuentaEmail = 'get' in cuentaPorCobrar\n    ? cuentaPorCobrar.get({ plain: true })\n    : cuentaPorCobrar;"],
  ['factura.cliente.nombre', "factura.cliente?.nombre || ''"],
  ['formatter.format(factura.total)', 'formatter.format(Number(factura.total))'],
  ['formatter.format(orden.totalCobrado || 0)', 'formatter.format(Number(orden.totalCobrado || 0))'],
  ['formatter.format(plain.saldoPendiente)', 'formatter.format(Number(plain.saldoPendiente))'],
  ['(hoy - vence)', '(hoy.getTime() - vence.getTime())'],
  ["let estado = 'enviado';", "let estado: 'enviado' | 'fallido' = 'enviado';"],
  ['let errorDetalle = null;', 'let errorDetalle: string | null = null;'],
  ["let template = '';", "let template: string | null = '';"],
  ['throw new Error(errorDetalle);', "throw new Error(errorDetalle || 'Error enviando correo.');"]
]);
convert('jobs/stock.job', '', [
  ['Number(s.producto.stockMinimo)', 'Number(s.producto?.stockMinimo)'],
  ['${s.producto.nombre}', "${s.producto?.nombre || ''}"],
  ['${s.producto.stockMinimo}', '${s.producto?.stockMinimo}'],
  ['module.exports = { alertarStockBajo };', 'export { alertarStockBajo };']
]);
convert('jobs/cartera.job', '', [
  ['module.exports = {\n  actualizarEstadosVencidos,\n  enviarRecordatoriosCartera\n};', 'export { actualizarEstadosVencidos, enviarRecordatoriosCartera };']
]);
convert('jobs/scheduler', '', [['module.exports = { startScheduler };', 'export { startScheduler };']]);
controller('gemini', "import type { ChatMessage } from '../services/gemini.service';\ninterface Body { prompt?: unknown; model?: string; messages?: ChatMessage[] }");

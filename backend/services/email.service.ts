import type { IncludeOptions } from 'sequelize';
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

import models = require('../models');
const {
  Notificacion,
  ConfiguracionSistema,
  OrdenReparacion,
  OrdenInstalacion,
  MaterialInstalacion,
  Cliente,
  Sede,
  Factura,
  Venta,
  ItemVenta,
  PagoVenta,
  RepuestoOrden,
  Producto,
  Usuario
} = models;
import { buildFacturaPdfBuffer } from '../utils/factura-pdf';
import { textoSedeNotificacion } from '../utils/sede';

function getNodemailer() {
  try {
    return nodemailer;
  } catch (err) {
    console.error('[Email] nodemailer no instalado. Ejecute npm install en backend.');
    return null;
  }
}

const FACTURA_PDF_INCLUDES: IncludeOptions[] = [
  { model: Cliente, as: 'cliente' },
  { model: Sede, as: 'sede' },
  {
    model: Venta,
    as: 'venta',
    include: [
      {
        model: ItemVenta,
        as: 'items',
        include: [{ model: Producto, as: 'producto' }]
      },
      { model: PagoVenta, as: 'pagos' },
      { model: Usuario, as: 'usuario', attributes: ['nombre'] }
    ]
  },
  {
    model: OrdenReparacion,
    as: 'ordenReparacion',
    include: [
      {
        model: RepuestoOrden,
        as: 'repuestos',
        include: [{ model: Producto, as: 'producto' }]
      }
    ]
  },
  {
    model: OrdenInstalacion,
    as: 'ordenInstalacion',
    include: [
      { model: Usuario, as: 'tecnico', attributes: ['id', 'nombre'] },
      {
        model: MaterialInstalacion,
        as: 'materiales',
        include: [{ model: Producto, as: 'producto' }]
      }
    ]
  }
];

function renderPlantilla(template: string | null, vars: Record<string, string | null | undefined>) {
  let result = template || '';
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val ?? '');
  }
  return result;
}

function normalizeSmtpTransport(config: SmtpConfig) {
  let port = parseInt(String(config.smtpPort), 10) || 587;
  let secure = !!config.smtpSecure;

  // Puerto 587 = STARTTLS (secure false). Puerto 465 = SSL directo (secure true).
  if (port === 465) {
    secure = true;
  } else if (port === 587) {
    secure = false;
  } else if (secure && port !== 465) {
    port = 465;
  } else if (!secure && (port === 465 || port === 587)) {
    port = secure ? 465 : 587;
  }

  return { port, secure };
}

function buildTlsOptions(config: Pick<SmtpConfig, 'smtpIgnoreTlsErrors'> = { smtpIgnoreTlsErrors: null }) {
  const strictInProduction = process.env.NODE_ENV === 'production' && !config.smtpIgnoreTlsErrors;
  return {
    minVersion: 'TLSv1.2' as const,
    rejectUnauthorized: strictInProduction
  };
}

function getTransporter(config: SmtpConfig) {
  const nodemailer = getNodemailer();
  if (!nodemailer || !config?.smtpHost) {
    return null;
  }

  const { port, secure } = normalizeSmtpTransport(config);
  const transportConfig: SMTPTransport.Options = {
    host: config.smtpHost,
    port,
    secure,
    tls: buildTlsOptions(config)
  };

  if (config.smtpUser) {
    transportConfig.auth = {
      user: config.smtpUser,
      pass: config.smtpPass || ''
    };
  }

  return nodemailer.createTransport(transportConfig);
}

async function sendEmail(config: SmtpConfig, { to, subject, text, html, attachments }: EmailInput) {
  const transporter = getTransporter(config);
  if (!transporter) {
    throw new Error('Configuración SMTP incompleta o nodemailer no disponible.');
  }

  const fromName = config.smtpFromName || config.empresa || 'ERP';
  const fromEmail = config.smtpFromEmail || config.smtpUser;
  if (!fromEmail) {
    throw new Error('Configure el correo remitente (De / usuario SMTP).');
  }

  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, '<br>'),
    attachments
  });
}

async function registrarNotificacionEmail({
  ordenReparacionId,
  facturaId,
  clienteId,
  mensaje,
  estado,
  errorDetalle
}: EmailNotification) {
  return Notificacion.create({
    ordenReparacionId: ordenReparacionId || null,
    facturaId: facturaId || null,
    clienteId,
    canal: 'email',
    mensaje,
    estado,
    errorDetalle
  });
}

async function loadFacturaForPdf(facturaId: string) {
  return Factura.findByPk(facturaId, { include: FACTURA_PDF_INCLUDES });
}

export const verificarConexion = async (config: SmtpConfig) => {
  const transporter = getTransporter(config);
  if (!transporter) {
    throw new Error('Configuración SMTP incompleta o nodemailer no disponible.');
  }
  await transporter.verify();
  return true;
};

export const enviarCorreoPrueba = async (config: SmtpConfig, emailDestino: string) => {
  await verificarConexion(config);
  await sendEmail(config, {
    to: emailDestino,
    subject: `Prueba SMTP — ${config.empresa || 'ERP'}`,
    text: 'Este es un correo de prueba del sistema ERP. Si lo recibió, la configuración SMTP es correcta.',
    html: '<p>Este es un correo de prueba del sistema ERP. Si lo recibió, la configuración SMTP es correcta.</p>'
  });
};

export const enviarCorreoTexto = async (config: SmtpConfig, emailDestino: string, subject: string, text: string) => {
  await sendEmail(config, {
    to: emailDestino,
    subject,
    text,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${String(text || '').replace(/</g, '&lt;')}</pre>`
  });
};

export const enviarFacturaPorEmail = async (facturaId: string) => {
  const config = await ConfiguracionSistema.findOne();
  if (!config?.emailActivo) {
    console.log('[Email] Canal de correo desactivado en configuración.');
    return { skipped: true, reason: 'email_inactivo' };
  }

  const factura = await loadFacturaForPdf(facturaId);
  if (!factura) {
    throw new Error('Factura no encontrada.');
  }
  if (factura.estado === 'anulada') {
    throw new Error('No se puede enviar una factura anulada.');
  }

  const email = factura.cliente?.email?.trim();
  if (!email) {
    await registrarNotificacionEmail({
      facturaId: factura.id,
      clienteId: factura.clienteId,
      mensaje: `Factura ${factura.numeroFactura}`,
      estado: 'fallido',
      errorDetalle: 'Cliente sin correo electrónico.'
    });
    throw new Error('El cliente no tiene correo electrónico registrado.');
  }

  const formatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  });

  const vars = {
    cliente: factura.cliente?.nombre || '',
    factura: factura.numeroFactura,
    total: formatter.format(Number(factura.total)),
    sede: textoSedeNotificacion(factura.sede),
    empresa: config.empresa || 'ERP'
  };

  const subject = renderPlantilla(config.templateEmailFacturaAsunto, vars);
  const bodyText = renderPlantilla(config.templateEmailFacturaCuerpo, vars);
  const htmlBody = `<div style="font-family:sans-serif;line-height:1.5">${bodyText.replace(/\n/g, '<br>')}</div>`;

  let estado: 'enviado' | 'fallido' = 'enviado';
  let errorDetalle: string | null = null;

  try {
    const pdfBuffer = await buildFacturaPdfBuffer(factura, config);
    await sendEmail(config, {
      to: email,
      subject,
      text: bodyText,
      html: htmlBody,
      attachments: [{
        filename: `factura_${factura.numeroFactura}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });
    console.log(`[Email] Factura ${factura.numeroFactura} enviada a ${email}`);
  } catch (err) {
    estado = 'fallido';
    errorDetalle = (err instanceof Error ? err.message : String(err));
    console.error(`[Email] Error enviando factura ${factura.numeroFactura}:`, (err instanceof Error ? err.message : String(err)));
  }

  await registrarNotificacionEmail({
    facturaId: factura.id,
    clienteId: factura.clienteId,
    mensaje: `${subject}\n\n${bodyText}`,
    estado,
    errorDetalle
  });

  if (estado === 'fallido') {
    throw new Error(errorDetalle || 'Error enviando correo.');
  }

  return { success: true, email, numeroFactura: factura.numeroFactura };
};

export const enviarFacturaPorEmailAuto = async (facturaId: string) => {
  const config = await ConfiguracionSistema.findOne();
  if (!config?.emailFacturaAuto || !config?.emailActivo) {
    return { skipped: true };
  }
  return enviarFacturaPorEmail(facturaId);
};

export const enviarNotificacionReparacion = async (ordenId: string, estadoReparacion: string | undefined) => {
  try {
    const config = await ConfiguracionSistema.findOne();
    if (!config?.notificacionesActivas || !config?.emailActivo) {
      console.log('[Email] Notificaciones por correo desactivadas.');
      return;
    }

    const orden = await OrdenReparacion.findByPk(ordenId, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' }
      ]
    });

    if (!orden || !orden.cliente) {
      console.log('[Email] Orden o cliente no encontrado.');
      return;
    }

    let template: string | null = '';
    if (estadoReparacion === 'recibido') {
      template = config.templateRecibido;
    } else if (estadoReparacion === 'listo') {
      template = config.templateListo;
    } else if (estadoReparacion === 'entregado') {
      template = config.templateEntregado;
    } else {
      console.log(`[Email] No hay plantilla para el estado: ${estadoReparacion}`);
      return;
    }

    if (!template) {
      console.log(`[Email] Plantilla vacía para estado: ${estadoReparacion}`);
      return;
    }

    const email = orden.cliente.email?.trim();
    if (!email) {
      await registrarNotificacionEmail({
        ordenReparacionId: orden.id,
        clienteId: orden.clienteId,
        mensaje: template,
        estado: 'fallido',
        errorDetalle: 'Cliente sin correo electrónico.'
      });
      return;
    }

    const formatter = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    });

    const vars = {
      cliente: orden.cliente.nombre,
      equipo: `${orden.marca || ''} ${orden.modelo || ''}`.trim(),
      sede: textoSedeNotificacion(orden.sede),
      orden: orden.numeroOrden,
      total: formatter.format(Number(orden.totalCobrado || 0)),
      empresa: config.empresa || 'ERP'
    };

    const mensaje = renderPlantilla(template, vars);
    const subject = `${config.empresa || 'ERP'} — Orden ${orden.numeroOrden}`;
    const htmlBody = `<div style="font-family:sans-serif;line-height:1.5">${mensaje.replace(/\n/g, '<br>')}</div>`;

    let estado: 'enviado' | 'fallido' = 'enviado';
    let errorDetalle: string | null = null;

    try {
      await sendEmail(config, {
        to: email,
        subject,
        text: mensaje,
        html: htmlBody
      });
      console.log(`[Email] Notificación reparación (${estadoReparacion}) enviada a ${email}`);
    } catch (err) {
      estado = 'fallido';
      errorDetalle = (err instanceof Error ? err.message : String(err));
      console.error(`[Email] Error enviando notificación reparación:`, (err instanceof Error ? err.message : String(err)));
    }

    await registrarNotificacionEmail({
      ordenReparacionId: orden.id,
      clienteId: orden.clienteId,
      mensaje,
      estado,
      errorDetalle
    });
  } catch (error) {
    console.error('[Email] Error general en notificación de reparación:', error);
  }
};

export const enviarRecordatorioCartera = async (config: Configuracion, cuentaPorCobrar: Cuenta | CuentaEmail) => {
  const plain: CuentaEmail = 'get' in cuentaPorCobrar
    ? cuentaPorCobrar.get({ plain: true })
    : cuentaPorCobrar;

  const cliente = plain.cliente;
  if (!cliente?.email?.trim()) {
    throw new Error('Cliente sin correo electrónico.');
  }

  const formatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(plain.fechaVencimiento);
  const dias = Math.max(0, Math.ceil((hoy.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24)));

  const vars = {
    cliente: cliente.nombre,
    factura: plain.factura?.numeroFactura || '—',
    saldo: formatter.format(Number(plain.saldoPendiente)),
    dias: String(dias),
    empresa: config.empresa || 'ERP'
  };

  const subject = renderPlantilla(
    config.templateEmailCarteraAsunto || 'Recordatorio de pago — {empresa}',
    vars
  );
  const bodyText = renderPlantilla(
    config.templateEmailCarteraCuerpo || 'Estimado/a {cliente}, saldo pendiente {saldo}.',
    vars
  );
  const htmlBody = `<div style="font-family:sans-serif;line-height:1.5">${bodyText.replace(/\n/g, '<br>')}</div>`;

  let estado: 'enviado' | 'fallido' = 'enviado';
  let errorDetalle: string | null = null;

  try {
    await sendEmail(config, {
      to: cliente.email.trim(),
      subject,
      text: bodyText,
      html: htmlBody
    });
  } catch (err) {
    estado = 'fallido';
    errorDetalle = (err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    await registrarNotificacionEmail({
      facturaId: plain.facturaId,
      clienteId: plain.clienteId,
      mensaje: bodyText,
      estado,
      errorDetalle
    });
  }
};

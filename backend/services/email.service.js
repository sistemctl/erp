const {
  Notificacion,
  ConfiguracionSistema,
  OrdenReparacion,
  Cliente,
  Sede,
  Factura,
  Venta,
  ItemVenta,
  PagoVenta,
  RepuestoOrden,
  Producto,
  Usuario
} = require('../models');
const { buildFacturaPdfBuffer } = require('../utils/factura-pdf');
const { textoSedeNotificacion } = require('../utils/sede');

function getNodemailer() {
  try {
    return require('nodemailer');
  } catch (err) {
    console.error('[Email] nodemailer no instalado. Ejecute npm install en backend.');
    return null;
  }
}

const FACTURA_PDF_INCLUDES = [
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
  }
];

function renderPlantilla(template, vars) {
  let result = template || '';
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val ?? '');
  }
  return result;
}

function normalizeSmtpTransport(config) {
  let port = parseInt(config.smtpPort, 10) || 587;
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

function buildTlsOptions(config = {}) {
  const strictInProduction = process.env.NODE_ENV === 'production' && !config.smtpIgnoreTlsErrors;
  return {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: strictInProduction
  };
}

function getTransporter(config) {
  const nodemailer = getNodemailer();
  if (!nodemailer || !config?.smtpHost) {
    return null;
  }

  const { port, secure } = normalizeSmtpTransport(config);
  const transportConfig = {
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

async function sendEmail(config, { to, subject, text, html, attachments }) {
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
}) {
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

async function loadFacturaForPdf(facturaId) {
  return Factura.findByPk(facturaId, { include: FACTURA_PDF_INCLUDES });
}

exports.verificarConexion = async (config) => {
  const transporter = getTransporter(config);
  if (!transporter) {
    throw new Error('Configuración SMTP incompleta o nodemailer no disponible.');
  }
  await transporter.verify();
  return true;
};

exports.enviarCorreoPrueba = async (config, emailDestino) => {
  await exports.verificarConexion(config);
  await sendEmail(config, {
    to: emailDestino,
    subject: `Prueba SMTP — ${config.empresa || 'ERP'}`,
    text: 'Este es un correo de prueba del sistema ERP. Si lo recibió, la configuración SMTP es correcta.',
    html: '<p>Este es un correo de prueba del sistema ERP. Si lo recibió, la configuración SMTP es correcta.</p>'
  });
};

exports.enviarCorreoTexto = async (config, emailDestino, subject, text) => {
  await sendEmail(config, {
    to: emailDestino,
    subject,
    text,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${String(text || '').replace(/</g, '&lt;')}</pre>`
  });
};

exports.enviarFacturaPorEmail = async (facturaId) => {
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
    cliente: factura.cliente.nombre,
    factura: factura.numeroFactura,
    total: formatter.format(factura.total),
    sede: textoSedeNotificacion(factura.sede),
    empresa: config.empresa || 'ERP'
  };

  const subject = renderPlantilla(config.templateEmailFacturaAsunto, vars);
  const bodyText = renderPlantilla(config.templateEmailFacturaCuerpo, vars);
  const htmlBody = `<div style="font-family:sans-serif;line-height:1.5">${bodyText.replace(/\n/g, '<br>')}</div>`;

  let estado = 'enviado';
  let errorDetalle = null;

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
    errorDetalle = err.message;
    console.error(`[Email] Error enviando factura ${factura.numeroFactura}:`, err.message);
  }

  await registrarNotificacionEmail({
    facturaId: factura.id,
    clienteId: factura.clienteId,
    mensaje: `${subject}\n\n${bodyText}`,
    estado,
    errorDetalle
  });

  if (estado === 'fallido') {
    throw new Error(errorDetalle);
  }

  return { success: true, email, numeroFactura: factura.numeroFactura };
};

exports.enviarFacturaPorEmailAuto = async (facturaId) => {
  const config = await ConfiguracionSistema.findOne();
  if (!config?.emailFacturaAuto || !config?.emailActivo) {
    return { skipped: true };
  }
  return exports.enviarFacturaPorEmail(facturaId);
};

exports.enviarNotificacionReparacion = async (ordenId, estadoReparacion) => {
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

    let template = '';
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
      total: formatter.format(orden.totalCobrado || 0),
      empresa: config.empresa || 'ERP'
    };

    const mensaje = renderPlantilla(template, vars);
    const subject = `${config.empresa || 'ERP'} — Orden ${orden.numeroOrden}`;
    const htmlBody = `<div style="font-family:sans-serif;line-height:1.5">${mensaje.replace(/\n/g, '<br>')}</div>`;

    let estado = 'enviado';
    let errorDetalle = null;

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
      errorDetalle = err.message;
      console.error(`[Email] Error enviando notificación reparación:`, err.message);
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

exports.enviarRecordatorioCartera = async (config, cuentaPorCobrar) => {
  const plain = typeof cuentaPorCobrar.get === 'function'
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
  const dias = Math.max(0, Math.ceil((hoy - vence) / (1000 * 60 * 60 * 24)));

  const vars = {
    cliente: cliente.nombre,
    factura: plain.factura?.numeroFactura || '—',
    saldo: formatter.format(plain.saldoPendiente),
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

  let estado = 'enviado';
  let errorDetalle = null;

  try {
    await sendEmail(config, {
      to: cliente.email.trim(),
      subject,
      text: bodyText,
      html: htmlBody
    });
  } catch (err) {
    estado = 'fallido';
    errorDetalle = err.message;
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

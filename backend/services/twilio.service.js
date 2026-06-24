const { Notificacion, ConfiguracionSistema, OrdenReparacion, Cliente, Sede } = require('../models');

// Función segura de inicialización de Twilio
function getTwilioClient(sid, token) {
  if (!sid || !token) {
    return null;
  }
  try {
    const twilio = require('twilio');
    return twilio(sid, token);
  } catch (err) {
    console.error("No se pudo requerir la librería de Twilio o credenciales inválidas:", err);
    return null;
  }
}

exports.enviarNotificacionReparacion = async (ordenId, estado) => {
  try {
    const config = await ConfiguracionSistema.findOne();
    if (!config || !config.notificacionesActivas) {
      console.log(`[Twilio] Notificaciones desactivadas en configuración.`);
      return;
    }

    const orden = await OrdenReparacion.findByPk(ordenId, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' }
      ]
    });

    if (!orden || !orden.cliente || !orden.cliente.telefono) {
      console.log(`[Twilio] Orden o cliente no encontrado, o no tiene teléfono registrado.`);
      return;
    }

    // Seleccionar plantilla según el estado
    let template = '';
    if (estado === 'recibido') {
      template = config.templateRecibido;
    } else if (estado === 'listo') {
      template = config.templateListo;
    } else if (estado === 'entregado') {
      template = config.templateEntregado;
    } else {
      console.log(`[Twilio] No hay plantilla registrada para el estado: ${estado}`);
      return;
    }

    if (!template) {
      console.log(`[Twilio] Plantilla vacía para estado: ${estado}`);
      return;
    }

    // Formatear total COP
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    const totalFormateado = formatter.format(orden.totalCobrado);

    // Reemplazar variables
    const mensaje = template
      .replace(/{cliente}/g, orden.cliente.nombre)
      .replace(/{equipo}/g, `${orden.marca} ${orden.modelo}`)
      .replace(/{sede}/g, orden.sede.nombre)
      .replace(/{orden}/g, orden.numeroOrden)
      .replace(/{total}/g, totalFormateado);

    const telefonoCliente = orden.cliente.telefono.trim();
    // Asegurar que tenga indicativo de Colombia (+57) si tiene 10 dígitos
    const cleanPhone = telefonoCliente.length === 10 ? `+57${telefonoCliente}` : telefonoCliente;

    const twilioClient = getTwilioClient(config.twilioAccountSid, config.twilioAuthToken);

    // --- ENVIAR SMS ---
    if (config.smsActivo) {
      let smsEstado = 'enviado';
      let errorDetalle = null;

      if (!twilioClient) {
        smsEstado = 'fallido';
        errorDetalle = 'Credenciales de Twilio SID/Token no configuradas.';
      } else {
        try {
          await twilioClient.messages.create({
            body: mensaje,
            from: config.twilioFromNumber,
            to: cleanPhone
          });
          console.log(`[Twilio] SMS enviado con éxito a ${cleanPhone}`);
        } catch (err) {
          smsEstado = 'fallido';
          errorDetalle = err.message;
          console.error(`[Twilio] Error enviando SMS a ${cleanPhone}:`, err.message);
        }
      }

      await Notificacion.create({
        ordenReparacionId: orden.id,
        clienteId: orden.clienteId,
        canal: 'sms',
        mensaje,
        estado: smsEstado,
        errorDetalle
      });
    }

    // --- ENVIAR WHATSAPP ---
    if (config.whatsappActivo) {
      let waEstado = 'enviado';
      let errorDetalle = null;

      if (!twilioClient) {
        waEstado = 'fallido';
        errorDetalle = 'Credenciales de Twilio SID/Token no configuradas.';
      } else {
        try {
          // El número emisor de WhatsApp de Sandbox o número verificado en Twilio
          const fromNumber = config.twilioFromNumber.startsWith('whatsapp:') 
            ? config.twilioFromNumber 
            : `whatsapp:${config.twilioFromNumber}`;

          await twilioClient.messages.create({
            body: mensaje,
            from: fromNumber,
            to: `whatsapp:${cleanPhone}`
          });
          console.log(`[Twilio] WhatsApp enviado con éxito a ${cleanPhone}`);
        } catch (err) {
          waEstado = 'fallido';
          errorDetalle = err.message;
          console.error(`[Twilio] Error enviando WhatsApp a ${cleanPhone}:`, err.message);
        }
      }

      await Notificacion.create({
        ordenReparacionId: orden.id,
        clienteId: orden.clienteId,
        canal: 'whatsapp',
        mensaje,
        estado: waEstado,
        errorDetalle
      });
    }

    // Marcar en la orden que se envió la notificación
    await orden.update({ notificacionEnviada: true });

  } catch (error) {
    console.error(`[Twilio] Error general en el servicio de notificaciones:`, error);
  }
};

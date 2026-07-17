const { Op } = require('sequelize');
const {
  StockSede,
  Producto,
  Sede,
  ConfiguracionSistema,
  Usuario
} = require('../models');
const emailService = require('../services/email.service');

/**
 * Detecta productos bajo mínimo por sede y notifica a admins/gerentes por correo si SMTP está activo.
 */
async function alertarStockBajo() {
  const config = await ConfiguracionSistema.findOne();
  if (!config?.smtpHost || !config?.smtpUser) {
    console.log('[StockJob] SMTP no configurado; se omite envío de alertas.');
    return { alertas: 0, enviados: 0 };
  }

  const stocks = await StockSede.findAll({
    include: [
      {
        model: Producto,
        as: 'producto',
        where: {
          activo: true,
          stockMinimo: { [Op.gt]: 0 }
        },
        attributes: ['id', 'nombre', 'codigoBarras', 'stockMinimo']
      },
      { model: Sede, as: 'sede', attributes: ['id', 'nombre'] }
    ]
  });

  const bajos = stocks.filter((s) => Number(s.cantidad) <= Number(s.producto.stockMinimo));
  if (!bajos.length) {
    console.log('[StockJob] Sin productos bajo mínimo.');
    return { alertas: 0, enviados: 0 };
  }

  const lineas = bajos.map((s) =>
    `• ${s.producto.nombre} (${s.sede?.nombre || 'Sede'}): ${s.cantidad} uds (mín. ${s.producto.stockMinimo})`
  ).join('\n');

  const admins = await Usuario.findAll({
    where: {
      activo: true,
      rol: { [Op.in]: ['admin', 'superadmin', 'gerente_sede'] }
    },
    attributes: ['email', 'nombre', 'rol']
  });

  const destinatarios = [...new Set(
    admins.map((u) => u.email).filter((e) => e && String(e).includes('@'))
  )];
  if (!destinatarios.length) {
    console.log('[StockJob] No hay correos de admin/gerente para notificar.');
    return { alertas: bajos.length, enviados: 0 };
  }

  const subject = `${config.empresa || 'ERP'} — Alerta de stock bajo (${bajos.length})`;
  const text = `Los siguientes productos están en o bajo el stock mínimo:\n\n${lineas}\n\nRevise Inventario en el ERP.`;

  let enviados = 0;
  for (const email of destinatarios) {
    try {
      await emailService.enviarCorreoTexto(config, email, subject, text);
      enviados += 1;
    } catch (err) {
      console.error('[StockJob] Error enviando a', email, err.message);
    }
  }

  console.log(`[StockJob] ${bajos.length} alertas, ${enviados} correos enviados.`);
  return { alertas: bajos.length, enviados };
}

module.exports = { alertarStockBajo };

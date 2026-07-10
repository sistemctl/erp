const { Op } = require('sequelize');
const {
  CuentaPorCobrar,
  Factura,
  Cliente,
  ConfiguracionSistema
} = require('../models');
const emailService = require('../services/email.service');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function actualizarEstadosVencidos() {
  const hoy = startOfToday();
  let cpcActualizadas = 0;
  let facturasActualizadas = 0;

  const cuentas = await CuentaPorCobrar.findAll({
    where: {
      estado: { [Op.in]: ['al_dia', 'vencida'] },
      saldoPendiente: { [Op.gt]: 0 },
      fechaVencimiento: { [Op.lt]: hoy }
    }
  });

  for (const cpc of cuentas) {
    if (cpc.estado !== 'vencida') {
      await cpc.update({ estado: 'vencida' });
      cpcActualizadas += 1;
    }

    const factura = await Factura.findByPk(cpc.facturaId);
    if (factura && !['pagada', 'anulada'].includes(factura.estado)) {
      if (factura.estado !== 'vencida') {
        await factura.update({ estado: 'vencida' });
        facturasActualizadas += 1;
      }
    }
  }

  console.log(`[Job Cartera] Estados vencidos: ${cpcActualizadas} cuentas, ${facturasActualizadas} facturas.`);
  return { cpcActualizadas, facturasActualizadas };
}

async function enviarRecordatoriosCartera() {
  const config = await ConfiguracionSistema.findOne();
  if (!config?.emailCarteraRecordatorio || !config.emailActivo || !config.notificacionesActivas) {
    console.log('[Job Cartera] Recordatorios por correo desactivados.');
    return { enviados: 0, fallidos: 0 };
  }

  const diasMin = parseInt(config.diasMoraRecordatorioCartera, 10) || 7;
  const hoy = startOfToday();
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() - diasMin);

  const cuentas = await CuentaPorCobrar.findAll({
    where: {
      estado: 'vencida',
      saldoPendiente: { [Op.gt]: 0 },
      fechaVencimiento: { [Op.lte]: limite }
    },
    include: [
      {
        model: Cliente,
        as: 'cliente',
        attributes: ['id', 'nombre', 'email']
      },
      {
        model: Factura,
        as: 'factura',
        attributes: ['numeroFactura', 'total']
      }
    ]
  });

  let enviados = 0;
  let fallidos = 0;

  for (const cpc of cuentas) {
    try {
      await emailService.enviarRecordatorioCartera(config, cpc);
      enviados += 1;
    } catch (err) {
      fallidos += 1;
      console.error(`[Job Cartera] Error recordatorio ${cpc.id}:`, err.message);
    }
  }

  console.log(`[Job Cartera] Recordatorios: ${enviados} enviados, ${fallidos} fallidos.`);
  return { enviados, fallidos };
}

module.exports = {
  actualizarEstadosVencidos,
  enviarRecordatoriosCartera
};

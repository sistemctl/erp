
import { Op } from 'sequelize';
import models = require('../models');
const {
  CuentaPorCobrar,
  Factura,
  Cliente,
  ConfiguracionSistema,
  sequelize
} = models;
import emailService = require('../services/email.service');
import { inicioDiaBogota, hoyBogota } from '../utils/rango-bogota';

// "Hoy" es el día operativo de Colombia, sin depender de la zona horaria del servidor.
function startOfToday() {
  return inicioDiaBogota(hoyBogota());
}

async function actualizarEstadosVencidos() {
  const hoy = startOfToday();
  let cpcActualizadas = 0;
  let facturasActualizadas = 0;

  const cuentas = await CuentaPorCobrar.findAll({
    where: {
      estado: { [Op.in]: ['al_dia', 'vencida'] },
      anuladaAt: null,
      saldoPendiente: { [Op.gt]: 0 },
      fechaVencimiento: { [Op.lt]: hoy }
    }
  });

  let fallidas = 0;
  for (const cpc of cuentas) {
    // Cada cuenta en su propia transacción: un error no deja cuenta y factura a medias
    // ni detiene el resto del proceso.
    try {
      await sequelize.transaction(async (transaction) => {
        if (cpc.estado !== 'vencida') {
          await cpc.update({ estado: 'vencida' }, { transaction });
          cpcActualizadas += 1;
        }

        const factura = await Factura.findByPk(cpc.facturaId, { transaction });
        if (factura && !['pagada', 'anulada'].includes(factura.estado) && factura.estado !== 'vencida') {
          await factura.update({ estado: 'vencida' }, { transaction });
          facturasActualizadas += 1;
        }
      });
    } catch (err) {
      fallidas += 1;
      console.error(`[Job Cartera] Error marcando vencida la cuenta ${cpc.id}:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`[Job Cartera] Estados vencidos: ${cpcActualizadas} cuentas, ${facturasActualizadas} facturas${fallidas ? `, ${fallidas} con error` : ''}.`);
  return { cpcActualizadas, facturasActualizadas, fallidas };
}

async function enviarRecordatoriosCartera() {
  const config = await ConfiguracionSistema.findOne();
  if (!config?.emailCarteraRecordatorio || !config.emailActivo || !config.notificacionesActivas) {
    console.log('[Job Cartera] Recordatorios por correo desactivados.');
    return { enviados: 0, fallidos: 0 };
  }

  const diasMin = parseInt(String(config.diasMoraRecordatorioCartera), 10) || 7;
  const hoy = startOfToday();
  const limite = new Date(hoy.getTime() - diasMin * 24 * 60 * 60 * 1000);

  const cuentas = await CuentaPorCobrar.findAll({
    where: {
      estado: 'vencida',
      anuladaAt: null,
      saldoPendiente: { [Op.gt]: 0 },
      fechaVencimiento: { [Op.lte]: limite },
      esRecaudoExterno: false
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
      console.error(`[Job Cartera] Error recordatorio ${cpc.id}:`, (err instanceof Error ? err.message : String(err)));
    }
  }

  console.log(`[Job Cartera] Recordatorios: ${enviados} enviados, ${fallidos} fallidos.`);
  return { enviados, fallidos };
}

export { actualizarEstadosVencidos, enviarRecordatoriosCartera };

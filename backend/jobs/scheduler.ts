
import { actualizarEstadosVencidos, enviarRecordatoriosCartera } from './cartera.job';
import { alertarStockBajo } from './stock.job';

async function startScheduler() {
  const cron = await import('node-cron');
  cron.schedule('0 6 * * *', async () => {
    try {
      await actualizarEstadosVencidos();
    } catch (err) {
      console.error('[Scheduler] Error en job diario cartera:', err);
    }
  }, { timezone: 'America/Bogota' });

  cron.schedule('0 7 * * *', async () => {
    try {
      await alertarStockBajo();
    } catch (err) {
      console.error('[Scheduler] Error en job diario stock bajo:', err);
    }
  }, { timezone: 'America/Bogota' });

  cron.schedule('0 8 * * 1', async () => {
    try {
      await actualizarEstadosVencidos();
      await enviarRecordatoriosCartera();
    } catch (err) {
      console.error('[Scheduler] Error en job semanal recordatorios:', err);
    }
  }, { timezone: 'America/Bogota' });

  console.log('[Scheduler] Jobs: cartera 06:00, stock bajo 07:00, recordatorios lunes 08:00 (America/Bogota).');
}

export { startScheduler };

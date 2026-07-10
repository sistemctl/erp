const cron = require('node-cron');
const { actualizarEstadosVencidos, enviarRecordatoriosCartera } = require('./cartera.job');

function startScheduler() {
  cron.schedule('0 6 * * *', async () => {
    try {
      await actualizarEstadosVencidos();
    } catch (err) {
      console.error('[Scheduler] Error en job diario cartera:', err);
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

  console.log('[Scheduler] Jobs programados: cartera diaria 06:00, recordatorios lunes 08:00 (America/Bogota).');
}

module.exports = { startScheduler };

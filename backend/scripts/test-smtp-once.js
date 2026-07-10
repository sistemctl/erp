/**
 * Configura SMTP desde variables de entorno y envía correo de prueba.
 * Uso (PowerShell):
 *   $env:SMTP_USER='tu@gmail.com'; $env:SMTP_PASS='contraseña-app'; node scripts/test-smtp-once.js destino@email.com
 */
require('dotenv').config();
const { ConfiguracionSistema, sequelize } = require('../models');
const emailService = require('../services/email.service');

async function trySmtp(baseConfig, smtpSecure, smtpPort, destino) {
  const merged = { ...baseConfig, smtpSecure, smtpPort };
  console.log(`Probando puerto ${smtpPort} (secure=${smtpSecure})…`);
  await emailService.verificarConexion(merged);
  await emailService.enviarCorreoPrueba(merged, destino);
  await ConfiguracionSistema.update({ ...merged, emailActivo: true, notificacionesActivas: true });
  return merged;
}

async function main() {
  const destino = process.argv[2] || process.env.SMTP_USER;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    console.error('Defina SMTP_USER y SMTP_PASS en el entorno.');
    process.exit(1);
  }
  if (!destino) {
    console.error('Indique destino como argumento o use SMTP_USER.');
    process.exit(1);
  }

  const SMTP_CONFIG = {
    emailActivo: true,
    notificacionesActivas: true,
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser,
    smtpPass,
    smtpFromEmail: smtpUser,
    smtpFromName: process.env.SMTP_FROM_NAME || 'Servitec Gamers'
  };

  await sequelize.authenticate();
  let config = await ConfiguracionSistema.findOne();
  if (!config) {
    config = await ConfiguracionSistema.create({ empresa: 'Servitec Gamers', ...SMTP_CONFIG });
  } else {
    await config.update(SMTP_CONFIG);
  }

  const base = { ...(await ConfiguracionSistema.findOne()).toJSON(), ...SMTP_CONFIG };
  const attempts = [
    { smtpPort: 587, smtpSecure: false },
    { smtpPort: 465, smtpSecure: true }
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      await trySmtp(base, attempt.smtpSecure, attempt.smtpPort, destino);
      console.log('Correo de prueba enviado correctamente a', destino);
      process.exit(0);
    } catch (err) {
      lastErr = err;
      console.error(`Fallo puerto ${attempt.smtpPort}:`, err.message);
    }
  }

  console.log('Configuración SMTP guardada en BD, pero el envío falló.');
  throw lastErr;
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

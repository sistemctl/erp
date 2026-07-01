const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
const DEFAULT_PORT = 3000;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

function clampPort(value) {
  const port = parseInt(value, 10);
  if (Number.isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
    return null;
  }
  return port;
}

function buildCorsOrigins(port) {
  const hosts = ['localhost', '127.0.0.1'];
  return hosts.flatMap((host) => [
    `http://${host}:${port}`,
    `https://${host}:${port}`
  ]);
}

function buildAppUrl(port, host = 'localhost') {
  return `http://${host}:${port}`;
}

async function resolveStartupPort(ConfiguracionSistema) {
  const fromEnv = clampPort(process.env.PORT);
  if (fromEnv) return fromEnv;

  try {
    const config = await ConfiguracionSistema.findOne({ attributes: ['puertoServidor'] });
    const fromDb = clampPort(config?.puertoServidor);
    if (fromDb) return fromDb;
  } catch (_) {
    /* BD aún no lista */
  }

  return DEFAULT_PORT;
}

function updateEnvPort(port) {
  const safePort = clampPort(port);
  if (!safePort) {
    throw new Error(`Puerto inválido. Use un número entre ${MIN_PORT} y ${MAX_PORT}.`);
  }

  const line = `PORT=${safePort}`;
  if (!fs.existsSync(ENV_PATH)) {
    fs.writeFileSync(ENV_PATH, `${line}\n`, 'utf8');
    return safePort;
  }

  let content = fs.readFileSync(ENV_PATH, 'utf8');
  if (/^PORT=.*$/m.test(content)) {
    content = content.replace(/^PORT=.*$/m, line);
  } else {
    content = `${content.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
  process.env.PORT = String(safePort);
  return safePort;
}

module.exports = {
  DEFAULT_PORT,
  MIN_PORT,
  MAX_PORT,
  clampPort,
  buildCorsOrigins,
  buildAppUrl,
  resolveStartupPort,
  updateEnvPort
};

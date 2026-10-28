import type { ModelStatic } from 'sequelize';
import type Configuracion = require('../models/ConfiguracionSistema');
import fs = require('node:fs');
import path = require('node:path');

import runtimePaths = require('./runtime-paths');
const { ENV_PATH } = runtimePaths;
export const DEFAULT_PORT = 3000;
export const MIN_PORT = 1024;
export const MAX_PORT = 65535;

export function clampPort(value: unknown) {
  const port = parseInt(String(value), 10);
  if (Number.isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
    return null;
  }
  return port;
}

export function buildCorsOrigins(port: number) {
  const hosts = ['localhost', '127.0.0.1'];
  return hosts.flatMap((host) => [
    `http://${host}:${port}`,
    `https://${host}:${port}`
  ]);
}

export function buildAppUrl(port: number, host = 'localhost') {
  return `http://${host}:${port}`;
}

export async function resolveStartupPort(ConfiguracionSistema: ModelStatic<Configuracion>) {
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

export function updateEnvPort(port: unknown) {
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


// Crea y elimina únicamente una base temporal propia; nunca copia datos del ERP.
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env'), quiet: true });
const { Client } = require(path.join(backend, 'node_modules/pg'));
const database = `erp_ts_${Date.now()}_${process.pid}_test`;
const admin = new Client({ host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'erp_techstore' });
let created = false, server, models;
const containerImage = process.env.ERP_TEST_IMAGE;
const containerName = `erp-ts-check-${process.pid}-${Date.now()}`;
let uploads;
async function run() {
  try {
    const existing = await fetch('http://127.0.0.1:3002/api/health', { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (existing) throw new Error('El puerto aislado 3002 ya está ocupado');
    await admin.connect();
    if (!/^erp_ts_\d+_\d+_test$/.test(database)) throw new Error('Nombre de base aislada inválido');
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    process.env.DB_NAME = database;
    process.env.DB_SYNC_ALTER = 'false';
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3002';
    process.env.RUN_DB_TESTS = '1';
    process.env.TEST_BASE_URL = 'http://127.0.0.1:3002/api';
    models = require(path.join(backend, 'dist/models'));
    await models.sequelize.sync();
    const sede = await models.Sede.create({ nombre: 'Sede aislada TypeScript', direccion: 'Dirección de prueba', activa: true });
    const usuario = await models.Usuario.create({ nombre: 'Administrador de prueba', email: 'typescript-test@example.invalid',
      password: 'fixture-local-only', rol: 'superadmin', sedeId: sede.id, activo: true });
    const { fechaOperativa } = require(path.join(backend, 'dist/utils/caja-fecha'));
    await models.Caja.create({ sedeId: sede.id, usuarioAperturaId: usuario.id, fecha: fechaOperativa(), estado: 'abierta', montoApertura: 0 });
    if (containerImage) {
      // CI Linux: mismo servidor de PostgreSQL temporal, sin volúmenes de producción.
      uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-ts-container-'));
      const variables = ['NODE_ENV', 'PORT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'DB_SYNC_ALTER', 'JWT_SECRET'];
      server = spawn('docker', ['run', '--rm', '--name', containerName, '--network', 'host',
        ...variables.flatMap(name => ['--env', name]), '--mount', `type=bind,source=${uploads},target=/app/backend/uploads`, containerImage],
        { cwd: backend, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
      server = spawn(process.execPath, ['dist/server.js'], { cwd: backend, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    let serverLog = '';
    server.stdout.on('data', chunk => { serverLog = (serverLog + chunk).slice(-8000); });
    server.stderr.on('data', chunk => { serverLog = (serverLog + chunk).slice(-8000); });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const response = await fetch(`${process.env.TEST_BASE_URL}/health`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
      if (response?.ok) { ready = true; break; }
      if (server.exitCode !== null) throw new Error(`Servidor aislado detenido: ${serverLog}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`No arrancó el servidor aislado: ${serverLog}`);
    if (containerImage) {
      for (const asset of ['/', '/assets/js/app.js', '/assets/css/custom.css']) {
        const response = await fetch(`http://127.0.0.1:3002${asset}`);
        if (!response.ok) throw new Error(`Recurso de contenedor no disponible: ${asset}`);
      }
      const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
      fs.writeFileSync(path.join(uploads, 'phase5.png'), image);
      const response = await fetch('http://127.0.0.1:3002/uploads/phase5.png');
      if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(image)) throw new Error('El volumen de uploads no conserva imágenes');
      console.log('OK: imagen de producción, recursos compilados y uploads persistentes.');
    }
    const child = spawn(process.execPath, ['--test', 'dist/tests/combo.integration.test.js'], { cwd: backend, env: process.env, stdio: 'inherit' });
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error('Falló la integración aislada');
    if (process.argv.includes('--phase4')) {
      await require('../2026-10-08/phase4-checks.cjs')({ models, sede, usuario, backend, baseUrl: process.env.TEST_BASE_URL });
    }
    console.log('OK: integración compilada en PostgreSQL temporal; venta, seriales, stock y devolución.');
  } finally {
    if (containerImage && server) {
      const stop = spawn('docker', ['stop', containerName], { stdio: 'ignore' });
      await once(stop, 'exit');
    }
    if (server && server.exitCode === null) {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
    }
    if (models) await models.sequelize.close();
    if (created) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [database]);
      await admin.query(`DROP DATABASE "${database}"`);
      console.log('Base temporal eliminada.');
    }
    await admin.end();
    if (uploads) {
      const resolved = path.resolve(uploads);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('erp-ts-container-')) throw new Error('Ruta temporal de uploads inválida');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });

// Only creates, writes and drops its own uniquely named test database.
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), backend = path.join(root, 'backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env'), quiet: true });
const { Client } = require(path.join(backend, 'node_modules/pg'));
const jwt = require(path.join(backend, 'node_modules/jsonwebtoken'));
const database = `erp_inversion_${Date.now()}_${process.pid}_test`;
const admin = new Client({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER || 'postgres', password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'erp_techstore', connectionTimeoutMillis: 5000 });
const base = 'http://127.0.0.1:3005', checks = [];
let created = false, models, server;
const cents = text => { const [whole, part = '00'] = text.split('.'); return BigInt(whole) * 100n + BigInt(part.padEnd(2, '0')); };
const decimal = n => `${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
async function check(name, callback) { await callback(); checks.push({ name, passed: true }); console.log(`OK ${name}`); }
(async () => {
  try {
    await admin.connect();
    if (!/^erp_inversion_\d+_\d+_test$/.test(database)) throw new Error('Nombre de base aislada inválido');
    if (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) }).catch(() => null)) throw new Error('Puerto de auditoría 3005 ocupado');
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    Object.assign(process.env, { DB_NAME: database, DB_SYNC_ALTER: 'false', NODE_ENV: 'production', PORT: '3005', JWT_SECRET: crypto.randomBytes(32).toString('hex'), PUBLIC_BASE_URL: base, CORS_ORIGINS: base, SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', GEMINI_API_KEY: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
    models = require(path.join(backend, 'dist/models'));
    await models.sequelize.sync();
    const sedes = [];
    for (const nombre of ['Principal · prueba inversión', 'Norte · prueba inversión', 'Sede sin mercancía']) sedes.push(await models.Sede.create({ nombre, direccion: 'Dirección de auditoría aislada', activa: true }));
    const users = [];
    for (const rol of ['superadmin', 'admin', 'gerente_sede', 'cajero', 'tecnico', 'contador']) users.push(await models.Usuario.create({ nombre: `Prueba ${rol}`, email: `${rol}@example.invalid`, password: 'fixture-inversion-only', rol, sedeId: sedes[0].id, activo: true }));
    const tokens = users.map(user => jwt.sign({ userId: user.id, sessionVersion: Number(user.sessionVersion) || 0 }, process.env.JWT_SECRET));
    await models.ConfiguracionSistema.create({ empresa: 'GAME', notificacionesActivas: false, emailActivo: false, emailFacturaAuto: false, emailCarteraRecordatorio: false });
    const categoria = await models.Categoria.create({ nombre: 'Pruebas de inversión' });
    const fixture = [];
    async function product(nombre, cost, stocks, extra = {}) {
      const p = await models.Producto.create({ nombre, codigoBarras: `INV-${fixture.length}`, precioCosto: cost, precioVenta: cost, categoriaId: categoria.id, ...extra });
      for (const [index, cantidad] of stocks) {
        const stock = await models.StockSede.create({ sedeId: sedes[index].id, productoId: p.id, cantidad });
        fixture.push({ id: stock.id, productoId: p.id, sedeId: sedes[index].id, cantidad, cost, included: cantidad > 0 && !extra.esCombo && !extra.esServicio });
      }
      return p;
    }
    const basic = await product('Adaptador multipuerto con HDMI y Ethernet', '10.25', [[0, 3], [1, 2]]);
    await product('Mercancía sin costo registrado', '0.00', [[0, 5], [1, 1]]);
    await product('Equipo desactivado con existencias', '7.11', [[0, 2]], { activo: false });
    const component = await product('Componente físico del combo', '2.50', [[0, 4]]);
    await product('Cable de red por metro', '0.33', [[0, 3]], { unidadMedida: 'm' });
    await product('Servicio excluido', '1000.00', [[0, 99]], { esServicio: true });
    const combo = await product('Combo virtual excluido', '200.00', [[0, 9]], { esCombo: true });
    await models.ComboComponente.create({ comboId: combo.id, productoId: component.id, cantidad: 2 });
    await product('Sin existencias', '50.00', [[0, 0]]);
    await product('Existencias negativas', '50.00', [[0, -3]]);
    await product('Importe superior al entero seguro de JavaScript', '9999999999999.99', [[1, 1000]]);
    const serial = await product('Equipo con seriales', '123.45', [[0, 1], [1, 2]], { tieneNumeroSerie: true });
    for (let n = 0; n < 3; n++) await models.NumeroSerie.create({ productoId: serial.id, sedeId: sedes[n ? 1 : 0].id, serie: `INV-SERIAL-${n}`, estado: 'en_stock' });
    for (let n = 0; n < 53; n++) await product(`Producto paginado ${String(n).padStart(2, '0')}`, '1.01', [[0, 1]]);
    const expected = sedeId => {
      const rows = fixture.filter(item => item.included && (!sedeId || item.sedeId === sedeId));
      return { amount: decimal(rows.reduce((total, item) => total + cents(item.cost) * BigInt(item.cantidad), 0n)), products: new Set(rows.map(item => item.productoId)).size, zero: new Set(rows.filter(item => cents(item.cost) === 0n).map(item => item.productoId)).size, rows: rows.length };
    };
    server = spawn(process.execPath, ['dist/server.js'], { cwd: backend, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-5000); });
    let ready = false;
    for (let n = 0; n < 60; n++) {
      if ((await fetch(`${base}/api/health`).catch(() => null))?.ok) { ready = true; break; }
      if (server.exitCode !== null) throw new Error(log);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('Servidor aislado no disponible: ' + log);
    const request = async (query = '', token = tokens[0], options = {}) => {
      const response = await fetch(`${base}/api/inventario/inversion${query}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
      return { status: response.status, data: await response.json() };
    };
    await check('Exactitud decimal, inactivos, servicios, combos y conteos distintos', async () => {
      const { status, data } = await request(); const want = expected();
      assert.equal(status, 200); assert.equal(data.resumen.inversionTotal, want.amount);
      assert.equal(data.resumen.productosConExistencias, want.products); assert.equal(data.resumen.productosSinCosto, want.zero);
      assert.equal(data.pagination.total, want.rows);
      assert.equal(data.resumen.inversionTotal, decimal(data.sedes.reduce((sum, sede) => sum + cents(sede.inversionTotal), 0n)));
      assert.ok(data.items.some(item => !item.activo));
      assert.ok(!data.items.some(item => /excluido|negativas|Sin existencias/.test(item.nombre)));
    });
    await check('Paginación completa, orden estable y totales independientes de la página', async () => {
      const first = (await request()).data, second = (await request('?page=2')).data;
      assert.equal(first.items.length, 50); assert.ok(second.items.length > 0);
      assert.deepEqual(first.resumen, second.resumen);
      const all = first.items.concat(second.items);
      assert.equal(new Set(all.map(item => item.id)).size, expected().rows);
      for (let n = 1; n < all.length; n++) assert.ok(cents(all[n - 1].inversionTotal) >= cents(all[n].inversionTotal));
      assert.deepEqual((await request('?page=2')).data.items.map(item => item.id), second.items.map(item => item.id));
      assert.equal((await request('?page=999')).data.pagination.page, 2);
    });
    await check('Sedes individuales y sede vacía', async () => {
      for (const sede of sedes) {
        const { status, data } = await request(`?sedeId=${sede.id}`);
        assert.equal(status, 200); assert.equal(data.resumen.inversionTotal, expected(sede.id).amount);
        assert.equal(data.resumen.productosConExistencias, expected(sede.id).products);
        assert.ok(data.items.every(item => item.sedeId === sede.id));
      }
      assert.equal((await request(`?sedeId=${sedes[2].id}`)).data.pagination.totalPages, 1);
    });
    await check('Permisos y manipulación de sede', async () => {
      assert.equal((await request('', tokens[1])).status, 200);
      const gerente = await request('', tokens[2]); assert.equal(gerente.status, 200);
      assert.equal(gerente.data.resumen.inversionTotal, expected(sedes[0].id).amount);
      for (const target of [sedes[1].id, '', 'todas']) assert.equal((await request(`?sedeId=${target}`, tokens[2])).status, 403);
      for (const token of tokens.slice(3)) assert.equal((await request('', token)).status, 403);
      assert.equal((await request('', 'token-invalido')).status, 401);
      assert.equal((await request('?sedeId=invalida')).status, 400);
      assert.equal((await request(`?sedeId=${crypto.randomUUID()}`)).status, 404);
      for (const page of ['0', '-1', '1.5', 'abc', '2147483648']) assert.equal((await request(`?page=${page}`)).status, 400);
      await users[2].update({ sedeId: null });
      const token = jwt.sign({ userId: users[2].id, sessionVersion: users[2].sessionVersion }, process.env.JWT_SECRET);
      assert.equal((await request('', token)).status, 403);
      await users[2].update({ sedeId: sedes[0].id });
      tokens[2] = jwt.sign({ userId: users[2].id, sessionVersion: users[2].sessionVersion }, process.env.JWT_SECRET);
    });
    await check('Una instantánea coherente mientras cambia el costo', async () => {
      await Promise.all([
        (async () => { for (let n = 0; n < 24; n++) await basic.update({ precioCosto: n % 2 ? '10.25' : '10.26' }); })(),
        (async () => { for (let n = 0; n < 12; n++) {
          const { data } = await request(`?sedeId=${sedes[1].id}`);
          assert.equal(data.resumen.inversionTotal, decimal(data.items.reduce((sum, item) => sum + cents(item.inversionTotal), 0n)));
        } })()
      ]);
      await basic.update({ precioCosto: '10.25' });
    });
    await check('Cambio de costo, salida, entrada y traslado actualizan el valor', async () => {
      await basic.update({ precioCosto: '11.25' });
      assert.equal((await request()).data.resumen.inversionTotal, decimal(cents(expected().amount) + 500n));
      const stock = await models.StockSede.findOne({ where: { productoId: basic.id, sedeId: sedes[0].id } });
      await stock.update({ cantidad: 2 });
      assert.equal((await request()).data.resumen.inversionTotal, decimal(cents(expected().amount) + 500n - 1125n));
      await stock.update({ cantidad: 3 }); await basic.update({ precioCosto: '10.25' });
      const transfer = await fetch(`${base}/api/inventario/traslado`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ productoId: basic.id, sedeOrigenId: sedes[0].id, sedeDestinoId: sedes[1].id, cantidad: 1, motivo: 'Auditoría aislada' }) });
      assert.equal(transfer.status, 200, await transfer.text());
      assert.equal((await request()).data.resumen.inversionTotal, expected().amount);
      assert.equal((await request(`?sedeId=${sedes[0].id}`)).data.resumen.inversionTotal, decimal(cents(expected(sedes[0].id).amount) - 1025n));
      await models.StockSede.update({ cantidad: 3 }, { where: { productoId: basic.id, sedeId: sedes[0].id } });
      await models.StockSede.update({ cantidad: 2 }, { where: { productoId: basic.id, sedeId: sedes[1].id } });
    });
    await check('Recepción de compra y venta reales por API en la base aislada', async () => {
      const post = async (endpoint, body) => {
        const response = await fetch(`${base}/api${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
      };
      const proveedor = await models.Proveedor.create({ nombre: 'Proveedor de auditoría aislada', nit: 'INV-TEST-ONLY' });
      const compra = await post('/compras', { proveedorId: proveedor.id, sedeId: sedes[0].id, items: [{ productoId: basic.id, cantidadPedida: 1, precioUnitario: '10.25' }] });
      await post(`/compras/${compra.id}/recibir`, { items: [{ productoId: basic.id, cantidadRecibida: 1 }] });
      assert.equal((await request()).data.resumen.inversionTotal, decimal(cents(expected().amount) + 1025n));
      await models.Caja.create({ sedeId: sedes[0].id, usuarioAperturaId: users[0].id, fecha: require(path.join(backend, 'dist/utils/caja-fecha')).fechaOperativa(), estado: 'abierta', montoApertura: 0 });
      await basic.update({ tieneIVA: false });
      await post('/ventas', { sedeId: sedes[0].id, esCredito: false, items: [{ productoId: basic.id, cantidad: 1, precioBase: 10.25, precioModificado: 10.25, descuentoPct: 0 }], pagos: [{ metodo: 'tarjeta', monto: 10.25 }], idempotencyKey: crypto.randomUUID() });
      assert.equal((await request()).data.resumen.inversionTotal, expected().amount);
      await basic.update({ tieneIVA: true });
    });
    await require('./inversion-browser.cjs')({ backend, base, users, tokens, sedes, output: __dirname, checks });
    fs.writeFileSync(path.join(__dirname, 'inversion-results.json'), JSON.stringify({ checks, total: checks.length }, null, 2));
    console.log(`OK: ${checks.length} comprobaciones de inversión.`);
  } finally {
    if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
    if (models) await models.sequelize.close();
    if (created) { await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [database]); await admin.query(`DROP DATABASE "${database}"`); console.log('Base temporal eliminada.'); }
    await admin.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

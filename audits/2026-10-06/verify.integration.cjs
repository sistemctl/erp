// Solo utiliza una base nueva y temporal; nunca sincroniza la base configurada del ERP.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const dependency = (name) => require(path.join(root, 'backend/node_modules', name));
const { Client } = dependency('pg');
const env = dependency('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
const databaseName = `erp_audit_${Date.now()}_${process.pid}`;
if (!/^erp_audit_\d+_\d+$/.test(databaseName)) throw new Error('Nombre de base temporal inválido.');
const admin = new Client({ host: env.DB_HOST || 'localhost', port: env.DB_PORT || 5432,
  user: env.DB_USER || 'postgres', password: env.DB_PASS, database: env.DB_NAME || 'erp_techstore' });
const results = [];
let models, server, created = false;
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); console.log(`OK ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
}

(async () => {
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    Object.assign(process.env, { ...env, DB_NAME: databaseName, NODE_ENV: 'test', JWT_SECRET: randomUUID() + randomUUID(),
      SMTP_HOST: '', SMTP_PASS: '', TWILIO_AUTH_TOKEN: '', GEMINI_API_KEY: '',
      PGOPTIONS: '-c statement_timeout=12000 -c lock_timeout=8000' });
    models = require(path.join(root, 'backend/models'));
    const m = models, { sequelize } = m;
    assert.equal(sequelize.config.database, databaseName);
    await sequelize.sync({ force: true });
    await require(path.join(root, 'backend/migrations/audit-2026-10')).migrateAuditSchema(sequelize);
    await require(path.join(root, 'backend/migrations/caja-facturas-2026-10')).migrateCajaFacturasSchema(sequelize);
    const express = dependency('express'), app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use(require(path.join(root, 'backend/middleware/auditLog.middleware')));
    for (const route of ['auth', 'config', 'ventas', 'facturas', 'reparaciones', 'instalaciones', 'inventario', 'series', 'compras', 'cartera', 'cotizaciones', 'productos', 'caja']) {
      app.use(`/api/${route}`, require(path.join(root, `backend/routes/${route}.routes`)));
    }
    app.use(require(path.join(root, 'backend/middleware/errorHandler')));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const url = `http://127.0.0.1:${server.address().port}/api`;
    const A = await m.Sede.create({ nombre: 'Auditoría A', direccion: 'Temporal A' });
    const B = await m.Sede.create({ nombre: 'Auditoría B', direccion: 'Temporal B' });
    const password = 'audit-test-password-only';
    const administrator = await m.Usuario.create({ nombre: 'Administrador temporal', email: 'admin@audit.invalid', password,
      rol: 'superadmin', sedeId: A.id });
    const cashier = await m.Usuario.create({ nombre: 'Cajero temporal', email: 'cashier@audit.invalid', password,
      rol: 'cajero', sedeId: A.id });
    const manager = await m.Usuario.create({ nombre: 'Gerente temporal', email: 'manager@audit.invalid', password,
      rol: 'gerente_sede', sedeId: A.id });
    const cliente = await m.Cliente.create({ nombre: 'Cliente temporal', documento: 'AUDIT-1', sedeId: A.id });
    const category = await m.Categoria.create({ nombre: 'Auditoría' });
    const config = await m.ConfiguracionSistema.create({ empresa: 'Auditoría temporal', cobrarIvaPos: false, ivaDefecto: 19,
      descuentoMaximoPct: 15, emailActivo: false, smsActivo: false, whatsappActivo: false, emailFacturaAuto: false });
    const caja = await m.Caja.create({ sedeId: A.id, usuarioAperturaId: cashier.id, montoApertura: 1000000,
      fecha: '2026-10-06', estado: 'abierta' });
    const service = await m.Producto.create({ nombre: 'Servicio temporal', codigoBarras: 'AUD-SVC', categoriaId: category.id,
      precioVenta: 10000, precioCosto: 1000, esServicio: true, tieneIVA: true });
    const product = await m.Producto.create({ nombre: 'Producto temporal', codigoBarras: 'AUD-PROD', categoriaId: category.id,
      precioVenta: 10000, precioCosto: 1000, tieneIVA: true });
    await m.StockSede.create({ productoId: product.id, sedeId: A.id, cantidad: 100 });
    const serialized = await m.Producto.create({ nombre: 'Equipo temporal', codigoBarras: 'AUD-SER', categoriaId: category.id,
      precioVenta: 20000, precioCosto: 5000, tieneNumeroSerie: true, tieneIVA: true });
    await m.StockSede.create({ productoId: serialized.id, sedeId: A.id, cantidad: 3 });
    const serials = await m.NumeroSerie.bulkCreate(['SER-1', 'SER-2', 'SER-3'].map((serie) => ({ serie,
      productoId: serialized.id, sedeId: A.id, estado: 'en_stock' })));
    async function request(endpoint, token, body, method = body ? 'POST' : 'GET') {
      const response = await fetch(url + endpoint, { method, signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    }
    async function login(email) {
      const response = await request('/auth/login', null, { email, password });
      assert.equal(response.status, 200); return response.body.token;
    }
    let adminToken = await login(administrator.email), cashToken = await login(cashier.email), managerToken = await login(manager.email);
    const saleBody = (p = service, extra = {}) => ({ clienteId: cliente.id, sedeId: A.id, subtotal: Number(p.precioVenta),
      descuentoTotal: 0, iva: 0, total: Number(p.precioVenta), esCredito: false,
      items: [{ productoId: p.id, cantidad: 1, precioBase: Number(p.precioVenta), precioModificado: Number(p.precioVenta), descuentoPct: 0 }],
      pagos: [{ metodo: 'tarjeta', monto: Number(p.precioVenta) }], idempotencyKey: randomUUID(), ...extra });
    async function sell(p = service, extra = {}) {
      const r = await request('/ventas', cashToken, saleBody(p, extra));
      assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
    }
    await check('A01: rechaza contado sin pago y recalcula total alterado', async () => {
      const unpaid = await request('/ventas', cashToken, saleBody(service, { total: 1, pagos: [] }));
      assert.equal(unpaid.status, 400);
      const sale = await sell(service, { total: 1 });
      assert.equal(Number((await m.Venta.findByPk(sale.ventaId)).total), 10000);
    });
    await check('A02: devolución sin IVA coincide con cobro', async () => {
      const sale = await sell(product);
      const item = await m.ItemVenta.findOne({ where: { ventaId: sale.ventaId } });
      assert.equal(Number(item.iva), 0);
      const r = await request(`/ventas/${sale.ventaId}/devolucion`, cashToken, {
        motivo: 'Auditoría', metodoReembolso: 'tarjeta', items: [{ itemVentaId: item.id, cantidad: 1 }] });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(Number(r.body.devolucion.total), 10000);
    });
    await check('A03/A12: descuento falso exige PIN y preserva sesión', async () => {
      const body = saleBody(service, { total: 2000, items: [{ productoId: service.id, cantidad: 1, precioBase: 10000,
        precioModificado: 2000, descuentoPct: 0 }], pagos: [{ metodo: 'tarjeta', monto: 2000 }], pinAdmin: 'invalid' });
      const r = await request('/ventas', cashToken, body);
      assert.equal(r.status, 403); assert.equal((await request('/auth/me', cashToken)).status, 200);
    });
    await check('Ventas históricas con IVA inconsistente no generan reembolsos excesivos', async () => {
      const sale = await sell(product);
      const item = await m.ItemVenta.findOne({ where: { ventaId: sale.ventaId } });
      await item.update({ ivaTotal: null, iva: 1900 });
      const stock = await m.StockSede.findOne({ where: { productoId: product.id, sedeId: A.id } });
      const before = stock.cantidad;
      const response = await request(`/ventas/${sale.ventaId}/devolucion`, cashToken, {
        motivo: 'Auditoría', metodoReembolso: 'tarjeta', items: [{ itemVentaId: item.id, cantidad: 1 }] });
      assert.equal(response.status, 409);
      assert.equal((await stock.reload()).cantidad, before);
      assert.equal(await m.DevolucionVenta.count({ where: { ventaId: sale.ventaId } }), 0);
    });
    await check('A04: solicitudes rechazadas no agotan conexiones', async () => {
      for (let i = 0; i < 12; i++) {
        const r = await request('/compras', adminToken, {}); assert.equal(r.status, 400);
      }
      assert.equal((await request('/config/sedes', cashToken)).status, 200);
      assert.equal(sequelize.connectionManager.pool.using, 0);
    });
    await check('A05: rechaza ítem repetido y dos devoluciones concurrentes', async () => {
      const sale = await sell(product), item = await m.ItemVenta.findOne({ where: { ventaId: sale.ventaId } });
      const row = { itemVentaId: item.id, cantidad: 1 };
      assert.equal((await request(`/ventas/${sale.ventaId}/devolucion`, cashToken, {
        motivo: 'Auditoría', metodoReembolso: 'tarjeta', items: [row, row] })).status, 400);
      const pair = await Promise.all([1, 2].map(() => request(`/ventas/${sale.ventaId}/devolucion`, cashToken, {
        motivo: 'Auditoría', metodoReembolso: 'tarjeta', items: [row] })));
      assert.deepEqual(pair.map((r) => r.status).sort(), [201, 400]);
      assert.equal(Number((await item.reload()).cantidadDevuelta), 1);
    });
    let repairA, repairB;
    await check('A06: entrega concurrente/repetida registra un solo cobro', async () => {
      repairA = await m.OrdenReparacion.create({ numeroOrden: 'OR-000100', clienteId: cliente.id, sedeId: A.id,
        tipoEquipo: 'Teléfono', marca: 'Temporal', modelo: 'Fixture', problemaReportado: 'Auditoría', totalCobrado: 10000, estado: 'listo' });
      const before = Number((await caja.reload()).totalVentasEfectivo);
      const pair = await Promise.all([1, 2].map(() => request(`/reparaciones/${repairA.id}/estado`, managerToken,
        { estado: 'entregado', metodoPago: 'efectivo' }, 'PUT')));
      pair.forEach((r) => assert.equal(r.status, 200, JSON.stringify(r.body)));
      assert.equal(Number((await caja.reload()).totalVentasEfectivo) - before, 10000);
      assert.equal(await m.Factura.count({ where: { ordenReparacionId: repairA.id } }), 1);
    });
    await check('A07: rechaza lectura y modificación de otra sede', async () => {
      repairB = await m.OrdenReparacion.create({ numeroOrden: 'OR-000101', clienteId: cliente.id, sedeId: B.id,
        tipoEquipo: 'Teléfono', marca: 'Temporal', modelo: 'Fixture', problemaReportado: 'Auditoría' });
      assert.equal((await request(`/reparaciones/${repairB.id}`, cashToken)).status, 403);
      assert.equal((await request(`/reparaciones/${repairB.id}`, managerToken, { diagnostico: 'Intento' }, 'PUT')).status, 403);
      assert.equal((await request(`/reparaciones/${repairB.id}`, adminToken)).status, 200);
    });
    await check('A08: traslado exige y mueve seriales exactos', async () => {
      const body = { productoId: serialized.id, sedeOrigenId: A.id, sedeDestinoId: B.id, cantidad: 1, motivo: 'Auditoría' };
      assert.equal((await request('/inventario/traslado', managerToken, body)).status, 400);
      const r = await request('/inventario/traslado', managerToken, { ...body, series: ['SER-3'] });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal((await serials[2].reload()).sedeId, B.id);
      const remote = await request('/inventario/traslado', managerToken, { ...body, sedeOrigenId: B.id, sedeDestinoId: A.id, series: ['SER-3'] });
      assert.equal(remote.status, 403);
    });
    let combo;
    await check('A09: anulación repone componentes y serial del combo', async () => {
      combo = await m.Producto.create({ nombre: 'Combo temporal', codigoBarras: 'AUD-COMBO', categoriaId: category.id,
        precioVenta: 40000, precioCosto: 6000, esCombo: true });
      await m.ComboComponente.bulkCreate([{ comboId: combo.id, productoId: product.id, cantidad: 1 },
        { comboId: combo.id, productoId: serialized.id, cantidad: 1 }]);
      await m.StockSede.create({ productoId: combo.id, sedeId: A.id, cantidad: 0 });
      const before = Number((await m.StockSede.findOne({ where: { productoId: serialized.id, sedeId: A.id } })).cantidad);
      const sale = await sell(combo);
      const response = await request(`/facturas/${sale.facturaId}/nota-credito`, adminToken, {});
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(Number((await m.StockSede.findOne({ where: { productoId: serialized.id, sedeId: A.id } })).cantidad), before);
      assert.equal(Number((await m.StockSede.findOne({ where: { productoId: combo.id, sedeId: A.id } })).cantidad), 0);
      assert.equal(await m.ItemVentaComponente.count({ where: { devuelto: true } }), 2);
    });
    await check('A14/A18: ventas simultáneas conservan caja y consecutivos únicos', async () => {
      const before = Number((await caja.reload()).totalVentasTarjeta);
      const sales = await Promise.all(Array.from({ length: 6 }, () => sell()));
      assert.equal(new Set(sales.map((r) => r.numeroVenta)).size, 6);
      assert.equal(new Set(sales.map((r) => r.numeroFactura)).size, 6);
      assert.equal(Number((await caja.reload()).totalVentasTarjeta) - before, 60000);
    });
    await check('A15: devolución repone solo el IMEI de la venta original', async () => {
      const oldSale = await sell(serialized, { items: [{ productoId: serialized.id, cantidad: 1,
        precioModificado: 20000, imei: 'SER-1' }] });
      const newSale = await sell(serialized, { items: [{ productoId: serialized.id, cantidad: 1,
        precioModificado: 20000, imei: 'SER-2' }] });
      const item = await m.ItemVenta.findOne({ where: { ventaId: oldSale.ventaId } });
      assert.equal(item.numeroSerieId, serials[0].id);
      const r = await request(`/ventas/${oldSale.ventaId}/devolucion`, cashToken,
        { motivo: 'Auditoría', metodoReembolso: 'tarjeta', items: [{ itemVentaId: item.id, cantidad: 1 }] });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal((await serials[0].reload()).estado, 'en_stock');
      assert.equal((await serials[1].reload()).estado, 'vendido');
    });
    await check('A17: cotización requiere vínculo válido y conserva ventaId', async () => {
      const cot = await request('/cotizaciones', managerToken, { clienteId: cliente.id, sedeId: A.id, fechaVencimiento: '2027-01-01',
        items: [{ productoId: service.id, descripcion: service.nombre, cantidad: 1, precioUnitario: 10000 }] });
      assert.equal(cot.status, 201, JSON.stringify(cot.body));
      assert.equal((await request(`/cotizaciones/${cot.body.id}/aprobar`, managerToken, {})).status, 400);
      const sale = await sell();
      const approved = await request(`/cotizaciones/${cot.body.id}/aprobar`, managerToken, { ventaId: sale.ventaId });
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      assert.equal(approved.body.cotizacion.ventaId, sale.ventaId);
    });
    await check('A11: desactivación y cambio de contraseña revocan JWT', async () => {
      await cashier.update({ activo: false });
      assert.equal((await request('/auth/me', cashToken)).status, 401);
      await cashier.update({ activo: true }); cashToken = await login(cashier.email);
      await cashier.update({ password });
      assert.equal((await request('/auth/me', cashToken)).status, 401);
      cashToken = await login(cashier.email);
    });
    await check('Reintentos simultáneos registran una sola venta', async () => {
      const body = saleBody();
      const before = await m.Venta.count();
      const responses = await Promise.all([request('/ventas', cashToken, body), request('/ventas', cashToken, body)]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
      assert.equal(responses[0].body.ventaId, responses[1].body.ventaId);
      assert.equal(await m.Venta.count(), before + 1);
    });
    await check('Regresión del flujo existente de combos', async () => {
      await config.update({ cobrarIvaPos: true });
      try {
        const { promisify } = require('node:util');
        const { execFile } = require('node:child_process');
        const result = await promisify(execFile)(process.execPath, ['--test', 'tests/combo.integration.test.js'], {
          cwd: path.join(root, 'backend'), env: { ...process.env, RUN_DB_TESTS: '1', TEST_BASE_URL: url }, timeout: 60000
        });
        fs.writeFileSync(path.join(__dirname, 'combo-test-results.txt'), result.stdout);
      } finally { await config.update({ cobrarIvaPos: false }); }
    });
    await check('A16: migración aditiva funciona sobre tablas existentes', async () => {
      await sequelize.query('ALTER TABLE "Productos" DROP COLUMN "esCombo"');
      await sequelize.query('ALTER TABLE "Usuarios" DROP COLUMN "sessionVersion"');
      await require(path.join(root, 'backend/migrations/audit-2026-10')).migrateAuditSchema(sequelize);
      await require(path.join(root, 'backend/migrations/audit-2026-10')).migrateAuditSchema(sequelize);
      const columns = await sequelize.getQueryInterface().describeTable('Productos');
      assert.ok(columns.esCombo);
      await combo.update({ esCombo: true });
      adminToken = await login(administrator.email); cashToken = await login(cashier.email); managerToken = await login(manager.email);
    });
    await check('A10: respaldo completo, cifrado y restaurable', async () => {
      const backupPassword = 'audit-encrypted-backup-password';
      const exported = await request('/config/backup', adminToken, { password: backupPassword });
      assert.equal(exported.status, 200, JSON.stringify(exported.body));
      assert.equal(exported.body.version, 2);
      const helper = require(path.join(root, 'backend/utils/backup'));
      const data = helper.decryptBackup(exported.body, backupPassword);
      for (const name of ['ComboComponente', 'ItemVentaComponente', 'ItemDevolucion', 'DevolucionVenta', 'ReclamoGarantia']) assert.ok(Array.isArray(data[name]));
      assert.ok(data.Usuario[0].password.startsWith('$2'));
      const before = await m.Venta.count();
      const invalid = await request('/config/restore', adminToken, { backup: exported.body, password: 'wrong-backup-password' });
      assert.equal(invalid.status, 400); assert.equal(await m.Venta.count(), before);
      await m.Cliente.create({ nombre: 'Después de respaldo', sedeId: A.id });
      const restored = await request('/config/restore', adminToken, { backup: exported.body, password: backupPassword });
      assert.equal(restored.status, 200, JSON.stringify(restored.body));
      assert.equal(await m.Venta.count(), before);
      assert.equal(await m.Cliente.count({ where: { nombre: 'Después de respaldo' } }), 0);
      assert.equal((await request('/auth/me', adminToken)).status, 401);
      adminToken = await login(administrator.email); cashToken = await login(cashier.email);
      await sell();
    });
    const focused = process.argv.includes('--caja-facturas');
    if (focused) await require('./caja-facturas.checks.cjs')({ check, m, request, adminToken, cashToken, managerToken,
      A, B, caja, service, product, cliente, saleBody, url });
    const summary = { checkedAt: new Date().toISOString(), database: 'Temporal independiente, eliminada al finalizar', results,
      passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length };
    fs.writeFileSync(path.join(__dirname, focused ? 'caja-facturas-results.json' : 'verification-results.json'), JSON.stringify(summary, null, 2) + '\n');
    if (summary.failed) process.exitCode = 1;
    console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed }));
  } catch (error) {
    process.exitCode = 1; console.error('Error de verificación:', error.message);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (models) await models.sequelize.close();
    if (created) {
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      console.log('Base temporal eliminada.');
    }
    await admin.end();
  }
})();

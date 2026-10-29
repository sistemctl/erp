const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const root = path.resolve(__dirname, '../..'), backend = path.join(root, 'backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env'), quiet: true });
const { Client } = require(path.join(backend, 'node_modules/pg'));
const jwt = require(path.join(backend, 'node_modules/jsonwebtoken'));
const database = `erp_metros_${Date.now()}_${process.pid}_test`, base = 'http://127.0.0.1:3006';
const admin = new Client({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER || 'postgres', password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'erp_techstore', connectionTimeoutMillis: 5000 });
let models, server, created = false;
const checks = [];
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log(`OK ${name}`); }
(async () => {
  try {
    await admin.connect();
    if (!/^erp_metros_\d+_\d+_test$/.test(database)) throw new Error('Base aislada inválida');
    if (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) }).catch(() => null)) throw new Error('Puerto 3006 ocupado');
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    Object.assign(process.env, { DB_NAME: database, DB_SYNC_ALTER: 'false', NODE_ENV: 'production', PORT: '3006', JWT_SECRET: crypto.randomBytes(32).toString('hex'), PUBLIC_BASE_URL: base, CORS_ORIGINS: base, SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', GEMINI_API_KEY: '' });
    models = require(path.join(backend, 'dist/models')); await models.sequelize.sync();
    const sedes = [];
    for (const nombre of ['Principal · prueba metros', 'Norte · prueba metros']) sedes.push(await models.Sede.create({ nombre, direccion: 'Dirección ficticia' }));
    const user = await models.Usuario.create({ nombre: 'Auditoría de metros', email: 'metros@example.invalid', password: 'fixture-metros-only', rol: 'superadmin', sedeId: sedes[0].id, activo: true });
    const token = jwt.sign({ userId: user.id, sessionVersion: user.sessionVersion || 0 }, process.env.JWT_SECRET);
    await models.ConfiguracionSistema.create({ empresa: 'GAME', notificacionesActivas: false, emailActivo: false, emailFacturaAuto: false, emailCarteraRecordatorio: false });
    const categoria = await models.Categoria.create({ nombre: 'Cables de prueba' });
    const proveedor = await models.Proveedor.create({ nombre: 'Proveedor ficticio de cables', nit: 'METROS-TEST' });
    const cliente = await models.Cliente.create({ nombre: 'Cliente ficticio de instalaciones', sedeId: sedes[0].id });
    server = spawn(process.execPath, ['dist/server.js'], { cwd: backend, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-4000); });
    let ready = false;
    for (let n = 0; n < 60; n++) { if ((await fetch(`${base}/api/health`).catch(() => null))?.ok) { ready = true; break; } if (server.exitCode !== null) throw new Error(log); await new Promise(resolve => setTimeout(resolve, 500)); }
    if (!ready) throw new Error(log);
    const request = async (url, method = 'GET', body, status = 200) => {
      const response = await fetch(base + '/api' + url, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
    };
    const csv = async (text, status = 200) => {
      const form = new FormData(); form.append('sedeId', sedes[0].id); form.append('archivo', new Blob([text], { type: 'text/csv' }), 'cables-ficticios.csv');
      const response = await fetch(`${base}/api/productos/importar-csv`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
    };
    let A, B, order, roundedOrderId;
    await check('Productos y CSV: Cable A 800/m; Cable B 600/m con longitud explícita', async () => {
      A = await request('/productos', 'POST', { nombre: 'Cable A · rollo de 100 m', codigoBarras: 'CABLE-A-TEST', precioCosto: 800, precioVenta: 1200, unidadMedida: 'm', categoriaId: categoria.id }, 201);
      await csv('nombre,codigoBarras,precioVenta,precioCosto,categoriaNombre,unidadMedida,presentacionCosto,costoTotalRollo,metrosPorRollo,stock\nCable B · rollo de 305 m,CABLE-B-TEST,1000,,Cables de prueba,m,rollo,183000,305,0');
      B = await models.Producto.findOne({ where: { codigoBarras: 'CABLE-B-TEST' } });
      assert.equal(String(A.precioCosto), '800.00'); assert.equal(String(B.precioCosto), '600.00'); assert.equal(String(B.precioVenta), '1000.00');
    });
    await check('Compra por rollo: persiste metros y costo/m; recepción no reconvierte', async () => {
      order = await request('/compras', 'POST', { proveedorId: proveedor.id, sedeId: sedes[0].id, items: [
        { productoId: A.id, presentacion: 'rollo', costoTotalRollo: 80000, metrosPorRollo: 100 },
        { productoId: B.id, presentacion: 'rollo', costoTotalRollo: 183000, metrosPorRollo: 305 }
      ] }, 201);
      const items = await models.ItemOrdenCompra.findAll({ where: { ordenCompraId: order.id } });
      assert.equal(String(order.total), '263000.00');
      for (const [id, quantity, price] of [[A.id, 100, '800.00'], [B.id, 305, '600.00']]) { const line = items.find(item => item.productoId === id); assert.equal(line.cantidadPedida, quantity); assert.equal(String(line.precioUnitario), price); }
      await request(`/compras/${order.id}/recibir`, 'POST', { items: [{ productoId: A.id, cantidadRecibida: 100 }, { productoId: B.id, cantidadRecibida: 305 }] });
      await request(`/compras/${order.id}/recibir`, 'POST', { items: [{ productoId: A.id, cantidadRecibida: 100 }] }, 400);
      for (const [id, quantity] of [[A.id, 100], [B.id, 305]]) assert.equal((await models.StockSede.findOne({ where: { productoId: id, sedeId: sedes[0].id } })).cantidad, quantity);
      const list = await request('/compras'); assert.equal(list[0].items[0].producto.unidadMedida, 'm');
    });
    let installation;
    await check('Instalación: consume 65 m y 105 m a costos por metro', async () => {
      installation = await request('/instalaciones', 'POST', { clienteId: cliente.id, sedeId: sedes[0].id, direccion: 'Dirección ficticia', descripcion: 'Instalación con cables ficticios', valorServicio: 0 }, 201);
      await request(`/instalaciones/${installation.id}/materiales`, 'POST', { productoId: A.id, cantidad: 65 }, 201);
      await request(`/instalaciones/${installation.id}/materiales`, 'POST', { productoId: B.id, cantidad: 105 }, 201);
      const materials = await models.MaterialInstalacion.findAll({ where: { ordenId: installation.id } });
      assert.equal(String(materials.find(item => item.productoId === A.id).costoUnitario), '800.00');
      assert.equal(String(materials.find(item => item.productoId === B.id).costoUnitario), '600.00');
      await request(`/instalaciones/${installation.id}/materiales`, 'POST', { productoId: A.id, cantidad: 1.5 }, 400);
      const itemA = materials.find(item => item.productoId === A.id);
      await request(`/instalaciones/${installation.id}/materiales/${itemA.id}`, 'PUT', { cantidad: 65.5 }, 400);
      await request(`/instalaciones/${installation.id}/materiales/${itemA.id}`, 'PUT', { cantidad: 64 });
      await request(`/instalaciones/${installation.id}/materiales/${itemA.id}`, 'PUT', { cantidad: 65 });
    });
    await check('Inversión exacta: 35 m × 800 = 28.000; 200 m × 600 = 120.000', async () => {
      const data = await request(`/inventario/inversion?sedeId=${sedes[0].id}`);
      assert.equal(data.resumen.inversionTotal, '148000.00');
      const rowA = data.items.find(item => item.productoId === A.id), rowB = data.items.find(item => item.productoId === B.id);
      assert.equal(rowA.cantidad, 35); assert.equal(rowA.inversionTotal, '28000.00'); assert.equal(rowA.unidadMedida, 'm');
      assert.equal(rowB.cantidad, 200); assert.equal(rowB.inversionTotal, '120000.00');
      assert.equal(String((await models.Producto.findByPk(A.id)).precioCosto), '800.00');
    });
    await check('Formato canónico no se divide otra vez; rechaza entradas ambiguas y fraccionarias', async () => {
      const canonical = await request('/compras', 'POST', { proveedorId: proveedor.id, items: [{ productoId: A.id, presentacion: 'unidad', cantidadPedida: 100, precioUnitario: 800.45 }] }, 201);
      const item = await models.ItemOrdenCompra.findOne({ where: { ordenCompraId: canonical.id } }); assert.equal(String(item.precioUnitario), '800.45');
      const rounded = await request('/compras', 'POST', { proveedorId: proveedor.id, items: [{ productoId: A.id, presentacion: 'rollo', costoTotalRollo: 100, metrosPorRollo: 3 }] }, 201);
      roundedOrderId = rounded.id;
      assert.equal(String(rounded.total), '99.99');
      assert.equal(String((await models.ItemOrdenCompra.findOne({ where: { ordenCompraId: rounded.id } })).precioUnitario), '33.33');
      await request(`/compras/${canonical.id}/recibir`, 'POST', { items: [{ productoId: A.id, cantidadRecibida: 0.5 }] }, 400);
      for (const line of [
        { productoId: A.id, presentacion: 'rollo', cantidadPedida: 100, precioUnitario: 800, costoTotalRollo: 80000, metrosPorRollo: 100 },
        { productoId: A.id, presentacion: 'rollo', costoTotalRollo: 80000 },
        { productoId: A.id, cantidadPedida: 3.5, precioUnitario: 800 },
        { productoId: A.id, cantidadPedida: -2, precioUnitario: 800 }
      ]) await request('/compras', 'POST', { proveedorId: proveedor.id, items: [line] }, 400);
    });
    await check('Importación: stock solo en sede elegida, duplicados intactos y conversión explícita', async () => {
      await csv('nombre,codigoBarras,precioVenta,precioCosto,categoriaNombre,unidadMedida,stock\nCable importado,CABLE-CSV,1200,800,Cables de prueba,m,5');
      const imported = await models.Producto.findOne({ where: { codigoBarras: 'CABLE-CSV' } });
      assert.equal((await models.StockSede.findOne({ where: { productoId: imported.id, sedeId: sedes[0].id } })).cantidad, 5);
      assert.equal((await models.StockSede.findOne({ where: { productoId: imported.id, sedeId: sedes[1].id } })).cantidad, 0);
      await csv('nombre,codigoBarras,precioVenta,precioCosto,categoriaNombre,unidadMedida,stock\nCable A,CABLE-A-TEST,9999,99999,Cables de prueba,m,999');
      assert.equal(String((await models.Producto.findByPk(A.id)).precioCosto), '800.00');
      await csv('nombre,codigoBarras,precioVenta,precioCosto,categoriaNombre,unidadMedida,presentacionCosto,costoTotalRollo,metrosPorRollo\nInválido,CSV-BAD,1200,800,Cables de prueba,m,rollo,80000,100', 400);
      assert.equal(await models.Producto.count({ where: { codigoBarras: 'CSV-BAD' } }), 0);
      await models.StockSede.update({ cantidad: 0 }, { where: { productoId: imported.id } });
      await csv('nombre,codigoBarras,precioVenta,precioCosto,categoriaNombre,unidadMedida,presentacionCosto,costoTotalRollo,metrosPorRollo,stock\nCable B importado,CSV-ROLLO-B,1000,,Cables de prueba,m,rollo,183000,305,200');
      const importedRoll = await models.Producto.findOne({ where: { codigoBarras: 'CSV-ROLLO-B' } });
      assert.equal(String(importedRoll.precioCosto), '600.00');
      assert.equal((await models.StockSede.findOne({ where: { productoId: importedRoll.id, sedeId: sedes[0].id } })).cantidad, 200);
      const report = await request(`/inventario/inversion?sedeId=${sedes[0].id}`);
      assert.equal(report.items.find(item => item.productoId === importedRoll.id).inversionTotal, '120000.00');
      await models.StockSede.update({ cantidad: 0 }, { where: { productoId: importedRoll.id } });
    });
    await check('No reinterpreta unidades ni existencias de registros antiguos', async () => {
      const legacy = await models.Producto.create({ nombre: 'Cable antiguo rollo 100 m sin longitud confirmada', codigoBarras: 'LEGACY-METROS', precioCosto: 80000, precioVenta: 100000, unidadMedida: 'und', categoriaId: categoria.id });
      await models.StockSede.create({ productoId: legacy.id, sedeId: sedes[0].id, cantidad: 1 });
      await request(`/productos/${legacy.id}`, 'PUT', { unidadMedida: 'm' }, 400);
      await request(`/productos/${A.id}`, 'PUT', { unidadMedida: 'm', ajusteStock: 35.5, sedeId: sedes[0].id }, 400);
      await legacy.reload(); assert.equal(String(legacy.precioCosto), '80000.00'); assert.equal(legacy.unidadMedida, 'und');
      await models.StockSede.update({ cantidad: 0 }, { where: { productoId: legacy.id } });
      await models.ItemOrdenCompra.create({ ordenCompraId: order.id, productoId: legacy.id, cantidadPedida: 1, precioUnitario: 80000 });
      await request(`/productos/${legacy.id}`, 'PUT', { unidadMedida: 'm' }, 400);
    });
    await require('./metros-browser.cjs')({ backend, base, user, token, proveedor, A, B, roundedOrderId, sedes, checks, output: __dirname });
    fs.writeFileSync(path.join(__dirname, 'metros-results.json'), JSON.stringify({ total: checks.length, checks }, null, 2));
    console.log(`OK: ${checks.length} comprobaciones de metros.`);
  } finally {
    if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
    if (models) await models.sequelize.close();
    if (created) { await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]); await admin.query(`DROP DATABASE "${database}"`); console.log('Base temporal de metros eliminada.'); }
    await admin.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

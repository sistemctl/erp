// Auditoría aislada: ejecuta código real con persistencia simulada y un navegador vacío.
// No inicia el ERP, no conecta a PostgreSQL y no envía notificaciones.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const dep = (name) => require(path.join(root, 'backend/node_modules', name));
const Sequelize = dep('sequelize');
const results = [];

function load(file, models = {}, overrides = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === '../models') return models;
    if (name === 'sequelize') return Sequelize;
    if (name === 'dotenv') return { config() {} };
    if (name === '../utils/sede') return require(path.join(root, 'backend/utils/sede'));
    if (name === '../utils/credito') return require(path.join(root, 'backend/utils/credito'));
    if (name === '../services/email.service') return {
      enviarFacturaPorEmailAuto: async () => {}, enviarNotificacionReparacion: async () => {}
    };
    if (name === '../services/twilio.service') return { enviarNotificacionReparacion() {} };
    if (['path', 'fs', 'crypto', 'jsonwebtoken', 'bcryptjs'].includes(name)) {
      return ['path', 'fs', 'crypto'].includes(name) ? require(name) : dep(name);
    }
    return {};
  };
  const wrapped = vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    console, process: { env: {} }, Buffer, setTimeout, ...globals
  }, { filename: file });
  wrapped(localRequire, module, module.exports);
  return module.exports;
}

const record = (data) => ({ ...data,
  async update(patch) { Object.assign(this, patch); return this; },
  toJSON() { const out = {}; for (const [k, v] of Object.entries(this)) if (typeof v !== 'function') out[k] = v; return out; }
});
function transaction() {
  return { finished: null, LOCK: { UPDATE: 'UPDATE' },
    async commit() { this.finished = 'commit'; },
    async rollback() { this.finished = 'rollback'; }
  };
}
async function invoke(fn, request = {}) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, setHeader() {} };
  let error;
  await fn({ body: {}, params: {}, query: {}, usuario: { userId: 'u', rol: 'cajero', sedeId: 'A' }, ...request }, res, (err) => { error = err; });
  if (error) throw error;
  return res;
}
async function check(id, fn) {
  try { const evidence = await fn(); results.push({ id, reproduced: true, evidence }); }
  catch (err) { results.push({ id, reproduced: false, error: err.message }); process.exitCode = 1; }
}

function saleFixture(configPatch = {}) {
  const tx = transaction();
  const saved = {};
  const caja = record({ id: 'c', totalVentasEfectivo: 0, totalVentasNequi: 0, totalVentasDaviplata: 0,
    totalVentasTarjeta: 0, totalVentasTransferencia: 0, totalesPorMetodo: {} });
  const product = record({ id: 'p', nombre: 'Servicio', activo: true, precioVenta: 10000, precioCosto: 1000,
    esServicio: true, esCombo: false, tieneIVA: false });
  const config = { descuentoMaximoPct: 15, cobrarIvaPos: false, ivaDefecto: 19, ...configPatch };
  const models = {
    sequelize: { transaction: async () => tx },
    Cliente: { findByPk: async () => ({ id: 'client', nombre: 'Cliente' }) },
    ConfiguracionSistema: { findOne: async () => config },
    Producto: { findOne: async () => product, findByPk: async () => product },
    Venta: { findOne: async () => null, count: async () => 0,
      create: async (data) => (saved.venta = record({ id: 'v', ...data })) },
    ItemVenta: { create: async (data) => (saved.item = record({ id: 'i', ...data })) },
    PagoVenta: { create: async () => {} },
    Factura: { count: async () => 0, create: async (data) => (saved.factura = record({ id: 'f', ...data })) }
  };
  const controller = load('backend/controllers/ventas.controller.js', models, {
    '../utils/caja-abierta': { findCajaAbierta: async () => ({ caja }) }
  });
  const body = { clienteId: 'client', subtotal: 10000, descuentoTotal: 0, iva: 0, total: 10000, esCredito: false,
    items: [{ productoId: 'p', cantidad: 1, precioBase: 10000, precioModificado: 10000, descuentoPct: 0 }],
    pagos: [{ metodo: 'tarjeta', monto: 10000 }] };
  return { tx, saved, caja, product, models, controller, body };
}

(async () => {
  await check('A01-venta-sin-pago-y-total-inconsistente', async () => {
    const f = saleFixture();
    const res = await invoke(f.controller.procesarVenta, { body: { ...f.body, total: 1, pagos: [] } });
    assert.equal(res.statusCode, 201);
    assert.equal(f.saved.venta.estado, 'completada');
    assert.equal(f.saved.factura.estado, 'pagada');
    assert.equal(f.saved.venta.total, 1);
    assert.equal(f.saved.item.subtotal, 10000);
    return { status: res.statusCode, totalVenta: f.saved.venta.total, subtotalItem: f.saved.item.subtotal,
      pagoRecibido: 0, estadoFactura: f.saved.factura.estado };
  });
  await check('A02-iva-fijo-con-iva-desactivado', async () => {
    const f = saleFixture();
    await invoke(f.controller.procesarVenta, { body: f.body });
    assert.equal(f.saved.factura.iva, 0);
    assert.equal(f.saved.item.iva, 1900);
    return { ivaFactura: f.saved.factura.iva, ivaItem: f.saved.item.iva,
      reembolsoCalculado: f.saved.item.subtotal + f.saved.item.iva, totalCobrado: 10000 };
  });
  await check('A03-descuento-sin-autorizacion', async () => {
    const f = saleFixture();
    const body = { ...f.body, subtotal: 2000, total: 2000,
      items: [{ ...f.body.items[0], precioModificado: 2000, descuentoPct: 0 }], pagos: [{ metodo: 'tarjeta', monto: 2000 }] };
    const res = await invoke(f.controller.procesarVenta, { body });
    assert.equal(res.statusCode, 201);
    assert.equal(f.saved.item.autorizadoPorAdmin, false);
    return { precioCatalogo: 10000, precioCobrado: 2000, descuentoRealPct: 80, limitePct: 15, autorizado: false };
  });
  await check('A04-transacciones-abiertas-en-rechazos', async () => {
    const cases = [
      ['backend/controllers/compras.controller.js', 'createCompra', {}, {}],
      ['backend/controllers/compras.controller.js', 'registrarPagoCompra', {}, {}],
      ['backend/controllers/series.controller.js', 'createSerie', {}, {}],
      ['backend/controllers/inventario.controller.js', 'trasladarMercancia', {}, {}],
      ['backend/controllers/reparaciones.controller.js', 'updateEstado', { estado: 'invalid' }, {}],
      ['backend/controllers/cartera.controller.js', 'registrarAbonoCartera', {}, { CuentaPorCobrar: { findByPk: async () => null } }]
    ];
    const evidence = [];
    for (const [file, method, body, extra] of cases) {
      const tx = transaction();
      const c = load(file, { sequelize: { transaction: async () => tx }, ...extra });
      const res = await invoke(c[method], { body });
      assert.ok([400, 404].includes(res.statusCode));
      assert.equal(tx.finished, null);
      evidence.push({ method, status: res.statusCode, transactionFinished: tx.finished });
    }
    return evidence;
  });
  await check('A05-devolucion-con-linea-repetida', async () => {
    const tx = transaction();
    const item = record({ id: 'i', productoId: 'p', cantidad: 1, cantidadDevuelta: 0,
      subtotal: 10000, iva: 0, producto: { nombre: 'Producto', esServicio: false } });
    const stock = record({ cantidad: 0 });
    const caja = record({ totalVentasTarjeta: 10000 });
    const venta = record({ id: 'v', numeroVenta: 'VT-1', sedeId: 'A', estado: 'completada',
      items: [item], pagos: [{ metodo: 'tarjeta' }] });
    venta.reload = async () => venta;
    const models = { sequelize: { transaction: async () => tx }, Venta: { findByPk: async () => venta },
      DevolucionVenta: { count: async () => 0, create: async (data) => record({ id: 'd', ...data }), findByPk: async () => ({}) },
      ItemDevolucion: { create: async () => {} }, StockSede: { findOne: async () => stock },
      MovimientoInventario: { create: async () => {} } };
    const c = load('backend/controllers/ventas.controller.js', models, {
      '../utils/caja-abierta': { findCajaAbierta: async () => ({ caja }) }
    });
    const res = await invoke(c.crearDevolucionVenta, { params: { id: 'v' }, body: {
      motivo: 'Auditoría', metodoReembolso: 'tarjeta',
      items: [{ itemVentaId: 'i', cantidad: 1 }, { itemVentaId: 'i', cantidad: 1 }]
    } });
    assert.equal(res.statusCode, 201);
    assert.equal(item.cantidadDevuelta, 2);
    assert.equal(stock.cantidad, 2);
    return { vendidas: 1, devueltas: item.cantidadDevuelta, stockReintegrado: stock.cantidad };
  });
  await check('A06-entrega-reparacion-repetida-cobra-dos-veces', async () => {
    const tx = transaction();
    const orden = record({ id: 'r', sedeId: 'A', estado: 'entregado', totalCobrado: 10000 });
    const caja = record({ totalVentasEfectivo: 10000 });
    const c = load('backend/controllers/reparaciones.controller.js', {
      sequelize: { transaction: async () => tx }, OrdenReparacion: { findByPk: async () => orden },
      Factura: { findOne: async () => ({ id: 'existing' }) }
    }, { '../utils/caja-abierta': { findCajaAbierta: async () => ({ caja }) } });
    await invoke(c.updateEstado, { params: { id: 'r' }, body: { estado: 'entregado', metodoPago: 'efectivo' } });
    assert.equal(caja.totalVentasEfectivo, 20000);
    return { estadoPrevio: 'entregado', facturaExistente: true, cajaAntes: 10000, cajaDespues: 20000 };
  });
  await check('A07-reparacion-de-otra-sede-visible', async () => {
    const c = load('backend/controllers/reparaciones.controller.js', {
      OrdenReparacion: { findByPk: async () => ({ id: 'r', sedeId: 'B' }) }
    });
    const res = await invoke(c.getOrdenById, { params: { id: 'r' }, usuario: { userId: 'tech', rol: 'tecnico', sedeId: 'A' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sedeId, 'B');
    return { rol: 'tecnico', sedeUsuario: 'A', sedeRegistro: res.body.sedeId, status: res.statusCode };
  });
  await check('A08-traslado-no-mueve-series', async () => {
    const tx = transaction();
    const origin = record({ cantidad: 1 }), dest = record({ cantidad: 0 });
    let seriesCalls = 0;
    const c = load('backend/controllers/inventario.controller.js', {
      sequelize: { transaction: async () => tx, Sequelize },
      Producto: { findByPk: async () => ({ id: 'p', tieneNumeroSerie: true, esCombo: false }) },
      StockSede: { findOne: async ({ where }) => where.sedeId === 'A' ? origin : dest },
      NumeroSerie: { update: async () => { seriesCalls++; } }, MovimientoInventario: { create: async () => {} }
    });
    const res = await invoke(c.trasladarMercancia, { body: { productoId: 'p', sedeOrigenId: 'A', sedeDestinoId: 'B', cantidad: 1 } });
    assert.equal(res.statusCode, 200);
    assert.equal(dest.cantidad, 1);
    assert.equal(seriesCalls, 0);
    return { stockOrigen: origin.cantidad, stockDestino: dest.cantidad, actualizacionesDeSeries: seriesCalls };
  });
  await check('A09-anular-combo-no-reintegra-componentes', async () => {
    const tx = transaction();
    const comboStock = record({ cantidad: 0 });
    const queried = [];
    const factura = record({ id: 'f', ventaId: 'v', sedeId: 'A', numeroFactura: 'FE-1' });
    const venta = record({ id: 'v', devolucionEstado: 'ninguna', pagos: [],
      items: [{ productoId: 'combo', cantidad: 1, producto: { esCombo: true, tieneNumeroSerie: false } }] });
    const c = load('backend/controllers/facturas.controller.js', {
      sequelize: { transaction: async () => tx }, Factura: { findByPk: async () => factura },
      Venta: { findByPk: async () => venta }, StockSede: { findOne: async ({ where }) => { queried.push(where.productoId); return comboStock; } },
      CuentaPorCobrar: { findOne: async () => null }, MovimientoInventario: { create: async () => {} }
    }, { '../utils/caja-abierta': { findCajaAbierta: async () => ({ caja: null }) } });
    await invoke(c.anularFactura, { params: { id: 'f' } });
    assert.deepEqual(queried, ['combo']);
    assert.equal(comboStock.cantidad, 1);
    return { productosReintegrados: queried, stockCombo: comboStock.cantidad, componentesReintegrados: 0 };
  });
  await check('A10-backup-omite-password-y-tablas', async () => {
    const models = { Sequelize, Usuario: { findAll: async () => [{ id: 'u', nombre: 'Usuario', email: 'audit@example.invalid',
      rol: 'cajero', password: 'hash-fixture' }] }, ComboComponente: { findAll: async () => [{ id: 'component' }] },
      ItemVentaComponente: { findAll: async () => [{ id: 'snapshot' }] }, DevolucionVenta: { findAll: async () => [{ id: 'd' }] } };
    const c = load('backend/controllers/config.controller.js', models);
    const res = await invoke(c.exportarBackup);
    assert.equal(res.body.Usuario[0].password, undefined);
    assert.equal(res.body.ComboComponente, undefined);
    assert.equal(res.body.ItemVentaComponente, undefined);
    assert.equal(res.body.DevolucionVenta, undefined);
    const isolatedDb = new Sequelize.Sequelize('audit', 'audit', '', { dialect: 'postgres', logging: false });
    const User = load('backend/models/Usuario.js', {}, { '../config/database': isolatedDb });
    await assert.rejects(User.build(res.body.Usuario[0]).validate(), /password cannot be null/);
    await isolatedDb.close();
    return { passwordExportado: false, passwordObligatorio: true,
      tablasOmitidas: ['ComboComponente', 'ItemVentaComponente', 'DevolucionVenta', 'ItemDevolucion'] };
  });
  await check('A11-token-sin-consultar-usuario-activo', async () => {
    const jwt = dep('jsonwebtoken');
    const secret = 'audit-fixture-secret-not-used-by-the-project';
    let userLookups = 0;
    const middleware = load('backend/middleware/auth.middleware.js', {
      Usuario: { findByPk: async () => { userLookups++; return { activo: false }; } }
    }, { '../utils/token-denylist': { isDenied: () => false } }, { process: { env: { JWT_SECRET: secret } } });
    const token = jwt.sign({ userId: 'disabled', rol: 'superadmin', sedeId: 'A' }, secret, { expiresIn: '1m' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    let allowed = false;
    middleware(req, {}, () => { allowed = true; });
    assert.equal(allowed, true);
    assert.equal(userLookups, 0);
    return { peticionAutorizada: allowed, consultasAUsuario: userLookups, rolAceptado: req.usuario.rol };
  });
  await check('A12-pin-401-cierra-sesion-en-frontend', async () => {
    const source = fs.readFileSync(path.join(root, 'frontend/assets/js/api.js'), 'utf8').replace('export async function', 'async function');
    const store = new Map([['token', 'valid-fixture'], ['usuario', '{}']]);
    const window = { location: { hash: '#/pos' } };
    const apiFetch = vm.runInNewContext(`${source}\napiFetch`, { console: { error() {} }, FormData,
      localStorage: { getItem: (k) => store.get(k), removeItem: (k) => store.delete(k) }, window,
      fetch: async () => ({ status: 401, json: async () => ({ error: 'PIN de Administrador incorrecto.' }) }) });
    await assert.rejects(apiFetch('/ventas', { method: 'POST' }), /PIN/);
    assert.equal(store.has('token'), false);
    assert.equal(window.location.hash, '#/login');
    return { tokenEliminado: true, redireccion: window.location.hash };
  });
  await check('A13-xss-clientes-en-navegador', async () => {
    const { chromium } = dep('@playwright/test');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route('**/*', (route) => route.abort());
      await page.setContent('<div id="app"></div>');
      const source = fs.readFileSync(path.join(root, 'frontend/assets/js/modules/clientes.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
      await page.evaluate(async (code) => {
        window.apiFetch = async () => [{ id: 'c', nombre: '<img src="invalid-audit" onerror="window.auditXss=true">' }];
        window.getUsuario = () => ({ rol: 'cajero' });
        window.erpHeader = (o) => o.actionsHtml;
        window.erpAction = () => '';
        window.erpActions = (s) => s;
        window.bootstrap = { Modal: class { show() {} hide() {} } };
        const init = new Function(`${code}\nreturn initClientes;`)();
        await init(document.getElementById('app'));
      }, source);
      await page.waitForFunction(() => window.auditXss === true, undefined, { timeout: 3000 });
      assert.equal(await page.evaluate(() => window.auditXss), true);
      return { moduloReal: 'clientes.js', javascriptInyectadoEjecutado: true, traficoExterno: 'bloqueado' };
    } finally { await browser.close(); }
  });
  await check('A14-caja-pierde-una-venta-concurrente', async () => {
    const a = saleFixture(), b = saleFixture();
    const persisted = {};
    for (const f of [a, b]) {
      f.caja.update = async (patch) => { Object.assign(persisted, patch); return f.caja; };
    }
    await Promise.all([
      invoke(a.controller.procesarVenta, { body: a.body }),
      invoke(b.controller.procesarVenta, { body: b.body })
    ]);
    assert.equal(a.tx.finished, 'commit');
    assert.equal(b.tx.finished, 'commit');
    assert.equal(persisted.totalVentasTarjeta, 10000);
    return { ventasConfirmadas: 2, pagosTotales: 20000, totalPersistidoCaja: persisted.totalVentasTarjeta,
      escenario: 'Dos lecturas del mismo saldo antes de sus actualizaciones' };
  });
  await check('A15-devolucion-restaura-serial-de-otra-venta', async () => {
    const tx = transaction();
    const oldSerial = record({ id: 'serial-old', serie: 'IMEI-VENTA-ANTIGUA', productoId: 'p', sedeId: 'A',
      clienteId: 'client', estado: 'vendido', updatedAt: new Date('2026-01-01') });
    const latestSerial = record({ id: 'serial-new', serie: 'IMEI-OTRA-VENTA', productoId: 'p', sedeId: 'A',
      clienteId: 'client', estado: 'vendido', updatedAt: new Date('2026-02-01') });
    const item = record({ id: 'i', productoId: 'p', cantidad: 1, cantidadDevuelta: 0, subtotal: 10000, iva: 0,
      producto: { nombre: 'Teléfono', esServicio: false, tieneNumeroSerie: true } });
    const venta = record({ id: 'v-old', numeroVenta: 'VT-OLD', sedeId: 'A', clienteId: 'client', estado: 'completada',
      items: [item], pagos: [{ metodo: 'tarjeta' }] });
    venta.reload = async () => venta;
    const stock = record({ cantidad: 0 }), caja = record({ totalVentasTarjeta: 10000 });
    const c = load('backend/controllers/ventas.controller.js', {
      sequelize: { transaction: async () => tx }, Venta: { findByPk: async () => venta },
      DevolucionVenta: { count: async () => 0, create: async (data) => record({ id: 'd', ...data }), findByPk: async () => ({}) },
      ItemDevolucion: { create: async () => {} }, StockSede: { findOne: async () => stock },
      MovimientoInventario: { create: async () => {} }, NumeroSerie: {
        findAll: async ({ where, limit }) => [oldSerial, latestSerial]
          .filter((s) => Object.entries(where).every(([k, value]) => s[k] === value))
          .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
      }
    }, { '../utils/caja-abierta': { findCajaAbierta: async () => ({ caja }) } });
    await invoke(c.crearDevolucionVenta, { params: { id: 'v-old' }, body: {
      motivo: 'Devolver venta antigua', metodoReembolso: 'tarjeta', items: [{ itemVentaId: 'i', cantidad: 1 }]
    } });
    assert.equal(oldSerial.estado, 'vendido');
    assert.equal(latestSerial.estado, 'en_stock');
    return { ventaDevuelta: 'v-old', serialDeVentaAntigua: oldSerial.estado, serialDeOtraVenta: latestSerial.estado };
  });
  const output = { isolation: 'Sin PostgreSQL ni API real', checks: results.length, results };
  fs.writeFileSync(path.join(__dirname, 'reproduction-results.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
})();

// Regresiones de la auditoría 2026-11 (Fase 3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, models, extra = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, exports: module.exports, console, Date, Map, Promise,
    require: id => {
      if (id === '../models') return models;
      if (id in extra) return extra[id];
      if (id === 'sequelize') return { Op: { ne: Symbol('ne'), in: Symbol('in'), lt: Symbol('lt'), gt: Symbol('gt'), lte: Symbol('lte') } };
      if (id.startsWith('../utils/')) return require(path.join(__dirname, '..', path.dirname(file), id));
      return {};
    }
  });
  return module.exports;
}
const res = () => ({ status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } });
const counter = n => ({ async count() { return n; } });

test('no se elimina un cliente con ventas o facturas', async () => {
  let destroyed = false;
  const cliente = { id: 'c', toJSON() { return {}; }, async destroy() { destroyed = true; } };
  const models = {
    Cliente: { async findByPk() { return cliente; } },
    Venta: counter(2), Factura: counter(2), CuentaPorCobrar: counter(0), Cotizacion: counter(0),
    OrdenReparacion: counter(0), OrdenInstalacion: counter(0), ReclamoGarantia: counter(0), TradeIn: counter(0), NumeroSerie: counter(0)
  };
  const controller = load('controllers/clientes.controller.js', models);
  const r = res();
  await controller.deleteCliente({ params: { id: 'c' }, usuario: { userId: 'u', rol: 'admin' } }, r, e => { throw e; });
  assert.equal(r.code, 409);
  assert.match(r.body.error, /2 ventas, 2 facturas/);
  assert.equal(destroyed, false);
});

test('un cliente sin documentos sí se elimina', async () => {
  let destroyed = false;
  const cliente = { id: 'c', toJSON() { return {}; }, async destroy() { destroyed = true; } };
  const zero = counter(0);
  const models = {
    Cliente: { async findByPk() { return cliente; } },
    Venta: zero, Factura: zero, CuentaPorCobrar: zero, Cotizacion: zero,
    OrdenReparacion: zero, OrdenInstalacion: zero, ReclamoGarantia: zero, TradeIn: zero, NumeroSerie: zero
  };
  const controller = load('controllers/clientes.controller.js', models);
  const r = res();
  await controller.deleteCliente({ params: { id: 'c' }, usuario: { userId: 'u', rol: 'admin' } }, r, e => { throw e; });
  assert.equal(destroyed, true);
});

test('no se elimina un proveedor con órdenes de compra', async () => {
  let destroyed = false;
  const proveedor = { id: 'p', toJSON() { return {}; }, async destroy() { destroyed = true; } };
  const models = { Proveedor: { async findByPk() { return proveedor; } }, OrdenCompra: counter(3) };
  const controller = load('controllers/proveedores.controller.js', models);
  const r = res();
  await controller.deleteProveedor({ params: { id: 'p' }, usuario: { userId: 'u', rol: 'admin' } }, r, e => { throw e; });
  assert.equal(r.code, 409);
  assert.equal(destroyed, false);
});

test('el job de cartera sigue con las demás cuentas si una falla', async () => {
  const updated = [];
  const cuentas = ['a', 'b', 'c'].map(id => ({
    id, estado: 'al_dia', facturaId: `f-${id}`,
    async update(v) { if (id === 'b') throw new Error('fallo simulado'); Object.assign(this, v); updated.push(id); }
  }));
  const models = {
    CuentaPorCobrar: { async findAll() { return cuentas; } },
    Factura: { async findByPk() { return null; } },
    Cliente: {}, ConfiguracionSistema: {},
    sequelize: { async transaction(fn) { return fn({}); } }
  };
  const job = load('jobs/cartera.job.js', models, { '../services/email.service': {} });
  const originalError = console.error; console.error = () => {};
  try {
    const result = await job.actualizarEstadosVencidos();
    assert.deepEqual(updated, ['a', 'c']);
    assert.equal(result.fallidas, 1);
  } finally { console.error = originalError; }
});

// --- Fase 4 ---
test('fotos rechazadas no quedan huérfanas en disco', async () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-'));
  const file = path.join(dir, 'foto.jpg');
  fs.writeFileSync(file, 'x');
  const models = { OrdenReparacion: { async findByPk() { return null; } }, sequelize: {} };
  const controller = load('controllers/reparaciones.controller.js', models, { fs, path });
  const r = res();
  await controller.uploadFotos({ params: { id: 'x' }, body: { momento: 'recepcion' }, files: [{ path: file, filename: 'foto.jpg' }], usuario: { userId: 'u', rol: 'admin' } }, r, e => { throw e; });
  assert.equal(r.code, 404);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(fs.existsSync(file), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compra por rollo: el total de la orden es el costo real del rollo, no precio/m redondeado × metros', () => {
  const { normalizeCompraUnidad, totalLineaCompraCentavos } = require('../utils/compra-unidad');
  const input = { presentacion: 'rollo', costoTotalRollo: '100000', metrosPorRollo: 300, cantidadRollos: 2 };
  const normalized = normalizeCompraUnidad(input, 'm');
  assert.equal(normalized.precioUnitario, '333.33');
  assert.equal(normalized.cantidadPedida, 600);
  assert.equal(totalLineaCompraCentavos(input, normalized), 20000000n); // $200.000,00 exactos
  const porMetro = { presentacion: 'unidad', cantidadPedida: 600, precioUnitario: '333.33' };
  assert.equal(totalLineaCompraCentavos(porMetro, normalizeCompraUnidad(porMetro, 'm')), 19999800n);
});

test('ningún módulo redefine escapeHtml si importa el compartido (evita "before initialization")', () => {
  const dir = path.join(__dirname, '../../frontend/assets/js/modules');
  const src = fs.existsSync(dir) ? dir : path.join(__dirname, '../../../frontend/assets/js/modules');
  const conflictos = fs.readdirSync(src).filter(f => f.endsWith('.ts')).filter(f => {
    const s = fs.readFileSync(path.join(src, f), 'utf8');
    return /import \{[^}]*\bescapeHtml\b[^}]*\} from '\.\.\/utils\/html\.js'/.test(s) && /\b(const|let|function)\s+escapeHtml\b/.test(s.replace(/^\s{6,}const escapeHtml.*$/gm, ''));
  });
  assert.deepEqual(conflictos, [], `Estos módulos importan escapeHtml y además lo redefinen: ${conflictos.join(', ')}`);
});

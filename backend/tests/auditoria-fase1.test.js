// Regresiones de la auditoría 2026-11 (Fase 1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FRONTEND_ROOT } = require('../utils/runtime-paths');

function loadController(file, models) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers', file), 'utf8'), {
    module, exports: module.exports, console,
    require: id => {
      if (id === '../models') return models;
      if (id === 'sequelize') return { Op: { ne: Symbol('ne'), in: Symbol('in') } };
      if (id.startsWith('../utils/')) return require(id);
      return {};
    }
  });
  return module.exports;
}

function tx() {
  return { LOCK: { UPDATE: 'UPDATE' }, async commit() { this.finished = 'commit'; }, async rollback() { this.finished = 'rollback'; } };
}

const row = data => ({ ...data, async update(values) { Object.assign(this, values); return this; }, toJSON() { return { ...this }; } });

function seriesFixture({ stockInicial, serialesExistentes }) {
  const movements = [];
  const stock = stockInicial === null ? null : row({ productoId: 'p', sedeId: 's', cantidad: stockInicial });
  const created = [];
  let enStock = serialesExistentes;
  const models = {
    sequelize: { async transaction() { return tx(); } },
    Producto: { async findByPk() { return { id: 'p', esCombo: false }; } },
    NumeroSerie: {
      async findAll() { return []; },
      async findOne() { return null; },
      async create(v) { enStock += 1; created.push(v); return row({ id: 'n1', ...v }); },
      async bulkCreate(list) { enStock += list.length; created.push(...list); return list; },
      async count() { return enStock; }
    },
    StockSede: {
      async findOne() { return stock; },
      async create(v) { models.created = v; return row(v); }
    },
    MovimientoInventario: { async create(v) { movements.push(v); } }
  };
  const controller = loadController('series.controller.js', models);
  const req = { usuario: { userId: 'admin', rol: 'admin', sedeId: 's' }, logAudit: async () => {} };
  const res = { status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } };
  return { controller, req, res, stock, movements, models };
}

test('registrar seriales de unidades ya contadas no duplica el stock', async () => {
  const f = seriesFixture({ stockInicial: 10, serialesExistentes: 0 });
  f.req.body = { productoId: 'p', sedeId: 's', series: Array.from({ length: 10 }, (_, i) => `IMEI${i}`) };
  let error;
  await f.controller.createSeriesBulk(f.req, f.res, e => { error = e; });
  assert.equal(error, undefined);
  assert.equal(f.res.code, 201);
  assert.equal(f.stock.cantidad, 10, 'el stock debe seguir en 10');
  assert.equal(f.movements.length, 0, 'no debe haber movimiento de entrada');
  assert.equal(f.res.body.asignadosAStockExistente, 10);
});

test('registrar seriales nuevos sí suma stock por la diferencia', async () => {
  const f = seriesFixture({ stockInicial: 10, serialesExistentes: 8 });
  f.req.body = { productoId: 'p', sedeId: 's', series: ['A', 'B', 'C', 'D', 'E'] };
  await f.controller.createSeriesBulk(f.req, f.res, e => { throw e; });
  // 8 + 5 = 13 seriales en stock con 10 unidades contadas: entran 3, se asignan 2.
  assert.equal(f.stock.cantidad, 13);
  assert.equal(f.movements[0].cantidad, 3);
  assert.equal(f.res.body.entradasStock, 3);
});

test('registrar un serial cuando no hay stock crea la fila con 1 unidad', async () => {
  const f = seriesFixture({ stockInicial: null, serialesExistentes: 0 });
  f.req.body = { productoId: 'p', sedeId: 's', serie: 'X1' };
  await f.controller.createSerie(f.req, f.res, e => { throw e; });
  assert.equal(f.res.code, 201);
  assert.equal(f.models.created.cantidad, 1);
  assert.equal(f.movements[0].cantidad, 1);
});

test('una instalación no se puede marcar entregada con un PUT', async () => {
  const transaction = tx();
  const orden = row({ id: 'o', sedeId: 's', estado: 'en_proceso', materiales: [] });
  const models = {
    sequelize: { async transaction() { return transaction; } },
    OrdenInstalacion: { async findByPk() { return orden; } }
  };
  const controller = loadController('instalaciones.controller.js', models);
  const req = { params: { id: 'o' }, body: { estado: 'entregada' }, usuario: { userId: 'u', rol: 'admin', sedeId: 's' } };
  const res = { status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } };
  await controller.updateOrden(req, res, e => { throw e; });
  assert.equal(res.code, 400);
  assert.equal(orden.estado, 'en_proceso');
  assert.equal(transaction.finished, 'rollback');
});

test('guardar la configuración ya no reescribe facturas de taller emitidas', () => {
  const src = fs.readFileSync(path.join(__dirname, '../controllers/config.controller.js'), 'utf8');
  assert.doesNotMatch(src, /Factura\.update\(/);
});

test('escapeHtml y safeHref neutralizan HTML y esquemas peligrosos', () => {
  const source = fs.readFileSync(path.join(FRONTEND_ROOT, 'assets/js/utils/html.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export (async )?function/g, '$1function');
  const { escapeHtml, safeHref } = vm.runInNewContext(`${source}\n({ escapeHtml, safeHref })`, {});
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml(`O'Brien & Cía`), 'O&#39;Brien &amp; Cía');
  assert.equal(escapeHtml(null), '');
  assert.equal(safeHref('javascript:alert(1)'), '#');
  assert.equal(safeHref('#/ventas?id=1'), '#/ventas?id=1');
  assert.equal(safeHref('//evil.example'), '#');
});

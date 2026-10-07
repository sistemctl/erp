const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sede = require('../utils/sede');
const { httpError } = require('../utils/http-error');

function fixture() {
  const queries = [], movements = [], audits = [], transactions = [];
  const row = data => ({ ...data, async update(values) { Object.assign(this, values); }, toJSON() { return { ...this }; } });
  const orden = row({ id: 'order', sedeId: 'A', numeroOrden: 'OR-TEST', estado: 'diagnostico', costoRepuestos: 80, totalCobrado: 180 });
  const repuesto = row({ id: 'part', ordenId: 'order', productoId: 'product', cantidad: 2, costoUnitario: 25 });
  repuesto.destroy = async () => { repuesto.deleted = true; };
  const stock = row({ cantidad: 5 });
  const rentabilidad = row({ costoReal: 80, totalCobrado: 180, margen: 100 });
  let factura = null;
  const models = {
    sequelize: { async transaction() { const tx = { LOCK: { UPDATE: 'UPDATE' }, async commit() { this.finished = 'commit'; }, async rollback() { this.finished = 'rollback'; } }; transactions.push(tx); return tx; } },
    OrdenReparacion: { async findByPk(id, opts) { queries.push(opts); return id === orden.id ? orden : null; } },
    RepuestoOrden: { async findOne(opts) { queries.push(opts); return !repuesto.deleted && opts.where.id === repuesto.id && opts.where.ordenId === repuesto.ordenId ? repuesto : null; } },
    StockSede: { async findOne(opts) { queries.push(opts); return stock; } },
    RentabilidadReparacion: { async findOne() { return rentabilidad; } },
    Factura: { async findOne() { return factura; } },
    MovimientoInventario: { async create(value) { movements.push(value); } }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/reparaciones.controller.js'), 'utf8'), {
    module, exports: module.exports,
    require: id => id === '../models' ? models : id === '../utils/sede' ? sede : id === '../utils/http-error' ? { httpError }
      : id === 'sequelize' ? { Op: { ne: Symbol('ne') } } : {}
  });
  const req = { params: { id: 'order', repuestoId: 'part' }, usuario: { userId: 'tech', rol: 'tecnico', sedeId: 'A' }, logAudit: async value => audits.push(value) };
  const res = { json(value) { this.body = value; return this; } };
  return { controller: module.exports, req, res, orden, repuesto, stock, rentabilidad, movements, queries, audits, transactions,
    setFactura(value) { factura = value; }, async remove() { let error; await module.exports.removeRepuesto(req, res, e => { error = e; }); return error; },
    async update(cost) { req.body = { costoUnitario: cost }; let error; await module.exports.updateRepuesto(req, res, e => { error = e; }); return error; } };
}

test('retirar devuelve toda la cantidad, usa el costo original y actualiza totales y auditoría', async () => {
  const f = fixture();
  assert.equal(await f.remove(), undefined);
  assert.equal(f.stock.cantidad, 7);
  assert.equal(f.orden.costoRepuestos, 30);
  assert.equal(f.orden.totalCobrado, 130);
  assert.equal(f.rentabilidad.costoReal, 30);
  assert.equal(f.rentabilidad.margen, 100);
  assert.equal(f.movements[0].tipo, 'entrada');
  assert.equal(f.movements[0].cantidad, 2);
  assert.equal(f.movements[0].sedeId, 'A');
  assert.ok(f.repuesto.deleted);
  assert.ok(f.queries.every(q => q.lock === 'UPDATE'));
  assert.equal(f.transactions[0].finished, 'commit');
  assert.equal(f.audits[0].valorNuevo.cantidadDevuelta, 2);
  assert.equal(f.audits[0].valorAnterior.costoUnitario, 25);
});

test('repuestos con costo cero también pueden retirarse', async () => {
  const f = fixture(); f.repuesto.costoUnitario = 0;
  assert.equal(await f.remove(), undefined);
  assert.equal(f.stock.cantidad, 7);
  assert.equal(f.orden.totalCobrado, 180);
});

test('retirar dos veces no duplica stock', async () => {
  const f = fixture(); await f.remove();
  assert.equal((await f.remove()).status, 404);
  assert.equal(f.stock.cantidad, 7);
  assert.equal(f.movements.length, 1);
  assert.equal(f.transactions[1].finished, 'rollback');
});

test('bloquea otra sede, un repuesto de otra orden, órdenes cerradas y facturadas', async () => {
  const changes = [f => { f.req.usuario.sedeId = 'B'; }, f => { f.repuesto.ordenId = 'other'; },
    f => { f.orden.estado = 'entregado'; }, f => { f.orden.estado = 'cancelado'; }, f => f.setFactura({ id: 'invoice' })];
  for (const change of changes) {
    const f = fixture(); change(f);
    assert.ok((await f.remove()).status >= 400);
    assert.equal(f.stock.cantidad, 5);
    assert.equal(f.movements.length, 0);
    assert.equal(f.transactions[0].finished, 'rollback');
  }
});

test('rechaza importes inconsistentes antes de devolver inventario', async () => {
  const f = fixture(); f.orden.totalCobrado = 1;
  assert.equal((await f.remove()).status, 409);
  assert.equal(f.stock.cantidad, 5);
  assert.equal(f.transactions[0].finished, 'rollback');
});

test('editar costo ajusta totales y rentabilidad sin mover inventario', async () => {
  const f = fixture();
  assert.equal(await f.update('40.25'), undefined);
  assert.equal(f.repuesto.costoUnitario, 40.25);
  assert.equal(f.orden.costoRepuestos, 110.5);
  assert.equal(f.orden.totalCobrado, 210.5);
  assert.equal(f.rentabilidad.costoReal, 110.5);
  assert.equal(f.rentabilidad.totalCobrado, 210.5);
  assert.equal(f.rentabilidad.margen, 100);
  assert.equal(f.stock.cantidad, 5);
  assert.equal(f.movements.length, 0);
  assert.equal(f.audits[0].valorAnterior.costoUnitario, 25);
  assert.equal(f.audits[0].valorNuevo.costoUnitario, 40.25);
  assert.ok(f.queries.every(q => q.lock === 'UPDATE'));
  assert.equal(await f.update('40.25'), undefined);
  assert.equal(f.orden.totalCobrado, 210.5);
  assert.equal(await f.remove(), undefined);
  assert.equal(f.orden.totalCobrado, 130);
});

test('editar acepta cero, disminuciones y redondea centavos', async () => {
  const f = fixture();
  assert.equal(await f.update(10.126), undefined);
  assert.equal(f.repuesto.costoUnitario, 10.13);
  assert.equal(f.orden.totalCobrado, 150.26);
  assert.equal(await f.update(0), undefined);
  assert.equal(f.orden.totalCobrado, 130);
});

test('editar rechaza costos inválidos sin modificar la orden', async () => {
  for (const cost of [null, undefined, '', ' ', true, [], {}, -1, 'abc', Infinity, 10000000000000]) {
    const f = fixture();
    assert.equal((await f.update(cost)).status, 400);
    assert.equal(f.repuesto.costoUnitario, 25);
    assert.equal(f.orden.totalCobrado, 180);
    assert.equal(f.transactions[0].finished, 'rollback');
  }
});

test('editar respeta sede, pertenencia, cierre, facturación y coherencia de totales', async () => {
  const changes = [f => { f.req.usuario.sedeId = 'B'; }, f => { f.repuesto.ordenId = 'other'; },
    f => { f.orden.estado = 'entregado'; }, f => { f.orden.estado = 'cancelado'; },
    f => f.setFactura({ id: 'invoice' }), f => { f.orden.totalCobrado = 1; }];
  for (const change of changes) {
    const f = fixture(); change(f);
    assert.ok((await f.update(0)).status >= 400);
    assert.equal(f.repuesto.costoUnitario, 25);
    assert.equal(f.transactions[0].finished, 'rollback');
    assert.equal(f.audits.length, 0);
  }
});

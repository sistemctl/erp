// Regresiones de la auditoría 2026-11 (Fase 2).
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
      if (id === 'sequelize') return { Op: { ne: Symbol('ne'), in: Symbol('in'), lt: Symbol('lt') } };
      if (id.startsWith('../utils/') || id.startsWith('./')) return require(path.join(__dirname, '..', path.dirname(file), id));
      return {};
    }
  });
  return module.exports;
}
const tx = () => ({ LOCK: { UPDATE: 'UPDATE' }, async commit() { this.finished = 'commit'; }, async rollback() { this.finished = 'rollback'; } });
const row = data => ({ ...data, async update(v) { Object.assign(this, v); return this; }, async destroy() { this.destroyed = true; }, toJSON() { return { ...this }; } });

test('rango de fechas de reportes usa el día de Bogotá, no UTC', () => {
  const { rangoBogota } = require('../utils/rango-bogota');
  const { startDate, endDate } = rangoBogota('2026-11-14', '2026-11-14');
  assert.equal(startDate.toISOString(), '2026-11-14T05:00:00.000Z');
  assert.equal(endDate.toISOString(), '2026-11-15T04:59:59.999Z');
  assert.throws(() => rangoBogota('14/11/2026', undefined), /no es válida/);
});

test('PIN de administrador: se bloquea tras 5 intentos fallidos', async () => {
  const admin = { id: 'adm', async compararPassword(p) { return p === 'secreto'; } };
  const models = { Usuario: { async findAll() { return [admin]; } } };
  const pin = load('utils/admin-pin.js', models);
  pin._resetPinAdminIntentos();
  assert.equal(await pin.verificarPinAdmin('secreto', 'cajero1'), 'adm');
  for (let i = 0; i < 5; i++) {
    await assert.rejects(pin.verificarPinAdmin('malo', 'cajero1'), e => e.status === 403);
  }
  // Bloqueado aunque ahora acierte
  await assert.rejects(pin.verificarPinAdmin('secreto', 'cajero1'), e => e.status === 429);
  // Otro usuario no queda afectado
  assert.equal(await pin.verificarPinAdmin('secreto', 'cajero2'), 'adm');
});

test('devolver mercancía al proveedor reduce total y saldo por pagar', async () => {
  const item = row({ productoId: 'p', cantidadPedida: 10, cantidadRecibida: 10, precioUnitario: '1000.00' });
  const orden = row({ id: 'oc', sedeId: 's', estado: 'recibida', total: '10000.00', saldoPendiente: '4000.00', estadoPago: 'abono_parcial', items: [item] });
  const stock = row({ cantidad: 10 });
  const movements = [];
  const models = {
    sequelize: { async transaction() { return tx(); } },
    OrdenCompra: { async findByPk() { return orden; } },
    ItemOrdenCompra: { async findAll() { return [item]; } },
    Producto: { async findByPk() { return { id: 'p', nombre: 'Cable', tieneNumeroSerie: false }; } },
    StockSede: { async findOne() { return stock; } },
    MovimientoInventario: { async create(v) { movements.push(v); } }
  };
  const controller = load('controllers/compras.controller.js', models);
  const req = { params: { id: 'oc' }, body: { items: [{ productoId: 'p', cantidadDevolver: 3 }] }, usuario: { userId: 'u', rol: 'admin', sedeId: 's' } };
  const res = { status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } };
  await controller.devolverMercancia(req, res, e => { throw e; });
  // Total 10.000 - 3.000 devueltos = 7.000; ya se pagaron 6.000 → saldo 1.000
  assert.equal(orden.total, '7000.00');
  assert.equal(orden.saldoPendiente, '1000.00');
  assert.equal(orden.estadoPago, 'abono_parcial');
  assert.equal(stock.cantidad, 7);
  assert.equal(item.cantidadPedida, 7);
  assert.equal(orden.estado, 'recibida');
});

test('devolver al proveedor más de lo ya pagado deja saldo a favor y la orden pagada', async () => {
  const item = row({ productoId: 'p', cantidadPedida: 10, cantidadRecibida: 10, precioUnitario: '1000.00' });
  const orden = row({ id: 'oc', sedeId: 's', estado: 'recibida', total: '10000.00', saldoPendiente: '0.00', estadoPago: 'pagado', items: [item] });
  const models = {
    sequelize: { async transaction() { return tx(); } },
    OrdenCompra: { async findByPk() { return orden; } },
    ItemOrdenCompra: { async findAll() { return [item]; } },
    Producto: { async findByPk() { return { id: 'p', nombre: 'Cable', tieneNumeroSerie: false }; } },
    StockSede: { async findOne() { return row({ cantidad: 10 }); } },
    MovimientoInventario: { async create() {} }
  };
  const controller = load('controllers/compras.controller.js', models);
  const req = { params: { id: 'oc' }, body: { items: [{ productoId: 'p', cantidadDevolver: 2 }] }, usuario: { userId: 'u', rol: 'admin', sedeId: 's' } };
  const res = { status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } };
  await controller.devolverMercancia(req, res, e => { throw e; });
  assert.equal(orden.saldoPendiente, '0.00');
  assert.equal(orden.estadoPago, 'pagado');
  assert.equal(res.body.saldoAFavor, '2000.00');
});

test('devolver al proveedor sin stock suficiente responde 409', async () => {
  const item = row({ productoId: 'p', cantidadPedida: 10, cantidadRecibida: 10, precioUnitario: '1000.00' });
  const orden = row({ id: 'oc', sedeId: 's', estado: 'recibida', total: '10000.00', saldoPendiente: '10000.00', items: [item] });
  const models = {
    sequelize: { async transaction() { return tx(); } },
    OrdenCompra: { async findByPk() { return orden; } },
    Producto: { async findByPk() { return { id: 'p', nombre: 'Cable', tieneNumeroSerie: false }; } },
    StockSede: { async findOne() { return row({ cantidad: 1 }); } }
  };
  const controller = load('controllers/compras.controller.js', models);
  const req = { params: { id: 'oc' }, body: { items: [{ productoId: 'p', cantidadDevolver: 3 }] }, usuario: { userId: 'u', rol: 'admin', sedeId: 's' } };
  let error;
  await controller.devolverMercancia(req, {}, e => { error = e; });
  assert.equal(error.status, 409);
});

test('una reparación entregada no se puede editar', async () => {
  const transaction = tx();
  const orden = row({ id: 'r', sedeId: 's', estado: 'entregado' });
  const models = {
    sequelize: { async transaction() { return transaction; } },
    OrdenReparacion: { async findByPk() { return orden; } }
  };
  const controller = load('controllers/reparaciones.controller.js', models);
  const req = { params: { id: 'r' }, body: { totalCobrado: 1 }, usuario: { userId: 'u', rol: 'admin', sedeId: 's' } };
  const res = { status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } };
  await controller.updateOrden(req, res, e => { throw e; });
  assert.equal(res.code, 409);
  assert.equal(transaction.finished, 'rollback');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fechas = require('../utils/caja-fecha');
const sede = require('../utils/sede');

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, exports: module.exports, require: (id) => dependencies[id], Date
  });
  return module.exports;
}

test('el día cambia a medianoche de Bogotá, no a medianoche UTC', () => {
  const caja = { estado: 'abierta', fecha: '2026-10-07' };
  assert.equal(fechas.fechaOperativa('2026-10-08T04:59:59Z'), '2026-10-07');
  assert.equal(fechas.cierrePendiente(caja, '2026-10-08T04:59:59Z'), false);
  assert.equal(fechas.cierrePendiente(caja, '2026-10-08T05:00:00Z'), true);
  assert.throws(() => fechas.assertCajaVigente(caja, '2026-10-08T05:00:00Z'), {
    status: 409, code: 'CAJA_CIERRE_PENDIENTE'
  });
  assert.doesNotThrow(() => fechas.assertCajaVigente(null));
  assert.equal(fechas.cierrePendiente({ ...caja, estado: 'cerrada' }, '2026-10-08T05:00:00Z'), false);
});

function fixture({ compartida = true, cajaFecha = '2020-01-01' } = {}) {
  const transaction = {
    LOCK: { UPDATE: 'UPDATE' },
    async commit() { this.finished = 'commit'; },
    async rollback() { this.finished = 'rollback'; }
  };
  const caja = {
    id: 'caja', estado: 'abierta', sedeId: 'A', usuarioAperturaId: 'otro', fecha: cajaFecha,
    montoApertura: 100, totalVentasEfectivo: 50, totalEgresos: 20,
    totalVentasNequi: 10, totalVentasDaviplata: 0, totalVentasTarjeta: 0, totalVentasTransferencia: 0,
    async update(values) { Object.assign(this, values); },
    toJSON() { return { ...this }; }
  };
  const queries = [], audits = [];
  const models = {
    Caja: { async findOne(query) { queries.push(query); return caja; }, async findByPk() { return caja; } },
    ConfiguracionSistema: { async findOne() { return { cajaCompartidaSede: compartida }; } },
    sequelize: { async transaction() { return transaction; } }
  };
  const abierta = load('utils/caja-abierta.js', { '../models': models, './caja-fecha': fechas });
  const controller = load('controllers/caja.controller.js', {
    '../models': models, sequelize: { Op: { lt: Symbol('lt') } },
    '../utils/sede': sede, '../utils/caja-abierta': abierta,
    '../utils/caja-fecha': fechas, '../utils/cierre-pdf': {}, '../utils/caja-cobros': {}
  });
  const req = {
    usuario: { rol: 'admin', userId: 'admin', sedeId: 'A' }, query: {},
    body: { cajaId: 'caja', sedeId: 'A', totalVentasEfectivo: 120, observaciones: 'Olvidaron cerrar ayer' },
    async logAudit(value) { audits.push(value); }
  };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  const next = (error) => { throw error; };
  return { abierta, controller, req, res, next, caja, transaction, queries, audits };
}

test('las operaciones rechazan sesiones viejas, pero los reportes y el cierre pueden recuperarlas', async () => {
  const f = fixture({ compartida: false });
  await assert.rejects(f.abierta.findCajaAbierta({ sedeId: 'A', usuarioId: 'otro', transaction: f.transaction }), { code: 'CAJA_CIERRE_PENDIENTE' });
  const result = await f.abierta.findCajaAbierta({ sedeId: 'A', usuarioId: 'otro', permitirPendiente: true });
  assert.equal(result.caja, f.caja);
  assert.equal(f.queries[0].where.usuarioAperturaId, 'otro');
  assert.ok(f.queries[0].lock);
});

test('una caja de hoy sigue disponible para operar', async () => {
  const f = fixture({ cajaFecha: fechas.fechaOperativa() });
  assert.equal((await f.abierta.findCajaAbierta({ sedeId: 'A', usuarioId: 'otro' })).caja, f.caja);
});

test('reporte expone el cierre pendiente y permite al administrador recuperar otra caja individual', async () => {
  const f = fixture({ compartida: false });
  f.req.query = { sede: 'A', recuperarPendiente: 'true' };
  await f.controller.getReporteCaja(f.req, f.res, f.next);
  assert.equal(f.res.body.cierrePendiente, true);
  assert.equal(f.res.body.fechaOperativa, fechas.fechaOperativa());
  assert.equal(f.res.body.fecha, '2020-01-01');
  assert.equal(f.queries.length, 2);
  assert.equal(f.queries[1].where.usuarioAperturaId, undefined);
});

test('un cajero no puede usar la liberación administrativa', async () => {
  const f = fixture();
  f.req.usuario.rol = 'cajero';
  await f.controller.liberarCaja(f.req, f.res, f.next);
  assert.equal(f.res.statusCode, 403);
  assert.equal(f.caja.estado, 'abierta');
});

test('cierre administrativo cuenta efectivo, conserva fecha y registra responsable, motivo y faltante', async () => {
  const f = fixture({ compartida: false });
  await f.controller.liberarCaja(f.req, f.res, f.next);
  assert.equal(f.res.statusCode, 200);
  assert.equal(f.caja.estado, 'cerrada');
  assert.equal(f.caja.fecha, '2020-01-01');
  assert.equal(f.caja.diferencia, -10);
  assert.equal(f.caja.arqueoDeclarado.efectivo, 120);
  assert.equal(f.caja.usuarioCierreId, 'admin');
  assert.match(f.caja.observaciones, /Cierre administrativo: Olvidaron cerrar ayer/);
  assert.equal(f.audits[0].accion, 'UPDATE');
  assert.match(f.audits[0].valorNuevo.observaciones, /Cierre administrativo:/);
  assert.equal(f.transaction.finished, 'commit');
});

test('cierre administrativo rechaza falta de conteo o motivo sin cerrar la caja', async () => {
  for (const change of [{ totalVentasEfectivo: undefined }, { observaciones: ' ' }, { totalVentasEfectivo: -1 }]) {
    const f = fixture();
    Object.assign(f.req.body, change);
    await f.controller.liberarCaja(f.req, f.res, f.next);
    assert.equal(f.res.statusCode, 400);
    assert.equal(f.caja.estado, 'abierta');
    assert.equal(f.transaction.finished, 'rollback');
  }
});

test('cajero no puede cerrar una sesión individual de otro usuario o de otra sede', async () => {
  for (const sedeId of ['A', 'B']) {
    const f = fixture({ compartida: false });
    f.req.usuario = { rol: 'cajero', userId: 'cajero', sedeId: 'A' };
    f.caja.sedeId = sedeId;
    let error;
    await f.controller.cierreCaja(f.req, f.res, (e) => { error = e; });
    assert.equal(error?.status || f.res.statusCode, 403);
    assert.equal(f.caja.estado, 'abierta');
    assert.equal(f.transaction.finished, 'rollback');
  }
});

test('cajero puede cerrar su caja pendiente con arqueo y motivo', async () => {
  const f = fixture({ compartida: false });
  f.req.usuario = { rol: 'cajero', userId: 'otro', sedeId: 'A' };
  await f.controller.cierreCaja(f.req, f.res, f.next);
  assert.equal(f.caja.estado, 'cerrada');
  assert.equal(f.caja.usuarioCierreId, 'otro');
});

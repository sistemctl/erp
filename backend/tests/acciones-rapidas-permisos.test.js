const test = require('node:test');
const assert = require('node:assert/strict');
const analyticsRoutes = require('../routes/analytics.routes');

function permissionFor(path, rol) {
  const route = analyticsRoutes.stack.find(layer => layer.route?.path === path).route;
  let result;
  const response = { status(code) { result = code; return this; }, json() {} };
  route.stack[1].handle({ usuario: { rol } }, response, () => { result = 200; });
  return result;
}

test('cajero puede consultar el resumen de cartera necesario para recibir abonos', () => {
  assert.equal(permissionFor('/finanzas/cartera', 'cajero'), 200);
  assert.equal(permissionFor('/finanzas/cartera', 'tecnico'), 403);
  assert.equal(permissionFor('/finanzas/cartera', 'contador'), 200);
});

test('recibir abonos no concede al cajero acceso a los otros reportes financieros', () => {
  for (const path of ['/finanzas/cuentas-por-pagar', '/finanzas/flujo-caja', '/export/csv']) {
    assert.equal(permissionFor(path, 'cajero'), 403);
    assert.equal(permissionFor(path, 'admin'), 200);
  }
});

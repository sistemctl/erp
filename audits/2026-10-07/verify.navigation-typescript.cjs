const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(root, 'backend/node_modules/@playwright/test'));
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const user = { id: 'nav-test-user', nombre: 'Prueba', rol: 'cajero', sedeId: 'nav-test-sede', email: 'test@example.invalid', sedeNombre: 'Prueba' };
    await page.route('**/api/**', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/api/auth/login') {
        const body = request.postDataJSON();
        return body.password === 'fixture'
          ? route.fulfill({ json: { token: 'fixture', usuario: user } })
          : route.fulfill({ status: 401, json: { error: 'Credenciales inválidas.' } });
      }
      if (request.method() !== 'GET') return route.fulfill({ status: 418, json: { error: 'Escritura bloqueada por auditoría' } });
      if (url.pathname === '/api/public/reparaciones/fixture-code') return route.fulfill({ json: {
        numeroOrden: 'OR-TEST', empresa: 'ERP Prueba', estado: 'en_diagnostico', estadoLabel: 'En diagnóstico',
        equipo: { tipo: 'Laptop', marca: 'Prueba', modelo: 'Prueba' }, totalEstimado: 0
      } });
      if (url.pathname === '/api/config/branding' || url.pathname === '/api/config/sistema') return route.fulfill({ json: { empresa: 'ERP Prueba', logoUrl: null } });
      if (url.pathname === '/api/caja/reporte') return route.fulfill({ json: { estado: 'sin_registro', sedeId: user.sedeId, fecha: '2026-10-07' } });
      return route.fulfill({ json: [] });
    });
    await page.goto('http://localhost:3000/#/login');
    await page.locator('#login-email').fill(user.email);
    await page.locator('#login-password').fill('incorrecta');
    await page.locator('#login-password-toggle').click();
    assert.equal(await page.locator('#login-password').getAttribute('type'), 'text');
    await page.locator('#login-btn').click();
    await page.locator('#login-error:not(.d-none)').waitFor();
    assert.match(await page.locator('#login-error').innerText(), /Credenciales/);
    await page.locator('#login-password').fill('fixture');
    await page.locator('#login-btn').click();
    await page.waitForSelector('#btn-quick-actions:not([disabled])');
    assert.match(await page.evaluate(() => location.hash), /^#\/pos/);
    // El menú mantiene sus permisos: un cajero no puede abrir configuración.
    await page.evaluate(() => { location.hash = '#/config'; });
    await page.waitForFunction(() => location.hash === '#/pos' && document.querySelector('#btn-quick-actions')?.disabled === false);
    const modules = await page.evaluate(async () => {
      const { moduleRegistry, seguimientoModule } = await import('/assets/js/utils/module-registry.js');
      const result = [];
      for (const [route, descriptor] of Object.entries(moduleRegistry)) {
        const module = await descriptor.load();
        if (typeof module.init !== 'function') throw new Error(route);
        result.push(route);
      }
      if (typeof (await seguimientoModule.load()).init !== 'function') throw new Error('Seguimiento');
      return result;
    });
    assert.equal(modules.length, 20);
    await page.evaluate(async () => {
      const { requireElement } = await import('/assets/js/utils/dom.js');
      let rejected = false;
      try { requireElement('main-content', HTMLInputElement); } catch { rejected = true; }
      if (!rejected) throw new Error('No se rechazó el tipo DOM incorrecto');
      const { initBarcodeScanner, destroyBarcodeScanner } = await import('/assets/js/utils/barcode.js');
      const scans = [];
      initBarcodeScanner(code => scans.push(code));
      const scan = () => ['A', 'B', 'C', 'Enter'].forEach(key => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true })));
      scan();
      destroyBarcodeScanner();
      scan();
      if (scans.length !== 1 || scans[0] !== 'ABC') throw new Error('El lector no se limpia correctamente');
    });
    await page.locator('.erp-user-chip').click();
    await page.locator('#logout-btn').click();
    await page.waitForSelector('#login-form');
    assert.equal(await page.evaluate(() => localStorage.getItem('token')), null);
    await page.goto('http://localhost:3000/#/seguimiento/fixture-code');
    await page.waitForSelector('.track-card__title');
    assert.equal(await page.locator('.track-card__title').innerText(), 'OR-TEST');
    assert.equal(await page.locator('#sidebar-container').count(), 0);
    assert.deepEqual(errors, []);
    console.log('OK: login inválido/válido, contraseña visible, permisos, 20 módulos, seguimiento sin login, guardas DOM, limpieza de escáner y logout. Escrituras simuladas.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

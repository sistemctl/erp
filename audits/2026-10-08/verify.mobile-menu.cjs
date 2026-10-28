const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const root = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(root, 'backend/node_modules/@playwright/test'));
const assets = path.join(root, 'frontend/dist');
const server = http.createServer((req, res) => {
  const filename = path.resolve(assets, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!filename.startsWith(assets + path.sep) || !fs.existsSync(filename)) { res.writeHead(404).end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
  fs.createReadStream(filename).pipe(res);
});
(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    const cases = [320, 390, 637, 902, 1440].map(width => ({ width, role: 'superadmin', route: 'clientes' }));
    for (const width of [320, 390]) cases.push({ width, role: 'superadmin', route: 'pos' });
    for (const role of ['admin', 'gerente_sede', 'cajero', 'tecnico', 'contador']) cases.push({ width: 390, role, route: role === 'tecnico' ? 'reparaciones' : role === 'contador' ? 'ventas' : 'clientes' });
    for (const { width, role, route } of cases.filter(item => !process.argv.includes('--pos-only') || item.route === 'pos')) {
      const page = await browser.newPage({ viewport: { width, height: 987 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(role => {
        localStorage.setItem('token', 'fixture');
        localStorage.setItem('usuario', JSON.stringify({ id: 'fixture', nombre: 'Prueba', rol: role, sedeId: 'fixture', sedeNombre: 'Principal', email: 'test@example.invalid' }));
      }, role);
      await page.route('**/api/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/caja/reporte') return route.fulfill({ json: { id: 'fixture', estado: 'abierta', cierrePendiente: false, sedeId: 'fixture' } });
        if (url.pathname === '/api/sedes' || url.pathname === '/api/config/sedes') return route.fulfill({ json: [{ id: 'fixture', nombre: 'Principal', activa: true }] });
        return route.fulfill({ json: url.pathname.includes('/config/') ? { empresa: 'GAME' } : [] });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/#/${route}`);
      await page.locator('#sidebar-menu .nav-link').first().waitFor({ state: 'attached' });
      const menu = page.locator('#mobile-modules-modal');
      const toggle = page.locator('#mobile-more-btn');
      if (width < 992) {
        assert.equal(await page.locator('#sidebar-container').isVisible(), false);
        assert.equal(await page.locator('.erp-mobile-nav').isVisible(), true);
        const nav = await page.locator('.erp-mobile-nav').boundingBox();
        assert.equal(nav.y + nav.height, 987);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const allowed = await page.locator('#sidebar-menu a').evaluateAll(links => links.map(link => link.getAttribute('href')));
        assert.deepEqual(await menu.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href'))), allowed);
        for (const link of await page.locator('.erp-mobile-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')))) assert.ok(allowed.includes(link));
        if (width === 637) await page.screenshot({ path: path.join(__dirname, 'mobile-menu-637.png') });
        const before = await page.locator('.page-wrapper').boundingBox();
        await toggle.click();
        await menu.waitFor({ state: 'visible' });
        const after = await page.locator('.page-wrapper').boundingBox();
        assert.ok(Math.abs(before.y - after.y) < 1, 'El menú no desplaza el contenido');
        await menu.locator('a').last().scrollIntoViewIfNeeded();
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.id === 'mobile-more-btn');
        await toggle.click();
        await menu.waitFor({ state: 'visible' });
        await menu.locator(`a[href="#/${route}"]`).click();
        await menu.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => getComputedStyle(document.body).overflowY !== 'hidden');
        assert.equal(await page.locator('.modal-backdrop').count(), 0);
        if (route === 'pos') {
          const summary = page.locator('#pos-mobile-cart-toggle');
          await summary.waitFor({ state: 'visible', timeout: 5000 }).catch(async error => { console.error((await page.locator('#main-content').innerText()).slice(0,1800)); throw error; });
          const summaryBounds = await summary.boundingBox();
          assert.ok(summaryBounds.y + summaryBounds.height < nav.y, 'El cobro queda encima de la navegación');
          await summary.click();
          const cart = page.locator('.pos-panel--sale[data-mobile-open="true"]');
          await cart.waitFor({ state: 'visible' });
          const cartBounds = await cart.boundingBox();
          assert.ok(cartBounds.y + cartBounds.height < nav.y);
          assert.ok(cartBounds.y >= (await page.locator('.erp-topbar').boundingBox()).height);
          await page.locator('#pos-close-mobile-cart').click();
          await cart.waitFor({ state: 'hidden' });
          await summary.waitFor({ state: 'visible' });
        }
        if (width === 390 && role === 'superadmin' && route === 'clientes') {
          await page.locator('.erp-theme-btn[data-theme="dark"]').click();
          assert.equal(await page.locator('body').getAttribute('data-bs-theme'), 'dark');
          await page.screenshot({ path: path.join(__dirname, 'mobile-navigation-dark.png') });
        }
      } else {
        assert.equal(await toggle.isVisible(), false);
        assert.ok((await page.locator('#sidebar-menu').boundingBox()).width < 300);
        await page.screenshot({ path: path.join(__dirname, 'mobile-menu-desktop.png') });
      }
      assert.deepEqual(errors, []);
      results.push({ width, role, passed: true });
      await page.close();
    }
    fs.writeFileSync(path.join(__dirname, process.argv.includes('--pos-only') ? 'mobile-pos-results.json' : 'mobile-menu-results.json'), JSON.stringify(results, null, 2));
    console.log(`OK: ${results.length} escenarios de cabecera y navegación móvil, permisos, Más y carrito sin solapamiento.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

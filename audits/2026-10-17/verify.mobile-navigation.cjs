const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const root = path.resolve(__dirname, '../..');
const engines = require(path.join(root, 'backend/node_modules/@playwright/test'));
const assets = path.join(root, 'frontend/dist');
const server = http.createServer((req, res) => {
  const filename = path.resolve(assets, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!filename.startsWith(assets + path.sep) || !fs.existsSync(filename)) { res.writeHead(404).end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
  fs.createReadStream(filename).pipe(res);
});
async function visibleInRail(link) {
  return link.evaluate(element => {
    const item = element.getBoundingClientRect();
    const rail = element.parentElement.getBoundingClientRect();
    return item.left >= rail.left - 1 && item.right <= rail.right + 1;
  });
}
async function expectVisibleInRail(link, message) {
  await engines.expect.poll(() => visibleInRail(link), { message }).toBe(true);
}
(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const results = [];
  for (const engine of ['chromium', 'webkit'].filter(name => !process.argv.some(arg => arg.startsWith('--engine=')) || process.argv.includes(`--engine=${name}`))) {
    const browser = await engines[engine].launch({ headless: true });
    try {
      const cases = [320, 390, 430, 624, 768, 902, 1440].map(width => ({ width, role: 'superadmin', route: 'inventario' }));
      for (const role of ['admin', 'gerente_sede', 'cajero', 'tecnico', 'contador']) cases.push({ width: 390, role, route: role === 'tecnico' ? 'reparaciones' : 'ventas' });
      cases.push({ width: 320, role: 'tecnico', route: 'reparaciones' });
      for (const width of [320, 390, 624]) cases.push({ width, role: 'superadmin', route: 'pos' });
      const filters = Object.fromEntries(process.argv.filter(arg => arg.includes('=')).map(arg => arg.slice(2).split('=')));
      for (const { width, role, route } of cases.filter(item => (!filters.role || filters.role === item.role) && (!filters.width || Number(filters.width) === item.width) && (!filters.route || filters.route === item.route) && (!process.argv.includes('--remaining') || item.role === 'tecnico' && item.width === 320 || item.route === 'pos'))) {
        const page = await browser.newPage({ viewport: { width, height: 790 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(role => {
          document.addEventListener('shown.bs.modal', event => { event.target.dataset.auditReady = 'true'; });
          document.addEventListener('hidden.bs.modal', event => { event.target.dataset.auditReady = 'false'; });
          localStorage.setItem('token', 'fixture');
          localStorage.setItem('usuario', JSON.stringify({ id: 'fixture', nombre: 'Prueba', rol: role, sedeId: 'fixture', sedeNombre: 'Principal', email: 'test@example.invalid' }));
        }, role);
        await page.route('**/api/**', request => {
          const url = new URL(request.request().url());
          if (request.request().method() !== 'GET') return request.fulfill({ status: 503, json: { message: 'Escrituras deshabilitadas en auditoría' } });
          if (url.pathname === '/api/caja/reporte') return request.fulfill({ json: { id: 'fixture', estado: 'abierta', cierrePendiente: false, sedeId: 'fixture' } });
          if (url.pathname === '/api/sedes' || url.pathname === '/api/config/sedes') return request.fulfill({ json: [{ id: 'fixture', nombre: 'Principal', activa: true }] });
          return request.fulfill({ json: url.pathname.includes('/config/') ? { empresa: 'GAME' } : [] });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/#/${route}`);
        await page.locator('#sidebar-menu .nav-link').first().waitFor({ state: 'attached' });
        const nav = page.locator('.erp-mobile-nav');
        const rail = page.locator('#mobile-nav-rail');
        const more = page.locator('#mobile-more-btn');
        const menu = page.locator('#mobile-modules-modal');
        if (width < 992) {
          await nav.waitFor({ state: 'visible' });
          const allowed = await page.locator('#sidebar-menu a').evaluateAll(links => links.map(link => link.getAttribute('href')).sort());
          assert.deepEqual(await rail.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')).sort()), allowed, 'Todos los módulos del rol están en la barra');
          assert.deepEqual(await menu.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')).sort()), allowed);
          const bounds = await nav.boundingBox();
          assert.equal(bounds.y + bounds.height, 790);
          assert.ok(bounds.height <= 74, 'La barra conserva su altura');
          await expectVisibleInRail(rail.locator('[aria-current="page"]'), 'El módulo activo se revela');
          assert.ok(await rail.locator('a').evaluateAll(links => links.every(link => { const b = link.getBoundingClientRect(); return b.width >= 44 && b.height >= 44; })));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sin desbordamiento de página');
          const originalScroll = await page.evaluate(() => scrollY);
          const next = page.locator('[data-nav-direction="1"]');
          const previous = page.locator('[data-nav-direction="-1"]');
          if (role === 'tecnico') {
            const fit = await rail.evaluate(element => {
              const arrows = [...element.parentElement.querySelectorAll('[data-nav-direction]')];
              return { required: element.scrollWidth, available: element.clientWidth + arrows.reduce((width, arrow) => width + arrow.getBoundingClientRect().width, 0) };
            });
            console.log(`Tamaño disponible ${engine} ${width}: ${JSON.stringify(fit)}`);
            if (fit.required <= fit.available + 1) assert.equal(await next.isVisible(), false, 'Sin flechas cuando todos los accesos caben');
          }
          for (let step = 0; step < 40 && await next.isVisible() && await next.isEnabled(); step++) await next.click();
          await expectVisibleInRail(rail.locator('a').last(), 'Se alcanza el último módulo');
          assert.equal(await page.evaluate(() => scrollY), originalScroll, 'Las flechas no desplazan el documento');
          for (let step = 0; step < 40 && await previous.isVisible() && await previous.isEnabled(); step++) await previous.click();
          await expectVisibleInRail(rail.locator('a').first(), 'Se vuelve al primer módulo');
          await rail.locator('a').last().focus();
          await expectVisibleInRail(rail.locator('a').last(), 'El foco de teclado revela el destino');
          await more.click();
          await menu.waitFor({ state: 'visible' });
          await page.waitForFunction(() => document.getElementById('mobile-modules-modal').dataset.auditReady === 'true');
          if (role === 'superadmin') {
            await page.locator('#mobile-module-search').fill('repar');
            assert.equal(await menu.locator('li:not([hidden]) > a').count(), 1);
            await page.locator('#mobile-module-search').fill('');
          }
          await page.keyboard.press('Escape');
          await menu.waitFor({ state: 'hidden' });
          await page.waitForFunction(() => document.activeElement?.id === 'mobile-more-btn');
          if (route === 'pos') {
            const summary = page.locator('#pos-mobile-cart-toggle');
            await summary.waitFor({ state: 'visible' });
            assert.ok((await summary.boundingBox()).y + (await summary.boundingBox()).height < bounds.y);
            await summary.click();
            const cart = page.locator('.pos-panel--sale[data-mobile-open="true"]');
            await cart.waitFor({ state: 'visible' });
            const cartBounds = await cart.boundingBox();
            assert.ok(cartBounds.y + cartBounds.height < bounds.y, 'El carrito no tapa la navegación');
            await page.locator('#pos-close-mobile-cart').click();
            await cart.waitFor({ state: 'hidden' });
          }
          await more.click();
          await menu.waitFor({ state: 'visible' });
          await page.waitForFunction(() => document.getElementById('mobile-modules-modal').dataset.auditReady === 'true');
          const target = await menu.locator('a').last().getAttribute('href');
          await menu.locator('a').last().click();
          await menu.waitFor({ state: 'hidden' });
          await page.waitForFunction(hash => document.querySelector('#mobile-nav-rail [aria-current="page"]')?.getAttribute('href') === hash, target);
          await expectVisibleInRail(rail.locator('[aria-current="page"]'), 'Navegar desde Más revela el módulo activo');
          // Return to the initial route for representative screenshots and resize checks.
          await page.evaluate(hash => { location.hash = hash; }, `#/${route}`);
          await page.waitForFunction(hash => document.querySelector('#mobile-nav-rail [aria-current="page"]')?.getAttribute('href') === hash, `#/${route}`);
          await page.setViewportSize({ width: 1440, height: 790 });
          assert.equal(await nav.isVisible(), false);
          await page.setViewportSize({ width, height: 790 });
          await page.waitForFunction(() => { const rail = document.getElementById('mobile-nav-rail'); const active = rail.querySelector('[aria-current="page"]'); return active.getBoundingClientRect().right <= rail.getBoundingClientRect().right + 1; });
          if (role === 'superadmin' && route === 'inventario' && [390, 624].includes(width)) {
            await page.screenshot({ path: path.join(__dirname, `${engine}-navegacion-${width}.png`) });
            await page.locator('.erp-theme-btn[data-theme="dark"]').click();
            await page.screenshot({ path: path.join(__dirname, `${engine}-navegacion-${width}-dark.png`) });
          }
        } else {
          assert.equal(await nav.isVisible(), false);
          assert.equal(await page.locator('#sidebar-container').isVisible(), true);
        }
        if (role === 'tecnico' && width === 320) {
          await page.evaluate(() => { localStorage.removeItem('token'); localStorage.removeItem('usuario'); location.hash = '#/login'; });
          await page.locator('#login-form').waitFor({ state: 'visible' });
          assert.equal(await rail.count(), 0, 'Salir elimina la navegación de la sesión');
          await page.setViewportSize({ width: 390, height: 790 });
        }
        assert.deepEqual(errors, [], `${engine} ${role} ${width}: errores JavaScript`);
        results.push({ engine, role, width, route, passed: true });
        fs.writeFileSync(path.join(__dirname, 'mobile-navigation-results.json'), JSON.stringify(results, null, 2));
        console.log(`OK ${engine} ${role} ${route} ${width}`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(__dirname, 'mobile-navigation-results.json'), JSON.stringify(results, null, 2));
  console.log(`OK: ${results.length} escenarios, todos los módulos, flechas, foco, Más, permisos y carrito.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

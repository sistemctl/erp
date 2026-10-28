const path = require('node:path');
const assert = require('node:assert/strict');
module.exports = async ({ backend, base, users, tokens, sedes, output, checks }) => {
  const { chromium, webkit, expect } = require(path.join(backend, 'node_modules/@playwright/test'));
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width: 1130, height: 790 }, reducedMotion: 'reduce' });
        const user = users[0];
        await context.addInitScript(({ user, token, theme }) => {
          localStorage.setItem('token', token); localStorage.setItem('usuario', JSON.stringify(user)); localStorage.setItem('theme', theme);
        }, { user: { id: user.id, nombre: user.nombre, rol: user.rol, sedeId: user.sedeId }, token: tokens[0], theme });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let requests = 0;
        page.on('request', req => { if (req.url().includes('/api/inventario/inversion')) requests++; });
        await page.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 503, json: { error: 'Escrituras bloqueadas en auditoría de interfaz' } }));
        await page.goto(`${base}/#/inventario`);
        await page.locator('#inventario-table-body tr[data-id]').first().waitFor();
        assert.equal(requests, 0, 'Carga diferida de inversión');
        await page.locator('#inv-inversion-tab').click();
        await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#inv-inversion-sede').inputValue(), sedes[0].id);
        const total = page.locator('#inv-inversion-total');
        await page.locator('#inv-inversion-sede').selectOption('');
        await expect(total).toHaveText('$ 10.000.000.000.000.490,34');
        await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#inv-inversion-sedes-section').isVisible(), true);
        assert.equal(await page.locator('#inv-inversion-warning').isVisible(), true);
        const sum = await total.innerText();
        for (const width of [320, 390, 430, 624, 768, 902, 1130, 1440]) {
          await page.setViewportSize({ width, height: 790 });
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          for (const label of ['Catálogo', 'Movimientos', 'Inversión']) {
            const visible = await page.locator('.inv-module-tabs').getByRole('tab', { name: label, exact: true }).isVisible();
            if (!visible) { await page.screenshot({ path: path.join(output, 'inversion-diagnostico.png') }); console.log(await page.locator('.inv-module-tabs').evaluate(element => ({ html: element.outerHTML, display: getComputedStyle(element).display, rect: element.getBoundingClientRect().toJSON() }))); }
            assert.equal(visible, true, `${engine} ${width} ${label} visible`);
          }
          const money = await total.boundingBox(); assert.ok(money.x >= 0 && money.x + money.width <= width + 1);
          if (width < 992) {
            await expect.poll(() => page.locator('#inv-inversion-rows > .erp-mobile-record').count()).toBe(50);
            assert.equal(await page.locator('#inv-inversion-rows > tr').first().locator('.erp-mobile-cell-metric').isVisible(), true);
          }
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: path.join(output, `${engine}-inversion-${width}-${theme}.png`), animations: 'disabled' });
          checks.push({ name: `${engine}:${theme}:${width}:presentacion`, passed: true });
        }
        await page.setViewportSize({ width: 1130, height: 790 });
        await page.locator('#inv-inversion-next').click();
        await expect(page.locator('#inv-inversion-page-info')).toContainText('Página 2');
        assert.equal(await total.innerText(), sum);
        assert.ok((await page.locator('#inv-inversion-rows').innerText()).includes('Sin costo registrado'));
        await page.locator('#inv-inversion-prev').click();
        await expect(page.locator('#inv-inversion-page-info')).toContainText('Página 1');
        await page.locator('#inv-inversion-sede').selectOption(sedes[2].id);
        await expect(total).toHaveText('$ 0,00');
        await expect(page.locator('#inv-inversion-rows')).toContainText('No hay mercancía');
        await page.locator('#inv-inversion-sede').selectOption(sedes[0].id);
        await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
        let fail = true;
        const failure = async route => { if (fail) { fail = false; await route.fulfill({ status: 503, json: { error: 'Error simulado recuperable' } }); } else await route.continue(); };
        await page.route('**/api/inventario/inversion?**', failure);
        await page.locator('#inv-inversion-sede').selectOption(sedes[1].id);
        await page.locator('#inv-inversion-retry').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#inv-inversion-content').isVisible(), false);
        await page.locator('#inv-inversion-retry').click();
        await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
        await page.unroute('**/api/inventario/inversion?**', failure);
        await expect(page.locator('#inv-inversion-alcance')).toContainText(sedes[1].nombre);
        const delayed = async route => { const response = await route.fetch(); await pause(new URL(route.request().url()).searchParams.get('sedeId') === sedes[0].id ? 300 : 20); await route.fulfill({ response }); };
        await page.route('**/api/inventario/inversion?**', delayed);
        await page.locator('#inv-inversion-sede').selectOption(sedes[0].id);
        await expect(page.locator('#inv-inversion-state')).toContainText('Calculando');
        await page.locator('#inv-inversion-sede').selectOption(sedes[1].id);
        await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
        await pause(400);
        await expect(page.locator('#inv-inversion-alcance')).toContainText(sedes[1].nombre);
        await page.unroute('**/api/inventario/inversion?**', delayed);
        for (const scope of ['productos', 'compras', 'ventas', 'inventario', 'instalaciones', 'reparaciones', 'rma', 'series', 'trade-in']) {
          const before = requests;
          await page.evaluate(scope => window.dispatchEvent(new CustomEvent('erp:data-changed', { detail: { scope, sourceRoute: '#/pos', remote: true } })), scope);
          await expect.poll(() => requests).toBeGreaterThan(before);
          await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
        }
        const localBefore = requests;
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('erp:data-changed', { detail: { scope: 'productos', sourceRoute: '#/inventario', remote: false } })));
        await expect.poll(() => requests).toBeGreaterThan(localBefore);
        await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
        await page.locator('.inv-module-tabs').getByRole('tab', { name: 'Catálogo', exact: true }).click();
        const hiddenBefore = requests;
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('erp:data-changed', { detail: { scope: 'ventas', sourceRoute: '#/pos', remote: true } })));
        await pause(250); assert.equal(requests, hiddenBefore, 'Sin peticiones de inversión mientras la pestaña está oculta');
        await page.locator('#inv-inversion-tab').click();
        await expect.poll(() => requests).toBeGreaterThan(hiddenBefore);
        await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#inv-inversion-sede').inputValue(), sedes[1].id);
        // An in-flight response must not recreate content after leaving the module.
        await page.route('**/api/inventario/inversion?**', delayed);
        await page.locator('#inv-inversion-sede').selectOption(sedes[0].id);
        await page.evaluate(() => { location.hash = '#/clientes'; });
        await page.locator('#inv-inversion-tab').waitFor({ state: 'detached' });
        await pause(400); assert.equal(await page.locator('#inv-inversion-content').count(), 0);
        await page.unroute('**/api/inventario/inversion?**', delayed);
        assert.deepEqual(errors, [], 'Sin errores JavaScript');
        checks.push({ name: `${engine}:${theme}:paginacion-vacio-error-reintento-eventos-carreras-limpieza`, passed: true });
        console.log(`OK ${engine} ${theme}: 8 tamaños, paginación y actualización entre módulos`);
        await context.close();
      }
      for (const index of [1, 2, 3]) {
        const user = users[index], context = await browser.newContext();
        await context.addInitScript(({ user, token }) => { localStorage.setItem('token', token); localStorage.setItem('usuario', JSON.stringify(user)); }, { user: { id: user.id, nombre: user.nombre, rol: user.rol, sedeId: user.sedeId }, token: tokens[index] });
        const page = await context.newPage();
        await page.goto(`${base}/#/inventario`); await page.locator('#inventario-table-body').waitFor();
        assert.equal(await page.locator('#inv-inversion-tab').count(), index === 3 ? 0 : 1);
        if (index === 2) { await page.locator('#inv-inversion-tab').click(); await page.locator('#inv-inversion-content').waitFor({ state: 'visible' }); assert.equal(await page.locator('#inv-inversion-sede option').count(), 1); assert.equal(await page.locator('#inv-inversion-sede').isDisabled(), true); }
        checks.push({ name: `${engine}:permiso-ui:${user.rol}`, passed: true });
        await context.close();
      }
    } finally { await browser.close(); }
  }
};

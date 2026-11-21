const path = require('node:path'), assert = require('node:assert/strict');
module.exports = async ({ backend, base, user, token, proveedor, A, B, roundedOrderId, sedes, checks, output }) => {
  const { chromium, webkit, expect } = require(path.join(backend, 'node_modules/@playwright/test'));
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch({ headless: true });
    try {
      const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 987 } });
      await context.addInitScript(({ user, token }) => {
        localStorage.setItem('token', token); localStorage.setItem('usuario', JSON.stringify(user));
        document.addEventListener('shown.bs.modal', event => { event.target.dataset.auditReady = 'true'; });
        document.addEventListener('hidden.bs.modal', event => { event.target.dataset.auditReady = 'false'; });
      }, { user: { id: user.id, nombre: user.nombre, rol: user.rol, sedeId: user.sedeId }, token });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let submitted, stockPayload, stockWrites = 0;
      await page.route('**/api/**', async route => {
        if (route.request().method() === 'GET') return route.continue();
        if (new URL(route.request().url()).pathname === '/api/compras') submitted = route.request().postDataJSON();
        if (new URL(route.request().url()).pathname === `/api/productos/${A.id}`) { stockPayload = route.request().postDataJSON(); stockWrites++; }
        return route.fulfill({ status: 503, json: { error: 'Escritura interceptada en auditoría de interfaz' } });
      });
      await page.goto(`${base}/#/compras`);
      await page.locator('a[href="#tab-nueva-oc"]').click();
      await page.locator('#btn-oc-buscar-producto').click();
      await page.waitForFunction(() => document.getElementById('modal-oc-producto')?.dataset.auditReady === 'true');
      for (const [product, total, meters, unit] of [[A, '80000', '100', '800.00'], [B, '183000', '305', '600.00']]) {
        // Locate by the product's identity attribute instead of relying on the decorative icon's accessible name.
        const productButton = page.locator('#oc-producto-list button').filter({ hasText: product.nombre }).first();
        await productButton.click();
        await page.locator('#oc-modal-costo-rollo-modo').selectOption('rollo');
        await page.locator('#oc-modal-costo-rollo-total').fill(total);
        await page.locator('#oc-modal-costo-rollo-metros').fill(meters);
        await expect(page.locator('#oc-modal-costo')).toHaveValue(unit);
        await expect(page.locator('#oc-modal-cant')).toHaveValue(meters);
        await expect(page.locator('[data-rollo-preview]').last()).toContainText('/m');
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 987 });
          await page.locator('#oc-modal-costo-rollo-metros').scrollIntoViewIfNeeded();
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          await page.screenshot({ path: path.join(output, `${engine}-rollo-${product.id === A.id ? 'A' : 'B'}-${width}.png`), animations: 'disabled' });
          checks.push({ name: `${engine}:rollo-${product.id === A.id ? 'A' : 'B'}:${width}`, passed: true });
        }
        await page.locator('#oc-modal-add').click();
      }
      await page.locator('#oc-modal-listo').click();
      await page.locator('#modal-oc-producto').waitFor({ state: 'hidden' });
      await expect(page.locator('#tab-nueva-oc .oc-cart-qty').first()).toHaveValue('100');
      await expect(page.locator('#tab-nueva-oc .oc-cart-costo').first()).toHaveValue('800');
      // Form values use known fixture IDs; no write reaches the server.
      await page.evaluate(id => {
        const field = document.getElementById('oc-proveedor'); field.value = id;
        document.getElementById('form-nueva-oc').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, proveedor.id);
      await expect.poll(() => submitted?.items?.length).toBe(2);
      assert.deepEqual(submitted.items.map(item => [item.cantidadPedida, item.precioUnitario, item.presentacion]), [[100, 800, 'unidad'], [305, 600, 'unidad']]);
      assert.ok(submitted.items.every(item => !('costoTotalRollo' in item) && !('metrosPorRollo' in item)));
      checks.push({ name: `${engine}:payload-canonico-sin-doble-conversion`, passed: true });
      await page.locator('a[href="#tab-cuentas-pagar"]').click();
      await page.locator(`.btn-pagar-oc[data-id="${roundedOrderId}"]`).click();
      await page.locator('#pago-monto-input').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.getElementById('modal-pagar-cuenta')?.dataset.auditReady === 'true');
      await expect(page.locator('#pago-monto-input')).toHaveValue('99.99');
      assert.equal(await page.locator('#pago-monto-input').evaluate(input => input.checkValidity()), true);
      await page.locator('#form-pagar-cuenta').evaluate(form => { bootstrap.Modal.getInstance(form.closest('.modal')).hide(); });
      await page.locator('#pago-monto-input').waitFor({ state: 'hidden' });
      checks.push({ name: `${engine}:abono-conserva-centavos`, passed: true });
      await page.goto(`${base}/#/inventario`);
      await page.locator('#inv-inversion-tab').click();
      await page.locator('#inv-inversion-content').waitFor({ state: 'visible' });
      await expect(page.locator('#inv-inversion-total')).toHaveText('$ 148.000,00');
      await expect(page.locator('#inv-inversion-rows')).toContainText('28.000,00');
      await expect(page.locator('#inv-inversion-rows')).toContainText('120.000,00');
      await expect(page.locator('#inv-inversion-rows')).toContainText('/m');
      await expect(page.locator('.premium-toast')).toHaveCount(0, { timeout: 10000 });
      await page.screenshot({ path: path.join(output, `${engine}-inversion-metros.png`), animations: 'disabled' });
      await page.locator('a[href="#tab-inventario-catalogo"]').click();
      await page.locator(`#inventario-table-body .btn-editar[data-id="${A.id}"]`).click();
      await page.waitForFunction(() => document.getElementById('modal-producto')?.dataset.auditReady === 'true');
      await expect(page.locator('label[for="prod-costo"]')).toContainText('metro');
      await expect(page.locator('label[for="prod-venta"]')).toContainText('metro');
      await page.locator('#prod-stock-actual').evaluate(input => { input.value = '35.000'; });
      await page.locator('#form-producto').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await expect.poll(() => stockWrites).toBe(1);
      assert.equal(stockPayload.ajusteStock, 35, '35.000 no se transforma en 35000');
      await expect(page.locator('#form-producto')).not.toHaveAttribute('aria-busy', 'true');
      await page.locator('#prod-stock-actual').evaluate(input => { input.value = '35.5'; });
      await page.locator('#form-producto').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await expect(page.locator('.premium-toast-container')).toContainText('Existencias inválidas');
      assert.equal(stockWrites, 1, 'Las fracciones no producen ninguna escritura');
      checks.push({ name: `${engine}:stock-decimal-cero-sin-multiplicar-y-fracciones-rechazadas`, passed: true });
      assert.deepEqual(errors, []);
      checks.push({ name: `${engine}:inversion-dos-cables-sin-errores-js`, passed: true });
      await context.close();
      console.log(`OK ${engine}: rollos, carrito canónico e inversión`);
    } finally { await browser.close(); }
  }
};

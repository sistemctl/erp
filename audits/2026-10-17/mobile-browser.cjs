const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
module.exports = async ({ users, sede, reparacion, backend, base, output }) => {
  const engines = require(path.join(backend, 'node_modules/@playwright/test'));
  const jwt = require(path.join(backend, 'node_modules/jsonwebtoken'));
  const quick = process.argv.includes('--quick');
  const formsOnly = process.argv.includes('--forms-only');
  const selectedModules = process.argv.find(arg => arg.startsWith('--modules='))?.split('=')[1].split(',');
  const modules = process.argv.includes('--interactions-only') || formsOnly ? [] : selectedModules || (quick ? ['clientes', 'inventario', 'pos', 'caja'] : ['dashboard', 'clientes', 'inventario', 'pos', 'caja', 'proveedores', 'reparaciones', 'instalaciones', 'rma', 'series', 'tradein', 'ventas', 'facturacion', 'cartera', 'compras', 'cotizaciones', 'nomina', 'reportes', 'rentabilidad', 'config']);
  const widths = quick ? [320, 390, 1440] : [320, 390, 430, 768, 902, 1440];
  const results = [], errors = [], pending = [];
  let simulatedWrites = 0;
  async function check(name, callback) {
    if (formsOnly && !name.includes(':formulario-')) return;
    try { await callback(); results.push({ name, passed: true }); console.log(`OK ${name}`); }
    catch (error) { results.push({ name, passed: false, error: error.message, location: error.stack?.split('\n').find(line => line.includes('mobile-browser.cjs')) }); console.error(`FAIL ${name}: ${error.message.slice(0,1000)} ${error.stack?.split('\n').find(line => line.includes('mobile-browser.cjs')) || ''}`); }
  }
  async function contextFor(browser, user = users[0]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      document.addEventListener('shown.bs.modal', event => { if (event.target instanceof HTMLElement) event.target.dataset.auditReady = 'true'; });
      document.addEventListener('hidden.bs.modal', event => { if (event.target instanceof HTMLElement) event.target.dataset.auditReady = 'false'; });
    });
    if (user) {
      const session = { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, sedeId: sede.id, sedeNombre: sede.nombre };
      const token = jwt.sign({ userId: user.id, sessionVersion: Number(user.sessionVersion) || 0 }, process.env.JWT_SECRET, { expiresIn: '30m' });
      await context.addInitScript(({ token, session }) => { localStorage.setItem('token', token); localStorage.setItem('usuario', JSON.stringify(session)); }, { token, session });
    }
    await context.route('**/api/**', async route => {
      if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
      simulatedWrites++;
      await new Promise(resolve => setTimeout(resolve, 250));
      return route.fulfill({ status: 503, json: { error: 'Conexión de prueba interrumpida: conserva el formulario.' } });
    });
    return context;
  }
  const settle = async page => {
    await page.waitForFunction(() => document.querySelector('#main-content')?.textContent?.trim().length > 20 && (document.querySelector('#sidebar-menu .nav-item.active a')?.getAttribute('href')?.split('?')[0] === location.hash.split('?')[0] || location.hash.split('?')[0] === '#/series' && document.querySelector('#series-table-body')) && !document.querySelector('#main-content')?.textContent?.includes('Cargando módulo…') && !document.querySelector('#btn-quick-actions')?.disabled);
    await page.waitForTimeout(150);
  };
  for (const engineName of ['chromium', 'webkit']) {
    const selectedEngine = process.argv.find(arg => arg.startsWith('--engine='))?.split('=')[1];
    if (selectedEngine && selectedEngine !== engineName) continue;
    const engine = engines[engineName];
    if (!fs.existsSync(engine.executablePath())) { pending.push(`${engineName}: navegador no instalado`); continue; }
    if (quick && engineName !== 'chromium') continue;
    const browser = await engine.launch({ headless: true });
    try {
      const context = await contextFor(browser);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push({ engine: engineName, url: page.url().split('#')[1], error: error.message }));
      for (const module of modules) {
        await page.goto(`${base}/#/${module}`); await settle(page);
        for (const theme of quick ? ['light'] : ['light', 'dark']) {
          await page.evaluate(theme => { document.body.setAttribute('data-bs-theme', theme); }, theme);
          for (const width of widths) await check(`${engineName}:${module}:${width}:${theme}`, async () => {
            await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(110);
            const metrics = await page.evaluate(() => {
              const content = document.querySelector('#main-content');
              const outside = [...content.querySelectorAll('*')].filter(element => {
                const rect = element.getBoundingClientRect();
                if (!rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden' || element.closest('.table-responsive,.modal:not(.show),[hidden]')) return false;
                const head = element.closest('.erp-mobile-records thead');
                if (head && getComputedStyle(head).clipPath !== 'none') return false;
                const closed = element.closest('details:not([open])');
                if (closed && element !== closed && !element.closest('summary')) return false;
                return rect.right > innerWidth + 2 || rect.left < -2;
              }).slice(0,6).map(element => ({ tag: element.tagName, id: element.id, class: element.className, text: element.textContent.trim().slice(0,65) }));
              return { width: innerWidth, scroll: document.documentElement.scrollWidth, outside, errorView: content.textContent.includes('Error al cargar el módulo'), text: content.textContent.slice(0,220), records: content.querySelectorAll('.erp-mobile-record').length, analysis: content.querySelectorAll('.erp-mobile-analysis').length };
            });
            await page.screenshot({ path: path.join(output, `${engineName}-${module}-${width}-${theme}.png`), animations: 'disabled' });
            assert.equal(metrics.errorView, false, metrics.text);
            assert.ok(metrics.scroll <= width + 2, JSON.stringify(metrics));
            assert.deepEqual(metrics.outside, [], JSON.stringify(metrics));
          });
        }
      }
      await check(`${engineName}:clientes-busqueda-detalle-edicion-error`, async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${base}/#/clientes`); await settle(page);
        await page.locator('#crm-search-input').fill('ningun-registro-coincide');
        await page.waitForFunction(() => !document.querySelector('#crm-table-body .erp-mobile-record'));
        await page.locator('#crm-search-input').fill('María');
        await page.locator('#crm-table-body .erp-mobile-record').waitFor();
        await page.locator('#crm-table-body .erp-mobile-record-toggle').first().click();
        await page.locator('#crm-table-body .btn-ficha-cli').first().click();
        await page.locator('#modal-ficha-cliente.show').waitFor();
        await page.locator('#modal-ficha-cliente [data-bs-dismiss="modal"]').first().click();
        await page.locator('#modal-ficha-cliente').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('#crm-search-input').inputValue(), 'María');
        await page.locator('#crm-table-body .erp-mobile-action-trigger').first().click();
        await page.locator('#crm-table-body .btn-edit-cli').first().click();
        const form = page.locator('#form-cliente');
        await page.locator('#modal-form-cliente.show[data-audit-ready="true"]').waitFor();
        await page.locator('#form-cli-nombre').fill('Nombre conservado después de fallar');
        await page.setViewportSize({ width: 902, height: 844 });
        assert.equal(await page.locator('#form-cli-nombre').inputValue(), 'Nombre conservado después de fallar', 'Borrador conservado después de cambiar al tamaño de tableta');
        await page.setViewportSize({ width: 390, height: 844 });
        const before = simulatedWrites;
        await form.evaluate(form => {
          window.mobilePendingCheck = null;
          const pending = event => {
            if (event.detail?.form !== form || event.detail.pending !== true) return;
            document.removeEventListener('erp:form-request', pending);
            window.mobilePendingCheck = { busy: form.getAttribute('aria-busy'), disabled: form.querySelector('button[type="submit"]').disabled };
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          };
          document.addEventListener('erp:form-request', pending);
        });
        await form.locator('button[type="submit"]').click();
        await page.waitForFunction(() => window.mobilePendingCheck !== null);
        assert.deepEqual(await page.evaluate(() => window.mobilePendingCheck), { busy: 'true', disabled: true });
        await page.waitForFunction(() => !document.querySelector('#form-cliente')?.hasAttribute('aria-busy'));
        assert.equal(simulatedWrites - before, 1, 'El segundo envío se bloquea');
        assert.equal(await page.locator('#form-cli-nombre').inputValue(), 'Nombre conservado después de fallar', 'Borrador conservado después de fallar la petición');
        assert.equal(await page.locator('#modal-form-cliente').isVisible(), true);
        const toast = await page.locator('.premium-toast.show').last().boundingBox();
        const nav = await page.locator('.erp-mobile-nav').boundingBox();
        if (toast) assert.ok(toast.x >= 0 && toast.x + toast.width <= 392 && toast.y + toast.height < nav.y, 'La notificación no tapa la navegación');
        await page.locator('#modal-form-cliente [data-bs-dismiss="modal"]').first().click();
      });
      await check(`${engineName}:filtros-formulario-original-y-restauracion`, async () => {
        await page.goto(`${base}/#/ventas`); await settle(page);
        const button = page.locator('.tab-pane.active .erp-mobile-filter-open').first();
        await button.click();
        const modal = page.locator('.erp-mobile-filter-modal.show');
        const select = modal.locator('select').first();
        if (await select.count()) {
          const options = await select.locator('option').evaluateAll(options => options.map(option => option.value));
          if (options.length > 1) await select.selectOption(options[options.length - 1]);
        }
        assert.ok(await modal.locator('input,select').evaluateAll(fields => fields.every(field => !field.getAttribute('form') || Boolean(field.form))));
        await modal.locator('[data-mobile-apply]').click();
        await modal.waitFor({ state: 'hidden' });
        await page.setViewportSize({ width: 1440, height: 844 });
        await page.waitForFunction(() => document.querySelectorAll('.erp-mobile-filter-modal').length === 0);
        assert.ok(await page.locator('#form-filtros-ventas').evaluate(form => form.elements.length > 2));
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.tab-pane.active .erp-mobile-filter-open').first().click();
        await page.locator('.erp-mobile-filter-modal.show [data-mobile-reset]').click();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.modal.show'));
      });
      await check(`${engineName}:pos-carrito-horizontal-y-vertical`, async () => {
        await page.goto(`${base}/#/pos`); await settle(page);
        await page.locator('.btn-add-prod').first().click();
        for (const viewport of [{ width: 320, height: 744 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport); await page.waitForTimeout(120);
          const nav = await page.locator('.erp-mobile-nav').boundingBox();
          const summary = await page.locator('#pos-mobile-cart-toggle').boundingBox();
          assert.ok(summary.y + summary.height < nav.y);
          await page.locator('#pos-mobile-cart-toggle').click();
          const cart = await page.locator('.pos-panel--sale[data-mobile-open="true"]').boundingBox();
          assert.ok(cart.y + cart.height <= nav.y);
          await page.screenshot({ path: path.join(output, `${engineName}-pos-carrito-${viewport.width}.png`), animations: 'disabled' });
          await page.locator('#pos-close-mobile-cart').click();
        }
      });
      await check(`${engineName}:mas-busqueda-grupos-permisos`, async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${base}/#/clientes`); await settle(page);
        await page.locator('#mobile-more-btn').click();
        await page.locator('#mobile-modules-modal.show[data-audit-ready="true"]').waitFor();
        await page.locator('#mobile-module-search').fill('reparacion');
        await page.waitForFunction(() => document.querySelectorAll('.erp-mobile-module-list > li:not([hidden]) .nav-link').length === 1, null, { timeout: 5000 });
        assert.equal(await page.locator('.erp-mobile-module-list > li:not([hidden]) .nav-link').count(), 1);
        await page.locator('#mobile-module-search').fill('inexistente');
        assert.equal(await page.locator('#mobile-module-empty').isVisible(), true);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.id === 'mobile-more-btn');
      });
      await check(`${engineName}:consulta-fallida-reintento-sin-recargar`, async () => {
        await page.goto(`${base}/#/clientes`); await settle(page);
        let attempts = 0;
        const route = async request => {
          if (++attempts === 1) return request.fulfill({ status: 503, json: { error: 'No se pudo consultar la lista de prueba.' } });
          return request.continue();
        };
        await page.route(`${base}/api/clientes`, route);
        try {
          await page.reload(); await settle(page);
          await page.locator('.erp-mobile-load-error').waitFor();
          await page.locator('.erp-mobile-load-error button').click();
          await page.locator('#crm-table-body .erp-mobile-record').first().waitFor();
          await page.locator('.erp-mobile-load-error').waitFor({ state: 'hidden' });
          assert.equal(attempts, 2, 'Un reintento realiza una sola consulta');
        } finally { await page.unroute(`${base}/api/clientes`, route); }
      });
      await check(`${engineName}:teclado-simulado-y-limpieza`, async () => {
        await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/#/clientes`); await settle(page);
        const state = await page.evaluate(() => {
          const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
          const field = document.querySelector('#crm-search-input'); field.focus();
          Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 400, scale: 1 } });
          window.dispatchEvent(new Event('resize'));
          const hidden = getComputedStyle(document.querySelector('.erp-mobile-nav')).display === 'none';
          if (original) Object.defineProperty(window, 'visualViewport', original); else delete window.visualViewport;
          field.blur(); window.dispatchEvent(new Event('resize'));
          return { hidden, restored: !document.body.classList.contains('erp-keyboard-open') };
        });
        assert.deepEqual(state, { hidden: true, restored: true });
      });
      await check(`${engineName}:config-reintento-conserva-solo-borradores`, async () => {
        const configPage = await context.newPage();
        let failedOnce = false;
        await configPage.route(`${base}/api/config/sistema`, async request => {
          if (!failedOnce && await configPage.locator('#cfg-empresa').count()) {
            failedOnce = true;
            return request.fulfill({ status: 503, json: { error: 'No se pudo consultar la configuración de prueba.' } });
          }
          return request.continue();
        });
        try {
          await configPage.goto(`${base}/#/config`); await settle(configPage);
          const error = configPage.locator('.erp-mobile-load-error'); await error.waitFor();
          const field = configPage.locator('#cfg-empresa');
          await field.fill('Borrador de empresa conservado');
          await error.locator('button').click(); await error.waitFor({ state: 'hidden' });
          assert.equal(await field.inputValue(), 'Borrador de empresa conservado');
        } finally { await configPage.close(); }
      });
      if (!process.argv.includes('--interactions-only')) for (const [module, trigger] of [
        ['clientes', '#btn-crear-cliente'], ['proveedores', '#btn-nuevo-proveedor'], ['reparaciones', '#btn-nueva-orden'],
        ['instalaciones', '#btn-nueva-instalacion'], ['inventario', '#btn-nuevo-producto'], ['series', '#btn-nueva-serie'], ['nomina', '#btn-nuevo-empleado']
      ]) await check(`${engineName}:formulario-${module}`, async () => {
        await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/#/${module}`); await settle(page);
        const button = page.locator(trigger);
        if (!(await button.isVisible())) {
          const menu = page.locator('.erp-header__actions .erp-mobile-action-trigger').first();
          if (await menu.count()) await menu.click();
        }
        await button.click();
        const modal = page.locator('.modal.show[data-audit-ready="true"]').last(); await modal.waitFor();
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 744 }); await page.waitForTimeout(120);
          const metrics = await modal.evaluate(modal => {
            const content = modal.querySelector('.modal-content');
            const bounds = content.getBoundingClientRect();
            const bad = [...content.querySelectorAll('input:not([type="hidden"]),select,textarea,button')].filter(element => {
              const rect = element.getBoundingClientRect();
              if (!rect.width || !rect.height || element.closest('[hidden],.d-none,details:not([open])')) return false;
              return rect.left < bounds.left - 2 || rect.right > bounds.right + 2;
            }).map(element => element.id || element.className);
            return { bad, width: content.scrollWidth, available: content.clientWidth };
          });
          assert.deepEqual(metrics.bad, [], `${module}:${width}: ${JSON.stringify(metrics)}`);
          assert.ok(metrics.width <= metrics.available + 2, `${module}:${width}: ${JSON.stringify(metrics)}`);
          await page.screenshot({ path: path.join(output, `${engineName}-form-${module}-${width}.png`), animations: 'disabled' });
        }
        await modal.locator('[data-bs-dismiss="modal"]').first().click(); await modal.waitFor({ state: 'hidden' });
      });
      for (const user of users.slice(1)) await check(`${engineName}:rol-${user.rol}`, async () => {
        const roleContext = await contextFor(browser, user);
        try {
          const rolePage = await roleContext.newPage();
          await rolePage.goto(`${base}/#/${user.rol === 'tecnico' ? 'reparaciones' : user.rol === 'contador' ? 'ventas' : 'clientes'}`); await settle(rolePage);
          const allowed = await rolePage.locator('#sidebar-menu a').evaluateAll(links => links.map(link => link.getAttribute('href')));
          for (const href of await rolePage.locator('.erp-mobile-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')))) assert.ok(allowed.includes(href));
          assert.deepEqual(await rolePage.locator('#mobile-modules-modal a').evaluateAll(links => links.map(link => link.getAttribute('href'))), allowed);
          if (user.rol !== 'superadmin') assert.equal(await rolePage.locator('#mobile-modules-modal a[href="#/config"]').count(), 0);
          if (user.rol === 'tecnico') assert.equal(await rolePage.locator('.btn-edit-cli').count(), 0);
        } finally { await roleContext.close(); }
      });
      const guest = await contextFor(browser, null);
      try {
        const guestPage = await guest.newPage();
        for (const width of [320, 390, 1440]) await check(`${engineName}:login-${width}`, async () => {
          await guestPage.setViewportSize({ width, height: 744 }); await guestPage.goto(`${base}/#/login`);
          await guestPage.locator('#login-form').waitFor();
          assert.equal(await guestPage.locator('.erp-mobile-nav').count(), 0);
          assert.ok(await guestPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
          await guestPage.screenshot({ path: path.join(output, `${engineName}-login-${width}.png`) });
        });
        await check(`${engineName}:seguimiento-publico`, async () => {
          await guestPage.setViewportSize({ width: 390, height: 844 });
          await guestPage.goto(`${base}/#/seguimiento/${reparacion.tokenPublico}`);
          await guestPage.locator('.track-card').waitFor();
          assert.equal(await guestPage.locator('#sidebar-container').count(), 0);
          assert.ok(await guestPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
          await guestPage.screenshot({ path: path.join(output, `${engineName}-seguimiento-390.png`) });
        });
      } finally { await guest.close(); }
      await context.close();
    } finally { await browser.close(); }
  }
  pending.push('Teclado virtual y zonas seguras en dispositivo físico: requiere teléfono real.');
  const report = { date: new Date().toISOString(), results, errors, pending, simulatedWrites, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length };
  fs.writeFileSync(path.join(output, formsOnly ? 'mobile-ui-forms.json' : quick ? 'mobile-ui-quick.json' : selectedModules || process.argv.includes('--interactions-only') ? 'mobile-ui-focused.json' : 'mobile-ui-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, errors: errors.length, pending }));
  assert.equal(report.failed, 0, 'Hay escenarios móviles pendientes de corregir'); assert.equal(errors.length, 0, JSON.stringify(errors));
};

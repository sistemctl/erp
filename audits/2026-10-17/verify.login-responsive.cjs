const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const root = path.resolve(__dirname, '../..');
const { chromium, webkit } = require(path.join(root, 'backend/node_modules/@playwright/test'));
const assets = path.join(root, 'frontend/dist');
const server = http.createServer((req, res) => {
  const filename = path.resolve(assets, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!filename.startsWith(assets + path.sep) || !fs.existsSync(filename)) { res.writeHead(404).end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
  fs.createReadStream(filename).pipe(res);
});
const results = [];
async function assertUnclipped(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sin desplazamiento horizontal');
  for (const selector of ['.login-panel__brand', '.login-panel__title', '#login-email', '#login-password', '#login-password-toggle', '#login-btn']) {
    const bounds = await page.locator(selector).evaluate(element => {
      const box = element.getBoundingClientRect();
      const panel = element.closest('.login-panel').getBoundingClientRect();
      return { left: box.left, right: box.right, panelLeft: panel.left, panelRight: panel.right, viewport: innerWidth };
    });
    assert.ok(bounds.left >= Math.max(0, bounds.panelLeft) - 1 && bounds.right <= Math.min(bounds.viewport, bounds.panelRight) + 1, `${selector} completo dentro del panel, sin recorte por overflow:hidden: ${JSON.stringify(bounds)}`);
  }
}
(async () => {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ reducedMotion: 'reduce' });
        await context.addInitScript(theme => localStorage.setItem('theme', theme), theme);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', request => {
          if (request.request().method() !== 'GET') return request.fulfill({ status: 401, json: { message: 'Usuario o contraseña incorrectos' } });
          return request.fulfill({ json: { empresa: 'GAME' } });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/#/login`);
        await page.locator('#login-form').waitFor({ state: 'visible' });
        const viewports = [320, 390, 430, 624, 768, 902, 991, 992, 1440].map(width => ({ width, height: 790 }));
        viewports.push({ width: 790, height: 390 }, { width: 390, height: 360 });
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          await assertUnclipped(page);
          assert.equal(await page.locator('.login-panel__stage').isVisible(), viewport.width >= 992);
          assert.equal(await page.locator('.erp-mobile-nav').count(), 0);
          if (viewport.width < 992) {
            assert.equal(await page.locator('.login-panel').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
            assert.ok(await page.locator('#login-email').evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 16));
            const toggle = await page.locator('#login-password-toggle').boundingBox();
            assert.ok(toggle.width >= 44 && toggle.height >= 44);
          }
          // Ensure the button can be reached even in landscape or with a reduced viewport.
          await page.locator('#login-btn').scrollIntoViewIfNeeded();
          const button = await page.locator('#login-btn').boundingBox();
          assert.ok(button.y >= -1 && button.y + button.height <= viewport.height + 1, 'Iniciar sesión accesible al desplazarse');
          if ([320, 390, 624, 902, 1440].includes(viewport.width) && viewport.height === 790) {
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({ path: path.join(__dirname, `${engine}-login-corregido-${viewport.width}-${theme}.png`), animations: 'disabled' });
          }
          results.push({ engine, theme, ...viewport, passed: true });
        }
        await page.setViewportSize({ width: 624, height: 790 });
        await page.locator('.login-panel__product').evaluate(element => { element.textContent = 'GAME — Gestión de inventario y servicio técnico de la sede principal'; });
        await assertUnclipped(page);
        await page.locator('#login-email').fill('auditoria@example.invalid');
        await page.locator('#login-password').fill('Auditoria-123');
        await page.locator('#login-password-toggle').click();
        assert.equal(await page.locator('#login-password').getAttribute('type'), 'text');
        await page.locator('#login-password-toggle').click();
        assert.equal(await page.locator('#login-password').getAttribute('type'), 'password');
        await page.locator('#login-btn').click();
        await page.locator('#login-error:not(.d-none)').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#login-email').inputValue(), 'auditoria@example.invalid');
        assert.equal(await page.locator('#login-password').inputValue(), 'Auditoria-123');
        await assertUnclipped(page);
        assert.deepEqual(errors, [], 'Sin errores JavaScript');
        results.push({ engine, theme, name: 'Marca larga, contraseña visible y borrador tras error simulado', passed: true });
        console.log(`OK ${engine} ${theme}: ${viewports.length} tamaños y controles del formulario`);
        await context.close();
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(__dirname, 'login-responsive-results.json'), JSON.stringify(results, null, 2));
  console.log(`OK: ${results.length} comprobaciones de login, sin recortes ni errores JavaScript.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

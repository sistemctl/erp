const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(root, 'backend/node_modules/@playwright/test'));
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export (async )?function/g, '$1function');
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); console.log(`OK ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.watchDataChanges = () => () => {}; });
    await page.route('**/*', (route) => route.request().url() === 'http://audit.invalid/'
      ? route.fulfill({ contentType: 'text/html', body: '<div id="app"></div>' }) : route.abort());
    await page.goto('http://audit.invalid/');
    await check('A13: clientes y ficha CRM muestran texto sin ejecutar HTML', async () => {
      await page.evaluate(async (code) => {
        const attack = '<img src="invalid-audit" onerror="window.auditXss=true">';
        const client = { id: 'client', nombre: attack, documento: attack, telefono: attack, email: attack, direccion: attack };
        window.apiFetch = async (url) => url === '/clientes' ? [client] : url === '/clientes/client' ? client :
          url.startsWith('/reparaciones') ? [{ numeroOrden: attack, marca: attack, modelo: attack, tipoEquipo: attack, estado: 'recibido', totalCobrado: 0 }] : [];
        window.getUsuario = () => ({ rol: 'cajero' });
        window.erpHeader = (o) => o.actionsHtml;
        window.erpAction = (_type, o) => `<button class="${o.className}" data-id="${o.attrs['data-id']}">Ver</button>`;
        window.erpActions = (s) => s;
        window.bootstrap = { Modal: class { show() {} hide() {} } };
        await new Function(`${code}\nreturn initClientes;`)()(document.getElementById('app'));
        document.querySelector('.btn-ficha-cli').click();
      }, source('frontend/assets/js/modules/clientes.js'));
      await page.waitForFunction(() => document.querySelector('.modal-title strong'));
      assert.equal(await page.locator('#app img').count(), 0);
      assert.equal(await page.evaluate(() => window.auditXss === true), false);
      assert.match(await page.locator('#crm-table-body').innerText(), /<img/);
    });
    await check('Ticket escapa datos de clientes, productos y seriales', async () => {
      await page.evaluate((code) => {
        const render = new Function(`${code}\nreturn renderPosReceipt;`)();
        const attack = '<img src="invalid-audit" onerror="window.auditXss=true">';
        document.getElementById('app').innerHTML = render({ clienteNombre: attack, clienteDireccion: attack,
          empresaConfig: { empresa: attack }, items: [{ nombre: attack, imei: attack, cantidad: 1, subtotal: 100 }], total: 100 });
      }, source('frontend/assets/js/utils/pos-receipt.js'));
      assert.equal(await page.locator('#app img').count(), 0);
      assert.equal(await page.evaluate(() => window.auditXss === true), false);
    });
    await check('POS respeta exenciones, centavos y clave de reintento', async () => {
      await page.evaluate(({ code, receipt }) => {
        location.hash = '#/pos';
        document.getElementById('app').innerHTML = '';
        const product = { id: 'product', nombre: 'Exento', codigoBarras: 'P', precioVenta: 100.25,
          precioCosto: 50, tieneIVA: false, esServicio: true, unidadMedida: 'und', categoriaId: 'category' };
        window.calls = []; window.toasts = []; window.print = () => {};
        window.apiFetch = async (url, options = {}) => {
          if (url.startsWith('/caja/reporte')) return { id: 'caja', estado: 'abierta' };
          if (url === '/config/sistema') return { cobrarIvaPos: true, ivaDefecto: 19, descuentoMaximoPct: 15 };
          if (url === '/clientes' || url.startsWith('/trade-in')) return [];
          if (url === '/productos/categorias') return [{ id: 'category', nombre: 'Prueba' }];
          if (url.startsWith('/inventario/stock')) return [{ productoId: product.id, cantidad: 100, producto: product }];
          if (url === '/ventas') { window.calls.push(JSON.parse(options.body)); throw new Error('Conexión interrumpida'); }
          throw new Error(`Ruta sin fixture: ${url}`);
        };
        window.getUsuario = () => ({ rol: 'cajero', sedeId: 'A', nombre: 'Cajero' });
        window.getLocalDateStr = () => '2026-10-06';
        window.initBarcodeScanner = () => {}; window.destroyBarcodeScanner = () => {};
        window.showToast = (...args) => window.toasts.push(args);
        window.formatStockUnidad = (qty) => String(qty); window.labelUnidadMedida = () => 'und';
        window.renderPosReceipt = new Function(`${receipt}\nreturn renderPosReceipt;`)();
        new Function(`${code}\nreturn initPos;`)()(document.getElementById('app'));
      }, { code: source('frontend/assets/js/modules/pos.js'), receipt: source('frontend/assets/js/utils/pos-receipt.js') });
      await page.waitForSelector('.btn-add-prod');
      await page.locator('.btn-add-prod').click();
      await page.locator('#pos-checkout-btn').click();
      await page.locator('#pay-efectivo').fill('101');
      await page.evaluate(() => document.getElementById('form-checkout').dispatchEvent(new Event('submit', { cancelable: true })));
      await page.waitForFunction(() => window.calls.length === 1 && !document.getElementById('checkout-submit-btn').disabled);
      await page.evaluate(() => document.getElementById('form-checkout').dispatchEvent(new Event('submit', { cancelable: true })));
      await page.waitForFunction(() => window.calls.length === 2);
      const calls = await page.evaluate(() => window.calls);
      assert.equal(calls[0].total, 100.25);
      assert.equal(calls[0].iva, 0);
      assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
    });
    fs.writeFileSync(path.join(__dirname, 'frontend-verification-results.json'), JSON.stringify({ results }, null, 2) + '\n');
    if (results.some((r) => !r.passed)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });

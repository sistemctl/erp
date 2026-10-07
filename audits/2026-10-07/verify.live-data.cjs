const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'backend/node_modules/dotenv')).config({ path: path.join(root, 'backend/.env'), quiet: true });
const jwt = require(path.join(root, 'backend/node_modules/jsonwebtoken'));
const { chromium } = require(path.join(root, 'backend/node_modules/@playwright/test'));
const { sequelize, Usuario, Sede } = require(path.join(root, 'backend/models'));

(async () => {
  let browser;
  const results = [];
  try {
    const user = await Usuario.findOne({ where: { activo: true, rol: ['admin', 'superadmin'] }, attributes: ['id', 'nombre', 'rol', 'sedeId', 'sessionVersion'] });
    const sede = await Sede.findOne({ attributes: ['id'] });
    const token = jwt.sign({ userId: user.id, sessionVersion: Number(user.sessionVersion) || 0 }, process.env.JWT_SECRET, { expiresIn: '10m' });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token); localStorage.setItem('usuario', JSON.stringify(user));
      const add = window.addEventListener.bind(window);
      window.addEventListener = (name, ...args) => {
        if (name === 'erp:data-changed') window.auditLiveRoute = location.hash.split('?')[0];
        return add(name, ...args);
      };
    }, { token, user: { id: user.id, nombre: user.nombre, rol: user.rol, sedeId: user.sedeId || sede.id } });
    let created = false;
    const product = { id: 'audit-live-product', nombre: 'ZZ Auditoría catálogo instantáneo', codigoBarras: 'AUDIT-LIVE', activo: true, esServicio: false, esCombo: false, tieneNumeroSerie: false, tieneIVA: false, precioVenta: 15000, precioCosto: 5000, categoriaId: 'audit-category', categoria: { nombre: 'Auditoría' }, unidadMedida: 'und' };
    const order = { id: 'audit-install', numeroOrden: 'INST-AUDIT', estado: 'borrador', sitio: 'Prueba visual', sedeId: sede.id, materiales: [], totalCobrado: 0, valorServicio: 0, cliente: { nombre: 'Cliente de prueba' }, sede: { nombre: 'Sede de prueba' } };
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (!['GET', 'HEAD'].includes(route.request().method())) {
        if (url.pathname === '/api/productos' && route.request().method() === 'POST') {
          created = true;
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(product) });
        }
        return route.fulfill({ status: 418, contentType: 'application/json', body: '{"error":"Escritura bloqueada por auditoría"}' });
      }
      if (url.pathname === '/api/instalaciones') return route.fulfill({ json: [order] });
      if (url.pathname === '/api/instalaciones/audit-install') return route.fulfill({ json: order });
      if (url.pathname === '/api/productos') {
        const response = await route.fetch();
        const list = await response.json();
        return route.fulfill({ response, json: created ? [...list, product] : list });
      }
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/No se pudieron actualizar los datos del módulo|Error al cargar módulo:/.test(message.text())) errors.push(message.text()); });
    let reads = 0;
    page.on('request', req => { if (req.url().includes('/api/') && req.method() === 'GET') reads++; });
    const modules = ['inventario','instalaciones','compras','cotizaciones','reparaciones','clientes','proveedores','facturacion','cartera','ventas','series','tradein','rma','dashboard','reportes','nomina','caja','rentabilidad','pos','config'];
    await page.goto('http://localhost:3000/#/inventario');
    // Navegar antes de terminar la primera carga reproduce la carrera detectada.
    if (process.argv.includes('--catalog-only')) await page.evaluate(() => {
      location.hash = '#/compras';
      setTimeout(() => { location.hash = '#/instalaciones'; }, 5);
    });
    for (const module of process.argv.includes('--catalog-only') ? ['instalaciones'] : modules) {
      const previousErrors = errors.length;
      await page.evaluate(module => { window.location.hash = `#/${module}`; }, module);
      if (module !== 'config') await page.waitForFunction(module => window.auditLiveRoute === `#/${module}`, module, { timeout: 20000 });
      await page.waitForFunction(() => {
        const main = document.getElementById('main-content');
        return main && !main.textContent.includes('Cargando módulo…') && main.textContent.trim().length > 30;
      }, null, { timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 });
      assert.ok(!(await page.locator('#main-content').innerText()).includes('Error al cargar el módulo'), `${module}: error de inicialización`);
      const before = reads;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(1200);
      assert.equal(errors.length, previousErrors, `${module}: ${errors.slice(previousErrors).join('; ')}`);
      const refreshed = reads > before;
      if (!['config'].includes(module)) assert.ok(refreshed || module === 'series', `${module}: sin consulta al recuperar foco`);
      results.push({ module, rendered: true, refreshOnFocus: refreshed });
      console.log(`OK módulo ${module}`);
    }
    await page.evaluate(() => { location.hash = '#/instalaciones'; });
    await page.waitForSelector('.btn-ver-inst[data-id="audit-install"]');
    await page.locator('.btn-ver-inst[data-id="audit-install"]').click();
    await page.locator('#det-obs').fill('Borrador que debe conservarse');
    await page.locator('#btn-inst-buscar-producto').click();
    await page.waitForSelector('#inst-producto-search:visible');
    await page.locator('#inst-producto-search').fill('ZZ Auditoría');
    assert.equal(await page.locator('#inst-producto-list [data-id="audit-live-product"]').count(), 0);
    const writer = await context.newPage();
    await writer.route('http://localhost:3000/audit-live-writer', route => route.fulfill({ contentType: 'text/html', body: '<p>Auditoría</p>' }));
    await writer.goto('http://localhost:3000/audit-live-writer');
    await writer.evaluate(async () => {
      const { apiFetch } = await import('/assets/js/api.js');
      await apiFetch('/productos', { method: 'POST', body: JSON.stringify({ nombre: 'Producto simulado' }) });
    });
    await page.waitForSelector('#inst-producto-list [data-id="audit-live-product"]', { timeout: 10000 });
    assert.equal(await page.locator('#inst-producto-search').inputValue(), 'ZZ Auditoría');
    assert.equal(await page.locator('#det-obs').inputValue(), 'Borrador que debe conservarse');
    results.push({ scenario: 'Producto creado en otra pestaña aparece en selector abierto sin recarga y conserva búsqueda', passed: true });
    console.log('OK catálogo entre pestañas y preservación de búsqueda');
    // Un formulario abierto permanece intacto durante una actualización de otra pestaña.
    await page.evaluate(() => { location.hash = '#/clientes'; });
    await page.waitForSelector('#crm-search-input');
    await page.locator('#crm-search-input').fill('buscar sin perder filtro');
    await writer.evaluate(async () => {
      const { notifyDataChange } = await import('/assets/js/utils/live-data.js');
      notifyDataChange('/clientes');
    });
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#crm-search-input').inputValue(), 'buscar sin perder filtro');
    results.push({ scenario: 'Filtro de clientes permanece al actualizar', passed: true });
    fs.writeFileSync(path.join(__dirname, process.argv.includes('--catalog-only') ? 'live-catalog-results.json' : 'live-data-results.json'), JSON.stringify({ results }, null, 2));
  } finally {
    await browser?.close();
    await sequelize.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

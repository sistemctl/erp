const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'backend/node_modules/dotenv')).config({ path: path.join(root, 'backend/.env'), quiet: true });
const jwt = require(path.join(root, 'backend/node_modules/jsonwebtoken'));
const { chromium } = require(path.join(root, 'backend/node_modules/@playwright/test'));
const { sequelize, Usuario, Sede } = require(path.join(root, 'backend/dist/models'));
(async () => {
  let browser;
  try {
    const user = await Usuario.findOne({ where: { activo: true, rol: ['admin','superadmin'] }, attributes: ['id','nombre','rol','sedeId','sessionVersion'] });
    const sede = await Sede.findOne({ attributes: ['id'] });
    const sedeId = user.sedeId || sede.id;
    const token = jwt.sign({ userId: user.id, sessionVersion: Number(user.sessionVersion) || 0 }, process.env.JWT_SECRET, { expiresIn: '10m' });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({token,user}) => {
      localStorage.setItem('token',token);
      user.rol = sessionStorage.getItem('audit-role') || user.rol;
      localStorage.setItem('usuario',JSON.stringify(user));
    }, {token,user:{id:user.id,nombre:user.nombre,rol:user.rol,sedeId}});
    const accounts = [
      {id:'audit-credit-1',cliente:{nombre:'María Pérez',documento:'123456'},factura:{numeroFactura:'FV-001',sedeId},estado:'al_dia',saldoPendiente:100000,totalOriginal:120000,totalAbonado:20000},
      {id:'audit-credit-2',cliente:{nombre:'Pedro López',documento:'987654'},factura:{numeroFactura:'FV-002',sedeId},estado:'vencida',saldoPendiente:50000,totalOriginal:50000,totalAbonado:0},
      {id:'audit-paid',cliente:{nombre:'Pagada'},factura:{numeroFactura:'FV-003',sedeId},estado:'pagada',saldoPendiente:0,totalOriginal:100,totalAbonado:100}
    ];
    let caja = {id:'audit-caja',estado:'abierta',fecha:'2026-10-07',createdAt:'2026-10-07T13:00:00Z',montoApertura:200000,totalVentasEfectivo:0,totalVentasNequi:0,totalVentasDaviplata:0,totalVentasTarjeta:0,totalVentasTransferencia:0,totalEgresos:0};
    const writes = [], errors = [];
    await context.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url());
      if(req.method() !== 'GET') {
        writes.push({url:url.pathname,body:req.postDataJSON()});
        return route.fulfill({json:{message:'Operación simulada por auditoría'}});
      }
      if(url.pathname === '/api/caja/reporte') return route.fulfill({json:caja});
      if(url.pathname === '/api/config/sistema') return route.fulfill({json:{egresoMaximoSinPin:50000,descuentoMaximoPct:15,cobrarIvaPos:false,mediosPago:[{id:'efectivo',nombre:'Efectivo',activo:true}]}});
      if(url.pathname === '/api/caja/categorias-egreso') return route.fulfill({json:[{id:'audit-cat',nombre:'Servicios'}]});
      if(url.pathname === '/api/caja/egresos') return route.fulfill({json:[]});
      if(url.pathname === '/api/cartera') return route.fulfill({json:accounts});
      if(url.pathname === '/api/analytics/finanzas/cartera') return route.fulfill({json:{totalPendiente:150000,totalVencida:50000,totalAlDia:100000}});
      if(url.pathname === '/api/inventario/stock') return route.fulfill({json:[{productoId:'audit-product',cantidad:10,producto:{id:'audit-product',nombre:'Cable de prueba',codigoBarras:'TEST',precioVenta:10000,costoPromedio:5000,stockMinimo:1,unidadMedida:'unidad'}}]});
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.accept());
    const ready = () => page.waitForFunction(() => document.querySelector('#btn-quick-actions')?.disabled === false);
    const action = async id => {
      await ready();
      await page.locator('#btn-quick-actions').click();
      await page.locator(`[data-quick-action="${id}"]`).click();
    };
    await page.goto('http://localhost:3000/#/pos');
    await ready();
    await page.locator('.btn-add-prod').first().click();
    assert.equal(await page.locator('#pos-cart-count').innerText(),'1 producto');
    await action('venta');
    assert.equal(await page.locator('#pos-cart-count').innerText(),'1 producto');
    assert.equal(await page.locator('#pos-search-input').evaluate(el => el === document.activeElement),true);
    await action('abono');
    await page.locator('#modal-elegir-abono').waitFor({state:'visible'});
    await page.waitForFunction(() => document.querySelectorAll('.quick-abono-account').length === 2);
    for (const width of [320,390,1440]) {
      await page.setViewportSize({width,height:900});
      const box = await page.locator('#modal-elegir-abono .modal-dialog').boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=width+1,`Selector de abonos desborda a ${width}`);
      await page.screenshot({path:path.join(__dirname,`acciones-abono-${width}.png`)});
    }
    assert.equal(new URL(page.url()).hash,'#/cartera');
    for(const query of ['maria','123456','FV-001']) {
      await page.locator('#buscar-cuenta-abono').fill(query);
      assert.equal(await page.locator('.quick-abono-account').count(),1);
      assert.match(await page.locator('.quick-abono-account').innerText(),/María Pérez/);
    }
    await page.locator('#buscar-cuenta-abono').fill('no existe');
    assert.equal(await page.locator('.quick-abono-account').count(),0);
    await page.locator('#buscar-cuenta-abono').fill('maria');
    await page.locator('.quick-abono-account').click();
    await page.locator('#modal-abono-cartera').waitFor({state:'visible'});
    await page.waitForFunction(() => document.activeElement?.id === 'abono-monto');
    assert.match(await page.locator('#abono-cuenta-label').innerText(),/María Pérez.*FV-001/);
    assert.equal(await page.locator('#abono-monto').getAttribute('max'),'100000');
    await page.locator('#abono-monto').fill('100001');
    assert.equal(await page.locator('#abono-monto').evaluate(el=>el.checkValidity()),false);
    await page.locator('#abono-monto').fill('10000');
    await page.locator('#abono-metodo').selectOption('efectivo');
    await page.locator('#form-abono-cartera button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#modal-abono-cartera')?.classList.contains('show'));
    assert.equal(writes.length,1);
    assert.equal(writes[0].url,'/api/cartera/audit-credit-1/abono');
    assert.equal(writes[0].body.monto,10000);
    assert.equal(writes[0].body.sedeId,sedeId);
    await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
    await action('abono');
    await page.locator('#modal-elegir-abono').waitFor({state:'visible'});
    await page.locator('#modal-elegir-abono .btn-close').click();
    await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
    await action('egreso');
    await page.locator('#modal-egreso').waitFor({state:'visible'});
    await page.waitForFunction(() => bootstrap.Modal.getInstance(document.getElementById('modal-egreso'))?._isTransitioning === false);
    assert.equal(new URL(page.url()).hash,'#/caja');
    await page.locator('#egreso-monto').fill('10000');
    await page.locator('#egreso-motivo').fill('Prueba simulada de acción rápida');
    await page.locator('#form-egreso button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#modal-egreso')?.classList.contains('show'));
    assert.equal(writes.length,2);
    assert.equal(writes[1].url,'/api/caja/egreso');
    assert.equal(writes[1].body.monto,10000);
    assert.equal(writes[1].body.sedeId,sedeId);
    await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
    caja = {estado:'sin_registro'};
    await page.reload(); await ready();
    await action('egreso');
    assert.equal(await page.locator('#modal-egreso').isVisible(),false);
    await page.waitForFunction(() => document.activeElement?.id === 'btn-abrir-caja-inicio');
    caja = {...caja,id:'audit-pending',estado:'abierta',cierrePendiente:true,fecha:'2026-10-06',createdAt:'2026-10-06T13:00:00Z',montoApertura:100,totalVentasEfectivo:0,totalEgresos:0};
    await page.reload(); await ready();
    await action('egreso');
    assert.equal(await page.locator('#modal-egreso').isVisible(),false);
    await page.evaluate(()=>{location.hash='#/cartera';}); await ready();
    for(const width of [320,390,902,1440]) {
      await page.setViewportSize({width,height:900});
      await page.locator('#btn-quick-actions').click();
      const box = await page.locator('.erp-quick-actions-menu').boundingBox();
      await page.screenshot({path:path.join(__dirname,`acciones-rapidas-${width}.png`)});
      assert.ok(box.x >= 0 && box.x+box.width <= width+1,`Dropdown desborda a ${width}: ${JSON.stringify(box)}`);
      const topbar = await page.locator('.erp-topbar').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));
      assert.ok(topbar.scroll<=topbar.width+1,`Cabecera desborda a ${width}`);
      await page.screenshot({path:path.join(__dirname,`acciones-rapidas-${width}.png`)});
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors,[]);
    assert.equal(writes.length,2,'La auditoría solo permite dos escrituras simuladas');
    for(const role of ['cajero','tecnico','contador']) {
      await page.evaluate(role=>sessionStorage.setItem('audit-role',role),role);
      await page.reload();
      await page.waitForSelector('#sidebar-container');
      if(role==='cajero') {await ready();assert.equal(await page.locator('[data-quick-action]').count(),3);assert.equal(new URL(page.url()).hash,'#/cartera');}
      else assert.equal(await page.locator('#btn-quick-actions').count(),0);
    }
    console.log('OK: acciones por rol, POS sin perder carrito, abonos por nombre/documento/factura, recaudo y gasto simulados, caja cerrada/pendiente bloqueada, cabecera y menú 320/390/902/1440 px sin desborde, sin errores JavaScript.');
  } finally {if(browser) await browser.close();await sequelize.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

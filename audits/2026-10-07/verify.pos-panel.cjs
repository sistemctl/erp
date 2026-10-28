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
    await page.route('**/api/config/sistema', route => route.fulfill({json:{egresoMaximoSinPin:50000,descuentoMaximoPct:15,cobrarIvaPos:false,mediosPago:[{id:'efectivo',nombre:'Efectivo',activo:true},{id:'nequi',nombre:'Nequi',activo:true},{id:'tarjeta',nombre:'Tarjeta',activo:true}]}}));
    await page.addInitScript(()=>{window.print=()=>{};});
    let failSale=true;
    await page.route('**/api/ventas', route=>{
      const body=route.request().postDataJSON();
      writes.push(body);
      return route.fulfill(failSale ? {status:503,json:{error:'Prueba: conexión interrumpida'}} : {json:{ventaId:'audit-sale',numeroFactura:'AUD-001',total:body.total,subtotal:body.subtotal,iva:body.iva,descuentoTotal:body.descuentoTotal,items:[]}});
    });
    await page.goto('http://localhost:3000/#/pos'); await ready();
    await page.locator('.btn-add-prod').first().click();
    await page.locator('.btn-inc-qty').click();
    assert.equal(await page.locator('.input-qty-cart').inputValue(),'2');
    await page.locator('.btn-dec-qty').click();
    await page.locator('.btn-override-item').click();
    await page.locator('#override-precio-mod').fill('9500');
    await page.locator('#form-override button[type=submit]').click();
    await page.waitForFunction(()=>!document.querySelector('.modal-backdrop'));
    assert.match(await page.locator('#pos-total').innerText(),/9[.,]500/);
    for(const width of [1440,1024,902,390,320]) {
      await page.setViewportSize({width,height:900});
      if(width<992) await page.locator('#pos-mobile-cart-toggle').click();
      assert.equal(await page.locator('#pos-checkout-btn').isVisible(),true);
      await page.screenshot({path:path.join(__dirname,`pos-carrito-${width}.png`)});
      await page.locator('#pos-checkout-btn').click();
      await page.locator('#modal-checkout').waitFor({state:'visible'});
      assert.equal(await page.locator('.modal-backdrop').count(),0);
      assert.equal(await page.locator('.pos-panel--catalog').evaluate(el=>el.inert),true);
      const paymentBox=await page.locator('#modal-checkout').boundingBox();
      const submitBox=await page.locator('#checkout-submit-btn').boundingBox();
      assert.ok(paymentBox.x>=0 && paymentBox.x+paymentBox.width<=width+1,`Pago desborda a ${width}`);
      assert.ok(submitBox.y+submitBox.height<=900,`Botón de venta fuera de pantalla a ${width}`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(__dirname,`pos-pago-${width}.png`)});
      await page.locator('#pos-back-to-cart').click();
      assert.equal(await page.locator('.input-qty-cart').inputValue(),'1');
      if(width<992) await page.locator('#pos-close-mobile-cart').click();
    }
    await page.setViewportSize({width:1440,height:900});
    await page.locator('#pos-checkout-btn').click();
    await page.locator('#pay-efectivo').fill('5000');
    await page.locator('[data-payment="nequi"]').click();
    await page.locator('#pay-nequi').fill('4500');
    await page.locator('#pos-back-to-cart').click();
    await page.locator('#pos-checkout-btn').click();
    assert.equal(await page.locator('#pay-efectivo').inputValue(),'5000');
    assert.equal(await page.locator('#pay-nequi').inputValue(),'4500');
    await page.locator('[data-payment="nequi"]').click();
    assert.equal(await page.locator('#pay-nequi').inputValue(),'0');
    await page.locator('#pay-efectivo').fill('10000');
    assert.match(await page.locator('#checkout-cambio').innerText(),/500/);
    await page.locator('#checkout-submit-btn').click();
    await page.waitForFunction(()=>!document.querySelector('#checkout-submit-btn').disabled);
    assert.equal(writes.length,1);
    assert.equal(writes[0].total,9500);
    assert.equal(writes[0].pagos[0].monto - writes[0].total,500);
    assert.equal(await page.locator('#modal-checkout').isVisible(),true);
    failSale=false;
    await page.locator('#checkout-submit-btn').click();
    await page.waitForFunction(()=>document.querySelector('#pos-cart-count').textContent==='0 productos');
    assert.equal(writes.length,2);
    assert.equal(writes[0].idempotencyKey,writes[1].idempotencyKey);
    assert.equal(await page.locator('#modal-checkout').isVisible(),false);
    await page.locator('.btn-add-prod').first().click();
    await page.locator('#pos-clear-cart').click();
    assert.equal(await page.locator('#pos-checkout-btn').isDisabled(),true);
    await page.route('**/api/inventario/stock*', route=>route.fulfill({json:[{productoId:'audit-serial',cantidad:2,producto:{id:'audit-serial',nombre:'Equipo con serie',codigoBarras:'SERIAL',precioVenta:20000,precioCosto:10000,tieneNumeroSerie:true,stockMinimo:0}}]}));
    await page.reload(); await ready();
    await page.locator('.btn-add-prod').first().click();
    await page.locator('#pos-checkout-btn').click();
    assert.equal(await page.locator('#modal-checkout').isVisible(),false);
    await page.locator('.btn-add-prod').first().click();
    await page.locator('#imei-0').fill('SER-001');
    await page.locator('#imei-0').press('Tab');
    await page.locator('#imei-1').fill('SER-001');
    await page.locator('#imei-1').press('Tab');
    assert.equal(await page.locator('#imei-1').inputValue(),'');
    await page.locator('#imei-1').fill('SER-002');
    await page.locator('#imei-1').press('Tab');
    await page.locator('#pos-checkout-btn').click();
    await page.locator('#modal-checkout').waitFor({state:'visible'});
    await page.locator('#checkout-credito').check();
    assert.match(await page.locator('#checkout-label-cambio').innerText(),/Saldo a crédito/);
    await page.locator('#pos-back-to-cart').click();
    await page.locator('#pos-checkout-btn').click();
    assert.equal(await page.locator('#checkout-credito').isChecked(),true);
    assert.deepEqual(errors,[]);
    console.log('OK: carrito y pago lateral, cantidad y precio, 5 anchos sin desborde, botón de cobro visible, regresar conserva pagos, cambio, reintento idempotente, venta simulada y vaciado. Sin escrituras financieras reales.');
  } finally {if(browser) await browser.close();await sequelize.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

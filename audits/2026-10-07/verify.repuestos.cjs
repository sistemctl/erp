const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'backend/node_modules/dotenv')).config({ path: path.join(root, 'backend/.env'), quiet: true });
const jwt = require(path.join(root, 'backend/node_modules/jsonwebtoken'));
const { chromium } = require(path.join(root, 'backend/node_modules/@playwright/test'));
const { sequelize, Usuario, Sede } = require(path.join(root, 'backend/models'));
(async () => {
  let browser;
  try {
    const user = await Usuario.findOne({ where: { activo: true, rol: ['admin','superadmin'] }, attributes: ['id','nombre','rol','sedeId','sessionVersion'] });
    const sede = await Sede.findOne({ attributes: ['id'] });
    const token = jwt.sign({ userId: user.id, sessionVersion: Number(user.sessionVersion) || 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const backend = await fetch('http://localhost:3000/api/reparaciones/00000000-0000-0000-0000-000000000000/repuestos/00000000-0000-0000-0000-000000000000', { method:'DELETE', headers:{Authorization:`Bearer ${token}`} });
    assert.equal(backend.status,404);
    assert.equal((await backend.json()).error,'Orden de reparación no encontrada.');
    const costBackend = await fetch('http://localhost:3000/api/reparaciones/00000000-0000-0000-0000-000000000000/repuestos/00000000-0000-0000-0000-000000000000', { method:'PUT', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({costoUnitario:50}) });
    assert.equal(costBackend.status,404);
    assert.equal((await costBackend.json()).error,'Orden de reparación no encontrada.');
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({viewport:{width:1710,height:987}});
    await context.addInitScript(({token,user}) => { localStorage.setItem('token',token);localStorage.setItem('usuario',JSON.stringify(user)); }, {token,user:{id:user.id,nombre:user.nombre,rol:user.rol,sedeId:user.sedeId || sede.id}});
    const product={id:'part-product',nombre:'Adaptador Mini Display Port A Hdmi',codigoBarras:'AUDIT',precioCosto:25,tieneNumeroSerie:false,activo:true};
    const order={id:'order-test',numeroOrden:'OR-AUDIT',estado:'diagnostico',sedeId:sede.id,cliente:{nombre:'Cliente de prueba'},sede:{nombre:'Prueba'},tipoEquipo:'Laptop',marca:'Equipo',modelo:'Prueba',problemaReportado:'Revisión',diagnostico:'Diagnóstico',costoManoObra:100,costoRepuestos:50,totalCobrado:150,diasGarantia:30,fotos:[],createdAt:new Date().toISOString(),repuestos:[{id:'part-test',cantidad:2,costoUnitario:25,producto:product}]};
    let removed=0, saved=0;
    await context.route('**/api/**', async route => {
      const url=new URL(route.request().url());
      if(route.request().method()==='PUT' && url.pathname==='/api/reparaciones/order-test/repuestos/part-test'){
        const cost=route.request().postDataJSON().costoUnitario;
        const delta=(cost-order.repuestos[0].costoUnitario)*order.repuestos[0].cantidad;
        order.repuestos[0].costoUnitario=cost;order.costoRepuestos+=delta;order.totalCobrado+=delta;saved++;
        return route.fulfill({json:{message:'Costo del repuesto actualizado.'}});
      }
      if(route.request().method()==='DELETE' && url.pathname==='/api/reparaciones/order-test/repuestos/part-test'){
        removed++;order.repuestos=[];order.costoRepuestos=0;order.totalCobrado=100;
        return route.fulfill({json:{message:'Repuesto retirado y devuelto al inventario.'}});
      }
      if(route.request().method()!=='GET')return route.fulfill({status:418,json:{error:'Escritura real bloqueada por auditoría'}});
      if(url.pathname==='/api/reparaciones')return route.fulfill({json:[order]});
      if(url.pathname==='/api/reparaciones/order-test')return route.fulfill({json:order});
      if(url.pathname==='/api/productos')return route.fulfill({json:[product]});
      return route.continue();
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://localhost:3000/#/reparaciones');
    await page.locator('.btn-ver-orden-rep[data-id="order-test"]').click();
    await page.locator('#det-observaciones').fill('Nota sin guardar');
    await page.locator('#det-repuestos-body .repuesto-costo').fill('-1');
    await page.locator('#det-repuestos-body .btn-guardar-costo').click();
    assert.equal(saved,0);
    await page.locator('#det-repuestos-body .repuesto-costo').fill('50');
    await page.locator('#det-repuestos-body .btn-guardar-costo').click();
    await page.waitForFunction(()=>document.querySelector('#detalle-orden-content .text-danger')?.textContent.includes('100'));
    assert.equal(saved,1);assert.equal(order.totalCobrado,200);assert.equal(product.precioCosto,25);
    assert.equal(await page.locator('#det-observaciones').inputValue(),'Nota sin guardar');
    assert.equal(await page.locator('#det-repuestos-body .repuesto-costo').inputValue(),'50');
    await page.screenshot({path:path.join(__dirname,'repuestos-costo.png')});
    const editor=page.locator('.repair-part-cost-editor');
    const inputBox=await editor.locator('input').boundingBox();
    const buttonBox=await editor.locator('button').boundingBox();
    assert.ok(Math.abs(inputBox.y-buttonBox.y)<2,'Costo y guardar deben estar alineados');
    assert.ok(inputBox.x+inputBox.width<=buttonBox.x,'Los controles no deben superponerse');
    await page.setViewportSize({width:390,height:844});
    await editor.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(__dirname,'repuestos-costo-mobile.png')});
    assert.ok(await page.locator('#detalle-orden-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'El modal no debe desbordarse en móvil');
    await page.setViewportSize({width:1710,height:987});
    const remove=page.locator('#det-repuestos-body .btn-retirar-repuesto');
    await remove.click();await page.locator('#btn-confirm-cancel').click();
    await page.waitForTimeout(350);assert.equal(removed,0);
    await page.screenshot({path:path.join(__dirname,'repuestos-retirar.png')});
    await page.locator('#repuesto-search').click();
    await page.waitForSelector('#rep-modal-assigned .btn-retirar-repuesto');
    assert.equal(await page.locator('#rep-modal-assigned .btn-retirar-repuesto').count(),1);
    await page.locator('#rep-modal-assigned .btn-retirar-repuesto').click();
    await page.locator('#btn-confirm-accept').click();
    await page.waitForFunction(()=>document.querySelector('#det-repuestos-body')?.textContent.includes('No se han utilizado repuestos'));
    assert.equal(removed,1);
    assert.equal(await page.locator('#det-observaciones').inputValue(),'Nota sin guardar');
    assert.equal(await page.locator('#det-repuestos-body .btn-retirar-repuesto').count(),0);
    assert.equal(errors.length,0,errors.join('; '));
    console.log('OK: editar costo actualiza totales y conserva notas; rechaza negativo; catálogo intacto; retirar desde tabla y selector funciona. Rutas del backend verificadas.');
  } finally {await browser?.close();await sequelize.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

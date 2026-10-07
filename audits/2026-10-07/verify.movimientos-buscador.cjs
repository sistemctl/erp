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
    const user = await Usuario.findOne({ where: { activo: true, rol: ['admin', 'superadmin'] }, attributes: ['id','nombre','rol','sedeId','sessionVersion'] });
    const sede = await Sede.findOne({ attributes: ['id'] });
    const token = jwt.sign({ userId: user.id, sessionVersion: Number(user.sessionVersion) || 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1710, height: 987 } });
    await context.addInitScript(({token,user}) => {
      localStorage.setItem('token',token); localStorage.setItem('usuario',JSON.stringify(user));
    }, {token,user:{id:user.id,nombre:user.nombre,rol:user.rol,sedeId:user.sedeId || sede.id}});
    const products = [
      {id:'audit-adapter',nombre:'Adaptador Mini Display Port A Hdmi',codigoBarras:'HDMI-001'},
      {id:'audit-duplicate-a',nombre:'Cable USB',codigoBarras:'USB-002'},
      {id:'audit-duplicate-b',nombre:'Cable USB',codigoBarras:'USB-003'}
    ];
    const movementRequests = [];
    await context.route('**/api/**', async route => {
      const request=route.request(), url=new URL(request.url());
      if(request.method() !== 'GET') return route.fulfill({status:418,json:{error:'Escritura real bloqueada por auditoría'}});
      if(url.pathname === '/api/productos') return route.fulfill({json:products});
      if(url.pathname === '/api/inventario/movimientos') {
        movementRequests.push(url.searchParams.get('productoId'));
        return route.fulfill({json:{items:[],pagination:{page:1,totalPages:1,total:0}}});
      }
      return route.continue();
    });
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://localhost:3000/#/inventario');
    await page.waitForFunction(()=>{
      const body=document.querySelector('#inventario-table-body');
      return body && !body.textContent.includes('Cargando') && !body.querySelector('.spinner-border');
    });
    await page.locator('a[href="#tab-inventario-movimientos"]').click();
    await page.waitForFunction(()=>document.querySelector('#mov-inv-productos')?.dataset.loaded === '1');
    const search=page.locator('#mov-inv-producto-buscar');
    const filter=page.locator('#form-filtros-movimientos-inventario button[type="submit"]');
    assert.equal(await search.getAttribute('list'),'mov-inv-productos');
    await search.fill('Adaptador Mini Display Port A Hdmi · HDMI-001');
    await filter.click();
    await page.waitForFunction(()=>document.querySelector('#movimientos-inventario-tbody')?.textContent.includes('No hay movimientos'));
    assert.equal(movementRequests.at(-1),'audit-adapter');
    const count=movementRequests.length;
    await search.fill('No existe');
    assert.equal(await page.locator('#mov-inv-producto').inputValue(),'');
    await filter.click();
    assert.equal(movementRequests.length,count);
    await search.fill('Cable USB');
    assert.equal(await search.evaluate(el=>el.checkValidity()),false);
    await search.fill('USB-003');
    await filter.click();
    await page.waitForFunction(()=>document.querySelector('#movimientos-inventario-tbody')?.textContent.includes('No hay movimientos'));
    assert.equal(movementRequests.at(-1),'audit-duplicate-b');
    products.push({id:'audit-new',nombre:'Repuesto nuevo',codigoBarras:'NEW-004'});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('erp:data-changed', {
      detail:{scope:'productos',sourceRoute:'#/pos',remote:true}
    })));
    await page.waitForFunction(()=>[...document.querySelector('#mov-inv-productos').options].some(o=>o.value.includes('NEW-004')));
    assert.equal(await page.locator('#mov-inv-producto').inputValue(),'audit-duplicate-b');
    await search.fill('Adaptador Mini Display Port A Hdmi · HDMI-001');
    await page.screenshot({path:path.join(__dirname,'movimientos-buscador.png')});
    await page.setViewportSize({width:390,height:844});
    await search.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(__dirname,'movimientos-buscador-mobile.png')});
    const box=await search.boundingBox();
    assert.ok(box.x >= 0 && box.x+box.width <= 390);
    await page.locator('#mov-inv-producto-limpiar').click();
    await filter.click();
    await page.waitForFunction(()=>document.querySelector('#movimientos-inventario-tbody')?.textContent.includes('No hay movimientos'));
    assert.equal(movementRequests.at(-1),null);
    assert.equal(errors.length,0,errors.join('; '));
    console.log('OK: nombre y código seleccionan ID correcto; nombres repetidos y texto inválido no filtran otro producto; limpiar muestra todos; catálogo se actualiza y conserva selección; escritorio y móvil verificados.');
  } finally { await browser?.close(); await sequelize.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

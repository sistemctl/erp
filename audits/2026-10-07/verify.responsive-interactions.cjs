const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
require(path.join(root,'backend/node_modules/dotenv')).config({path:path.join(root,'backend/.env'),quiet:true});
const jwt=require(path.join(root,'backend/node_modules/jsonwebtoken'));
const {chromium}=require(path.join(root,'backend/node_modules/@playwright/test'));
const {sequelize,Usuario,Sede}=require(path.join(root,'backend/models'));
(async()=>{
 let browser;const results=[],errors=[];
 try{
  const user=await Usuario.findOne({where:{activo:true,rol:['superadmin','admin']},attributes:['id','nombre','rol','sedeId','sessionVersion']});
  const sede=await Sede.findOne({attributes:['id']});
  const token=jwt.sign({userId:user.id,sessionVersion:Number(user.sessionVersion)||0},process.env.JWT_SECRET,{expiresIn:'15m'});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:987}});
  await context.addInitScript(({token,user})=>{localStorage.setItem('token',token);localStorage.setItem('usuario',JSON.stringify(user));},{token,user:{id:user.id,nombre:user.nombre,rol:user.rol,sedeId:user.sedeId||sede.id}});
  await context.route('**/api/**',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.fulfill({status:418,json:{error:'Auditoría: escritura bloqueada'}}));
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('Error de interfaz:',e.message);});
  await page.goto('http://localhost:3000/#/dashboard');await page.waitForLoadState('networkidle');
  await page.locator('.navbar-toggler').click();await page.waitForSelector('#sidebar-menu.show');
  await page.locator('#sidebar-menu a[href="#/inventario"]').click();await page.waitForSelector('#sidebar-menu:not(.show):not(.collapsing)',{state:'attached'});
  results.push({scenario:'Menú móvil abre y cierra al navegar',passed:true});
  await page.locator('.erp-user-chip').click();
  const dropdown=await page.locator('.erp-user-dropdown.show').boundingBox();assert.ok(dropdown.x>=0&&dropdown.x+dropdown.width<=390);
  await page.keyboard.press('Escape');
  await page.locator('[data-theme="dark"]').click();assert.equal(await page.locator('body').getAttribute('data-bs-theme'),'dark');
  await page.screenshot({path:path.join(__dirname,'responsive-dark-inventario-390.png')});
  await page.locator('[data-theme="light"]').click();
  results.push({scenario:'Usuario y cambio de tema accesibles en móvil',passed:true});
  if(process.argv.includes('--shell-only')) { console.log('OK: navegación móvil, usuario y temas.'); return; }
  const forms=[['clientes','#btn-crear-cliente'],['proveedores','#btn-nuevo-proveedor'],['reparaciones','#btn-nueva-orden'],['instalaciones','#btn-nueva-instalacion'],['inventario','#btn-nuevo-producto'],['series','#btn-nueva-serie'],['nomina','#btn-nuevo-empleado']];
  for(const [module,button] of forms){
   await page.goto(`http://localhost:3000/#/${module}`);await page.waitForLoadState('networkidle');
   if(module==='inventario') await page.waitForFunction(()=>{
     const body=document.querySelector('#inventario-table-body');
     return body && !body.textContent.includes('Cargando') && !body.querySelector('.spinner-border');
   });
   console.log(`Abriendo formulario ${module}`);
   await page.locator(button).click();await page.waitForSelector('.modal.show');await page.waitForTimeout(350);
   for(const width of [390,902,1440]){
    await page.setViewportSize({width,height:987});await page.waitForTimeout(150);
    const metrics=await page.evaluate(()=>{
     const modal=document.querySelector('.modal.show');const content=modal.querySelector('.modal-content');
     const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
     const overflow=[...content.querySelectorAll('input,select,textarea,button,.modal-header,.modal-footer')].filter(e=>e.getBoundingClientRect().width>0).filter(e=>{
      if(e.closest('.table-responsive'))return false;
      const r=e.getBoundingClientRect(),c=content.getBoundingClientRect();return r.left<c.left-2||r.right>c.right+2;
     }).map(e=>({id:e.id,class:e.className,rect:rect(e)}));
     return{modalId:modal.id,content:rect(content),scrollWidth:content.scrollWidth,clientWidth:content.clientWidth,overflow};
    });
    results.push({module,width,...metrics});
    await page.screenshot({path:path.join(__dirname,`responsive-form-${module}-${width}.png`)});
   }
   await page.locator('.modal.show [data-bs-dismiss="modal"]').first().click();await page.waitForSelector('.modal.show',{state:'hidden'});
   console.log(`Formulario ${module}: ${results.slice(-3).map(r=>`${r.width}=${r.overflow.length?'overflow':'OK'}`).join(', ')}`);
  }
  fs.writeFileSync(path.join(__dirname,process.argv.includes('--shell-only')?'responsive-shell.json':'responsive-interactions.json'),JSON.stringify({results,errors},null,2));
  assert.equal(errors.length,0,errors.join('; '));console.log('Interacciones completadas sin escrituras reales');
 }finally{
  fs.writeFileSync(path.join(__dirname,process.argv.includes('--shell-only')?'responsive-shell.json':'responsive-interactions.json'),JSON.stringify({results,errors},null,2));
  await browser?.close();await sequelize.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

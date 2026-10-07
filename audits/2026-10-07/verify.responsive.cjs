const fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'../..');
require(path.join(root,'backend/node_modules/dotenv')).config({path:path.join(root,'backend/.env'),quiet:true});
const jwt=require(path.join(root,'backend/node_modules/jsonwebtoken'));
const {chromium}=require(path.join(root,'backend/node_modules/@playwright/test'));
const {sequelize,Usuario,Sede}=require(path.join(root,'backend/models'));
const stage=process.argv.includes('--after')?'after':'before';
const modules=['dashboard','pos','ventas','cotizaciones','clientes','tradein','reparaciones','rma','instalaciones','inventario','series','caja','facturacion','cartera','compras','proveedores','nomina','rentabilidad','reportes','config'];
const requested=process.argv.find(arg=>arg.startsWith('--modules='))?.split('=')[1].split(',');
const widths=stage==='after'?[320,390,902,1440]:[390,902,1440];
(async()=>{
 let browser;
 const results=[],errors=[];
 try{
  const user=await Usuario.findOne({where:{activo:true,rol:['superadmin','admin']},attributes:['id','nombre','rol','sedeId','sessionVersion']});
  const sede=await Sede.findOne({attributes:['id']});
  const token=jwt.sign({userId:user.id,sessionVersion:Number(user.sessionVersion)||0},process.env.JWT_SECRET,{expiresIn:'20m'});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:987}});
  await context.addInitScript(({token,user})=>{localStorage.setItem('token',token);localStorage.setItem('usuario',JSON.stringify(user));},{token,user:{id:user.id,nombre:user.nombre,rol:user.rol,sedeId:user.sedeId||sede.id}});
  await context.route('**/api/**',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.fulfill({status:418,json:{error:'Auditoría: escritura bloqueada'}}));
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push({route:page.url().split('#')[1],error:e.message}));
  for(const module of requested || modules){
   await page.goto(`http://localhost:3000/#/${module}`);
   await page.waitForLoadState('networkidle');
   await page.waitForFunction(()=>document.querySelector('#main-content')?.textContent.trim().length>30 && !document.querySelector('#main-content')?.textContent.includes('Cargando módulo…'));
   for(const width of widths){
    await page.setViewportSize({width,height:987});
    await page.waitForTimeout(450);
    const metrics=await page.evaluate(()=>{
     const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
     const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
     const overflowing=[...document.querySelectorAll('#main-content *')].filter(visible).filter(e=>{
      if(e.closest('.table-responsive,.dropdown-menu'))return false;
      for(let parent=e.parentElement;parent && parent.id!=='main-content';parent=parent.parentElement){
       if(['auto','scroll'].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth>parent.clientWidth)return false;
      }
      const r=e.getBoundingClientRect();return r.right>innerWidth+2||r.left<-2;
     }).slice(0,16).map(e=>({tag:e.tagName,id:e.id,class:e.className,text:e.textContent.trim().slice(0,60),rect:rect(e)}));
     const header=document.querySelector('.erp-topbar');
     const controls=[...document.querySelectorAll('.erp-topbar button,.erp-topbar a')].filter(visible).map(e=>({text:e.getAttribute('aria-label')||e.textContent.trim().slice(0,30),rect:rect(e)}));
     return{scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,sidebar:rect(document.querySelector('#sidebar-container')),header:rect(header),context:rect(document.querySelector('.erp-topbar-context')),actions:rect(document.querySelector('.erp-topbar-actions')),main:rect(document.querySelector('#main-content')),overflowing,controls,errorView:document.querySelector('#main-content').textContent.includes('Error al cargar el módulo')};
    });
    results.push({module,width,...metrics});
    await page.screenshot({path:path.join(__dirname,`responsive-${stage}-${module}-${width}.png`)});
    if(module==='dashboard') await page.screenshot({path:path.join(__dirname,`responsive-${stage}-header-${width}.png`),clip:{x:0,y:0,width,height:220}});
   }
   console.log(`${stage} ${module}: ${results.slice(-widths.length).map(r=>`${r.width}=${r.scrollWidth}${r.overflowing.length?' overflow':''}`).join(', ')}`);
  }
  fs.writeFileSync(path.join(__dirname,`responsive-${stage}${requested?'-'+requested.join('-'):''}.json`),JSON.stringify({results,errors},null,2));
  console.log(`Finished ${results.length} views, ${errors.length} JS errors`);
 }finally{await browser?.close();await sequelize.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

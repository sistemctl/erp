const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
require(path.join(root,'backend/node_modules/dotenv')).config({path:path.join(root,'backend/.env'),quiet:true});
const ts=require(path.join(root,'backend/node_modules/typescript'));
const jwt=require(path.join(root,'backend/node_modules/jsonwebtoken'));
const {chromium}=require(path.join(root,'backend/node_modules/@playwright/test'));
const {sequelize,Usuario,Sede}=require(path.join(root,'backend/dist/models'));
const source=ts.createSourceFile('app.ts',fs.readFileSync(path.join(root,'frontend/assets/js/app.ts'),'utf8'),ts.ScriptTarget.Latest,true);
let roleRoutes;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='modulosPorRol')roleRoutes=n.initializer;ts.forEachChild(n,visit);}visit(source);
const routes=new Map(roleRoutes.properties.map(p=>[p.name.getText(source),p.initializer.elements.map(e=>e.properties.find(p=>p.name.getText(source)==='hash').initializer.text)]));
(async()=>{let browser;try{
 const user=await Usuario.findOne({where:{activo:true,rol:['admin','superadmin']},attributes:['id','nombre','rol','sedeId','sessionVersion']});
 const sede=await Sede.findOne({attributes:['id']});
 const token=jwt.sign({userId:user.id,sessionVersion:Number(user.sessionVersion)||0},process.env.JWT_SECRET,{expiresIn:'10m'});
 browser=await chromium.launch({headless:true});let total=0;
 for(const rol of ['cajero','tecnico','gerente_sede','contador','admin']){
  const identity={id:user.id,nombre:user.nombre,rol,sedeId:user.sedeId||sede.id};
  const context=await browser.newContext();await context.addInitScript(({token,identity})=>{localStorage.setItem('token',token);localStorage.setItem('usuario',JSON.stringify(identity));},{token,identity});
  await context.route('**/api/**',route=>{const req=route.request(),url=new URL(req.url());if(req.method()!=='GET')return route.fulfill({status:418,json:{error:'Escritura bloqueada por auditoría'}});if(url.pathname==='/api/auth/me')return route.fulfill({json:{usuario:identity}});return route.continue();});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const hash of routes.get(rol)){ console.log(`Comprobando ${rol}: ${hash}`);
   await page.goto(`http://localhost:3000/${hash}`);await page.waitForFunction(()=>{const el=document.querySelector('#main-content');return el&&el.textContent.trim().length>30&&!el.textContent.includes('Cargando módulo…');});await page.waitForLoadState('networkidle');
   assert.doesNotMatch(await page.locator('#main-content').innerText(),/No se encontró el elemento esperado|Error al cargar el módulo|Cannot read properties/,`${rol}: ${hash}`);assert.deepEqual(errors,[],`${rol}: ${hash}`);total++;
  }
  console.log(`OK rol ${rol}: ${routes.get(rol).length} módulos`);await context.close();
 }
 console.log(`OK: ${total} vistas por permisos, lecturas reales y escrituras bloqueadas.`);
}finally{if(browser)await browser.close();await sequelize.close();}})().catch(e=>{console.error(e);process.exitCode=1;});


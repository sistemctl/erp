const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-ts-phase3-'));
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
async function run(args) {
  const child = spawn(process.execPath, [npm, ...args], {cwd: path.join(scratch,'backend'), windowsHide: true, stdio: 'inherit'});
  const code = await new Promise((resolve,reject) => {child.once('error',reject);child.once('exit',resolve);});
  if (code !== 0) throw new Error(`npm ${args.join(' ')} terminó con ${code}`);
}
(async () => {
  try {
    for (const part of ['backend','frontend','shared']) fs.cpSync(path.join(root,part),path.join(scratch,part),{
      recursive: true, filter: source => !['node_modules','dist','uploads','.env'].includes(path.basename(source))
    });
    await run(['ci','--no-audit','--no-fund']);
    await run(['run','typecheck']);
    await run(['test']);
    console.log('OK: instalación limpia sin .env, uploads, dist ni dependencias previas; tipos, compilación y pruebas.');
  } finally {
    // Solo se elimina el directorio creado por esta ejecución, dentro del temporal del sistema.
    const resolved = path.resolve(scratch);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('erp-ts-phase3-')) throw new Error('Ruta temporal inesperada');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
})().catch(error => {console.error(error.message);process.exitCode=1;});

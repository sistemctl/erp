const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const backend = path.resolve(__dirname, '..');
const frontend = path.resolve(backend, '../frontend');
const compiler = require.resolve('typescript/bin/tsc');

// Los únicos JavaScript heredados son fixtures/pruebas, fuera del código de aplicación.
function assertTypeScriptSources(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'uploads', 'tests', 'scratch', '.git'].includes(entry.name)) continue;
    const source = path.join(root, entry.name);
    if (entry.isDirectory()) assertTypeScriptSources(source);
    else if (entry.name.endsWith('.js')) throw new Error(`Código de aplicación JavaScript pendiente: ${source}`);
  }
}

function copyLegacyTests() {
  const target = path.join(backend, 'dist/tests');
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(path.join(backend, 'tests'))) {
    if (entry.endsWith('.test.js')) fs.copyFileSync(path.join(backend, 'tests', entry), path.join(target, entry));
  }
}

function compile(config, noEmit = false) {
  const result = spawnSync(process.execPath, [compiler, '-p', config, ...(noEmit ? ['--noEmit'] : [])], { cwd: backend, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló TypeScript: ${config}`);
}

function copyAssets() {
  for (const entry of fs.readdirSync(frontend)) {
    if (entry.startsWith('.') || ['dist', 'node_modules', 'tsconfig.json', 'package.json', 'package-lock.json'].includes(entry)) continue;
    fs.cpSync(path.join(frontend, entry), path.join(frontend, 'dist', entry), {
      recursive: true,
      filter(source) {
        const relative = path.relative(frontend, source);
        if (relative.split(path.sep).some(segment => segment.startsWith('.') || ['dist', 'node_modules'].includes(segment))) return false;
        if (/\.(js|ts|map)$/.test(source)) return false;
        return !['tsconfig.json', 'package.json', 'package-lock.json'].includes(relative);
      }
    });
  }
}

function build(noEmit = false) {
  assertTypeScriptSources(backend);
  assertTypeScriptSources(frontend);
  if (!noEmit) {
    for (const root of [backend, frontend]) {
      const output = path.resolve(root, 'dist');
      if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Ruta de compilación inválida');
      fs.rmSync(output, { recursive: true, force: true });
    }
  }
  compile('tsconfig.json', noEmit);
  compile('../frontend/tsconfig.json', noEmit);
  if (!noEmit) { copyAssets(); copyLegacyTests(); }
}

module.exports = { build, copyAssets, copyLegacyTests };
if (require.main === module) {
  try { build(process.argv.includes('--check')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

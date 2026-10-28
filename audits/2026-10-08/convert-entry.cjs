const fs = require('node:fs');
const path = require('node:path');
const { imports, numerical } = require('./ts-backend-tools.cjs');
const root = path.resolve(__dirname, '../../backend');
for (const file of ['migrations/audit-2026-10', 'migrations/caja-facturas-2026-10', 'seeders/seeder']) {
 const source = path.join(root, file + '.js');
 let text = imports(fs.readFileSync(source, 'utf8'));
 text = text.replace(/async function (migrate\w+)\(sequelize\)/, 'async function $1(sequelize: Sequelize)')
 .replace('module.exports = {', 'export {');
 fs.writeFileSync(source.replace(/\.js$/, '.ts'), (file.startsWith('migrations') ? "import type { Sequelize } from 'sequelize';\n" : '') + numerical(text));
 fs.unlinkSync(source);
}
const source = path.join(root, 'server.js');
let text = imports(fs.readFileSync(source, 'utf8'));
text = text.replace("import { FRONTEND_ROOT, UPLOADS_ROOT, ENV_PATH } from './utils/runtime-paths';", "import runtimePaths = require('./utils/runtime-paths');\nconst { FRONTEND_ROOT, UPLOADS_ROOT, ENV_PATH } = runtimePaths;")
 .replace("import { sequelize, ConfiguracionSistema } from './models';", "import models = require('./models');\nconst { sequelize, ConfiguracionSistema, OrdenReparacion } = models;")
 .replace('const corsOptions = {', 'const corsOptions: cors.CorsOptions = {')
 .replace("const { OrdenReparacion } = require('./models');", '')
 .replace("const crypto = require('crypto');", "")
 .replace("require('./jobs/scheduler').startScheduler();", "void startScheduler().catch(error => console.error('[Scheduler] Error al iniciar:', error));")
 .replace(/require\('\.\/migrations\/([^']+)'\)\.(\w+)/g, '$2');
for (const name of ['tokenErr', 'uomErr', 'bootErr']) text = text.replaceAll(name + '.message', `(${name} instanceof Error ? ${name}.message : String(${name}))`);
text = text.replace(/require\('\.\/routes\/([^']+)'\)/g, (_, file) => {
 const name = file.split('.')[0] + 'Routes';
 text = `import ${name} = require('./routes/${file}');\n` + text;
 return name;
});
// Route replacements are applied separately to avoid modifying text during replace.
let original = imports(fs.readFileSync(source, 'utf8'));
const routeImports = [];
text = text.replace(/require\('\.\/routes\/([^']+)'\)/g, (_, file) => file.split('.')[0] + 'Routes');
// The first replacement has already replaced references; retain only imports once.
for (const match of original.matchAll(/require\('\.\/routes\/([^']+)'\)/g)) routeImports.push(`import ${match[1].split('.')[0]}Routes = require('./routes/${match[1]}');`);
text = text.replace(/^import \w+Routes = require\([^\n]+\);\r?\n/gm, '');
fs.writeFileSync(source.replace(/\.js$/, '.ts'), routeImports.join('\n') + `\nimport crypto = require('crypto');
import { startScheduler } from './jobs/scheduler';
import { migrateAuditSchema } from './migrations/audit-2026-10';
import { migrateCajaFacturasSchema } from './migrations/caja-facturas-2026-10';\n` + numerical(text));
fs.unlinkSync(source);

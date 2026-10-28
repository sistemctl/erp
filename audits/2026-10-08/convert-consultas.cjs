const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../backend');
for (const [domain, model, extra] of [['clientes', 'Cliente', ''], ['proveedores', 'Proveedor', ' & { direccion?: string | null }'], ['empleados', 'Empleado', '']]) {
  const file = path.join(root, 'controllers', domain + '.controller.js');
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/const \{ ([^}]+) \} = require\('\.\.\/models'\);/, "import models = require('../models');\nconst { $1 } = models;");
  text = text.replace(/const \{ ([^}]+) \} = require\('([^']+)'\);/g, "import { $1 } from '$2';");
  text = text.replace(/exports\.(\w+) = async/g, 'export const $1: Handler<Body> = async');
  text = text.replaceAll('req.usuario', 'requireUser(req)');
  text = text.replace('const where = {};', `const where: WhereOptions<Attributes<${model}Model>> = {};`);
  if (domain === 'empleados') text = text.replace('parseFloat(salarioBase)', 'parseFloat(String(salarioBase))');
  if (domain === 'proveedores') {
    text = text.replace('const proveedor = await Proveedor.create({', 'const proveedorData = {')
      .replace('      cuentaBancaria\n    });', '      cuentaBancaria\n    };\n    const proveedor = await Proveedor.create(proveedorData);');
  }
  const header = `import type { Attributes, CreationAttributes, WhereOptions } from 'sequelize';\nimport type ${model}Model = require('../models/${model}');\nimport type { Handler } from '../types/controller';\nimport { requireUser } from '../utils/request-user';\ntype Body = Partial<CreationAttributes<${model}Model>>${extra};\n`;
  fs.writeFileSync(file.replace(/\.js$/, '.ts'), header + text);
  fs.unlinkSync(file);
  const route = path.join(root, 'routes', domain + '.routes.js');
  let routes = fs.readFileSync(route, 'utf8').replace(/const (\w+) = require\('([^']+)'\);/g, "import $1 = require('$2');").replace('module.exports = router;', 'export = router;');
  fs.writeFileSync(route.replace(/\.js$/, '.ts'), routes);
  fs.unlinkSync(route);
}

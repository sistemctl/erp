// One-time conversion: retain each Sequelize definition and infer column/creation types.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../backend/node_modules/typescript');
const root = path.resolve(__dirname, '../../backend');
const index = fs.readFileSync(path.join(root, 'models/index.js'), 'utf8');
const associations = new Map();
for (const match of index.matchAll(/(\w+)\.(belongsTo|hasMany|hasOne)\((\w+), \{[^\n]*as: '([^']+)'/g)) {
  const [, owner, kind, target, alias] = match;
  const entries = associations.get(owner) || [];
  entries.push({ target, alias, many: kind === 'hasMany' });
  associations.set(owner, entries);
}
for (const file of fs.readdirSync(path.join(root, 'models')).filter(n => n.endsWith('.js') && n !== 'index.js')) {
  const name = file.slice(0, -3);
  let text = fs.readFileSync(path.join(root, 'models', file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let fields;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'sequelize.define') fields = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!fields || !ts.isObjectLiteralExpression(fields)) throw new Error(file);
  const columns = fields.properties.map(field => {
    const props = Object.fromEntries(field.initializer.properties.map(p => [p.name.getText(source), p.initializer]));
    const datatype = props.type.getText(source);
    let type = 'string';
    if (/DataTypes\.(INTEGER|FLOAT|DOUBLE|REAL)/.test(datatype)) type = 'number';
    else if (/DataTypes\.DECIMAL/.test(datatype)) type = 'string | number';
    else if (/DataTypes\.BOOLEAN/.test(datatype)) type = 'boolean';
    else if (/DataTypes\.DATE\b/.test(datatype)) type = 'Date';
    else if (/DataTypes\.ENUM/.test(datatype)) type = props.type.arguments.map(a => a.getText(source)).join(' | ');
    else if (/DataTypes\.JSON/.test(datatype)) type = 'unknown';
    const nullable = props.allowNull?.getText(source) !== 'false' && props.primaryKey?.getText(source) !== 'true';
    if (nullable && type !== 'unknown') type += ' | null';
    return { key: field.name.getText(source), type, optional: nullable || !!props.defaultValue || !!props.autoIncrement };
  });
  const links = associations.get(name) || [];
  let header = `import { DataTypes, type Model, type Optional } from 'sequelize';\nimport sequelize = require('../config/database');\n`;
  for (const target of [...new Set(links.map(l => l.target))].filter(t => t !== name)) header += `import type ${target} = require('./${target}');\n`;
  header += `\ninterface ${name}Attributes {\n${columns.map(c => `  ${c.key}: ${c.type};`).join('\n')}\n  createdAt: Date;\n  updatedAt: Date;\n}\n`;
  const optional = [...columns.filter(c => c.optional).map(c => `'${c.key}'`), "'createdAt'", "'updatedAt'"].join(' | ');
  header += `type ${name}Creation = Optional<${name}Attributes, ${optional}>;\ninterface ${name} extends Model<${name}Attributes, ${name}Creation>, ${name}Attributes {\n`;
  header += links.map(l => `  ${l.alias}?: ${l.target}${l.many ? '[]' : ' | null'};`).join('\n');
  if (name === 'Usuario') header += '\n  compararPassword(passwordCandidata: string): Promise<boolean>;';
  header += '\n}\n\n';
  text = text.replace("const { DataTypes } = require('sequelize');\n", '').replace("const sequelize = require('../config/database');\n", '');
  text = text.replace('sequelize.define(', `sequelize.define<${name}>(`);
  text = text.replace(`module.exports = ${name};`, `export = ${name};`);
  if (name === 'Usuario') {
    text = text.replace("const bcrypt = require('bcryptjs');", "import bcrypt = require('bcryptjs');");
    text = text.replace("['password', 'rol', 'sedeId', 'activo'].some", "(['password', 'rol', 'sedeId', 'activo'] as const).some");
    text = text.replace('function (passwordCandidata)', 'function (this: Usuario, passwordCandidata: string)');
  }
  fs.writeFileSync(path.join(root, 'models', name + '.ts'), header + text);
  fs.unlinkSync(path.join(root, 'models', file));
}
let typedIndex = index.replace(/const (\w+) = require\('([^']+)'\);/g, "import $1 = require('$2');")
  .replace("const { Sequelize } = require('sequelize');", "import { Sequelize } from 'sequelize';")
  .replace('module.exports = {', 'export = {');
fs.writeFileSync(path.join(root, 'models/index.ts'), typedIndex);
fs.unlinkSync(path.join(root, 'models/index.js'));

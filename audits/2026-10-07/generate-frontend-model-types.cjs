// Generate transport column contracts from the existing Sequelize definitions.
// Associations and calculated endpoint projections are declared separately.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../backend/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const definitions = [];
for (const name of fs.readdirSync(path.join(root, 'backend/models')).filter(n => n !== 'index.js' && n.endsWith('.js'))) {
  const source = ts.createSourceFile(name, fs.readFileSync(path.join(root,'backend/models',name),'utf8'),ts.ScriptTarget.Latest,true);
  let fields;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'sequelize.define' && ts.isObjectLiteralExpression(node.arguments[1])) fields = node.arguments[1];
    ts.forEachChild(node,visit);
  }
  visit(source);
  if (!fields) throw new Error('Model definition not found: ' + name);
  const columns = fields.properties.map(field => {
    const key = field.name.getText(source);
    const options = field.initializer;
    const props = Object.fromEntries(options.properties.map(p => [p.name.getText(source),p.initializer]));
    const datatype = props.type.getText(source);
    let type = 'string';
    if (/DataTypes\.(INTEGER|FLOAT|DOUBLE|REAL)/.test(datatype)) type = 'number';
    else if (/DataTypes\.BOOLEAN/.test(datatype)) type = 'boolean';
    else if (/DataTypes\.ENUM/.test(datatype)) type = props.type.arguments.map(a => a.getText(source)).join(' | ');
    else if (/DataTypes\.JSON/.test(datatype)) type = 'unknown';
    if (props.allowNull?.getText(source) !== 'false' && props.primaryKey?.getText(source) !== 'true') type += ' | null';
    return `  ${key}: ${type};`;
  });
  definitions.push(`export interface ${name.slice(0,-3)}Columns {\n${columns.join('\n')}\n  createdAt: string; updatedAt: string;\n}`);
}
fs.writeFileSync(path.join(root,'frontend/assets/js/types/model-columns.ts'), '/** Database transport columns: DECIMAL and dates remain strings. JSON shapes are narrowed per endpoint. */\n' + definitions.join('\n\n') + '\n');

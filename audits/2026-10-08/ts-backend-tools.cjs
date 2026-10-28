const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../backend/node_modules/typescript');
const root = path.resolve(__dirname, '../../backend');
function numerical(text) {
  const source = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (ts.isCallExpression(node) && /^(Number\.)?parse(Float|Int)$/.test(node.expression.getText(source)) && node.arguments.length) {
      const arg = node.arguments[0];
      if (!/^String\(/.test(arg.getText(source))) edits.push([arg.getStart(source), arg.end, `String(${arg.getText(source)})`]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const [start, end, value] of edits.sort((a,b)=>b[0]-a[0])) text = text.slice(0,start) + value + text.slice(end);
  return text;
}
function imports(text) {
  return text.replace(/^const \{([^{}]*?)\} = require\('\.\.\/models'\);/m, "import models = require('../models');\nconst {$1} = models;")
    .replace(/^const \{ ([^}]+) \} = require\('([^']+)'\);/gm, "import { $1 } from '$2';")
    .replace(/^const (\w+) = require\('([^']+)'\);/gm, "import $1 = require('$2');");
}
function controller(domain, header, replacements = []) {
  const file = path.join(root, 'controllers', domain + '.controller.js');
  let text = imports(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  text = text.replace(/exports\.(\w+) = async/g, 'export const $1: Handler<Body> = async')
    .replaceAll('req.usuario', 'requireUser(req)').replaceAll('transaction.finished', 'transactionFinished(transaction)');
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(domain + ': missing ' + from);
    text = text.replaceAll(from, to);
  }
  fs.writeFileSync(file.replace(/\.js$/, '.ts'), "import type { Handler } from '../types/controller';\nimport { requireUser } from '../utils/request-user';\nimport { transactionFinished } from '../utils/transaction-state';\n" + header + '\n' + numerical(text));
  fs.unlinkSync(file);
  const route = path.join(root, 'routes', domain + '.routes.js');
  if (fs.existsSync(route)) {
    const routes = imports(fs.readFileSync(route,'utf8')).replace('module.exports = router;', 'export = router;');
    fs.writeFileSync(route.replace(/\.js$/, '.ts'), routes);
    fs.unlinkSync(route);
  }
}
module.exports = { numerical, imports, controller };

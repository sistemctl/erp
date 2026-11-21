const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../frontend/assets/js');
function convert(name, transform) {
  const source = path.join(root, name + '.js');
  fs.writeFileSync(path.join(root, name + '.ts'), transform(fs.readFileSync(source, 'utf8')));
  fs.unlinkSync(source);
}
function dom(s) {
  const kinds = new Map();
  const classes = { input:'HTMLInputElement', textarea:'HTMLTextAreaElement', select:'HTMLSelectElement', form:'HTMLFormElement', canvas:'HTMLCanvasElement', div:'HTMLDivElement', h5:'HTMLHeadingElement', tbody:'HTMLTableSectionElement', button:'HTMLButtonElement', a:'HTMLAnchorElement', img:'HTMLImageElement', span:'HTMLSpanElement', p:'HTMLParagraphElement' };
  for (const match of s.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"/g)) kinds.set(match[2], classes[match[1]] || 'HTMLElement');
  s = s.replace(/document.getElementById\('([^']+)'\)(?!\?)/g, (full,id) => kinds.has(id) ? `requireElement('${id}', ${kinds.get(id)})` : full);
  return s;
}
function base(s) {
  s = `import { requireElement } from '../utils/dom.js';\nimport { errorMessage } from '../utils/errors.js';\n` + s;
  s = s.replaceAll('getUsuario', 'requireUsuario');
  s = s.replace(/(export async function init\w+)\(container([,)])/g, '$1(container: HTMLElement$2');
  s = s.replaceAll('err.message', 'errorMessage(err)').replaceAll('error.message', 'errorMessage(error)');
  return dom(s);
}
module.exports = { convert, base, dom, root };

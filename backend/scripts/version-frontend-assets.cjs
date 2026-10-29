const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../../frontend/dist');
const jsRoot = path.join(root, 'assets/js');
const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target);
    else if (/\.(?:html|js|css)$/.test(entry.name)) files.push(target);
  }
}
collect(root);
files.sort();
const digest = crypto.createHash('sha256');
for (const file of files) {
  digest.update(path.relative(root, file));
  digest.update(fs.readFileSync(file));
}
const version = digest.digest('hex').slice(0, 12);
let importsUpdated = 0;
for (const file of files.filter(file => file.endsWith('.js'))) {
  const source = fs.readFileSync(file, 'utf8');
  const addVersion = (_match, before, specifier, after) => {
    importsUpdated++;
    return `${before}${specifier}?v=${version}${after}`;
  };
  const output = source
    .replace(/(\bfrom\s*['"])(\.{1,2}\/[^'"]+\.js)(['"])/g, addVersion)
    .replace(/(\bimport\s*['"])(\.{1,2}\/[^'"]+\.js)(['"])/g, addVersion)
    .replace(/(\bimport\s*\(\s*['"])(\.{1,2}\/[^'"]+\.js)(['"]\s*\))/g, addVersion);
  if (output !== source) fs.writeFileSync(file, output);
}
const registry = path.join(jsRoot, 'utils/module-registry.js');
const registrySource = fs.readFileSync(registry, 'utf8');
const registryOutput = registrySource.replace(/(export const ASSET_V\s*=\s*['"])[^'"]+(['"])/, (_match, before, after) => `${before}${version}${after}`);
if (registryOutput === registrySource) throw new Error('No se encontró ASSET_V en module-registry.js');
fs.writeFileSync(registry, registryOutput);
const index = path.join(root, 'index.html');
const indexSource = fs.readFileSync(index, 'utf8');
const indexOutput = indexSource.replace(/(\/assets\/(?:js|css)\/[^'"?\s]+\.(?:js|css))(?:\?[^'"]*)?/g, (_match, assetPath) => `${assetPath}?v=${version}`);
if (indexOutput === indexSource || importsUpdated === 0) throw new Error('No se versionaron los recursos del frontend');
fs.writeFileSync(index, indexOutput);
console.log(`Frontend assets versionados: ${version}; imports: ${importsUpdated}`);

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { build, copyAssets, copyLegacyTests } = require('./build.cjs');
const backend = path.resolve(__dirname, '..');
const frontend = path.resolve(backend, '../frontend');
build();
const compiler = require.resolve('typescript/bin/tsc');
const commands = [
  [compiler, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
  [compiler, '-p', '../frontend/tsconfig.json', '--watch', '--preserveWatchOutput'],
  ['--watch', 'dist/server.js']
];
const children = commands.map(args => spawn(process.execPath, args, { cwd: backend, stdio: 'inherit' }));
let timer;
const watcher = fs.watch(frontend, { recursive: true }, (_event, filename) => {
  if (!filename || filename.split(/[\\/]/).includes('dist') || /\.(js|ts|map)$/.test(filename)) return;
  clearTimeout(timer);
  timer = setTimeout(copyAssets, 150);
});
const testsWatcher = fs.watch(path.join(backend, 'tests'), (_event, filename) => {
  if (filename?.endsWith('.test.js')) copyLegacyTests();
});
function stop() { clearTimeout(timer); watcher.close(); testsWatcher.close(); children.forEach(child => child.kill()); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
children.forEach(child => child.once('error', error => { console.error(error); stop(); process.exitCode = 1; }));

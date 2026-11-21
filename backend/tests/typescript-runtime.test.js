const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const runtime = require('../utils/runtime-paths');

test('la compilación mantiene configuración y uploads fuera de dist', () => {
  const backend = path.resolve(__dirname, '../..');
  assert.equal(runtime.BACKEND_ROOT, backend);
  assert.equal(runtime.ENV_PATH, path.join(backend, '.env'));
  assert.equal(runtime.UPLOADS_ROOT, path.join(backend, 'uploads'));
  assert.equal(runtime.resolveLogoPath('/uploads/reparaciones/logo.png'), path.join(backend, 'uploads/reparaciones/logo.png'));
  assert.equal(runtime.resolveLogoPath('/assets/logo.png'), path.join(runtime.FRONTEND_ROOT, 'assets/logo.png'));
});

test('el navegador recibe JavaScript compilado y conserva archivos estáticos', async () => {
  const source = fs.readFileSync(path.join(runtime.FRONTEND_ROOT, 'assets/js/utils/date.js'), 'utf8');
  const dates = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(dates.getLocalDateStr(new Date(2026, 9, 7, 12)), '2026-10-07');
  assert.equal(dates.getLocalDateStr(new Date(2026, 9, 7, 12).getTime()), '2026-10-07');
  const html = fs.readFileSync(path.join(runtime.FRONTEND_ROOT, 'index.html'), 'utf8');
  assert.match(html, /assets\/js\/app\.js/);
  assert.ok(fs.existsSync(path.join(runtime.FRONTEND_ROOT, 'assets/css/custom.css')));
  assert.ok(!fs.existsSync(path.join(runtime.FRONTEND_ROOT, '.env')));
  assert.ok(!fs.existsSync(path.join(runtime.FRONTEND_ROOT, 'assets/js/utils/date.ts')));
});

test('los PDF compilados cargan recursos desde uploads persistentes', async () => {
  const PDFDocument = require('pdfkit');
  const { loadLogoForPdf } = require('../utils/pdf-siigo-helpers');
  fs.mkdirSync(runtime.UPLOADS_ROOT, { recursive: true });
  const filename = `typescript-test-${process.pid}.png`;
  const target = path.join(runtime.UPLOADS_ROOT, filename);
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  try {
    fs.writeFileSync(target, pixel, { flag: 'wx' });
    const logo = await loadLogoForPdf(`/uploads/${filename}`);
    assert.deepEqual(logo, pixel);
    const doc = new PDFDocument();
    const chunks = [];
    const finished = new Promise((resolve, reject) => {
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', resolve);
      doc.on('error', reject);
    });
    doc.image(logo, 20, 20, { width: 10 }).text('Verificación TypeScript', 20, 40);
    doc.end();
    await finished;
    assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), '%PDF-');
  } finally {
    fs.unlinkSync(target);
  }
});

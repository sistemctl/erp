import path = require('node:path');

// Tanto backend/utils como backend/dist/utils apuntan a los mismos datos persistentes.
const codeRoot = path.resolve(__dirname, '..');
const compiled = path.basename(codeRoot) === 'dist';
const BACKEND_ROOT = compiled ? path.dirname(codeRoot) : codeRoot;
const PROJECT_ROOT = path.dirname(BACKEND_ROOT);
const FRONTEND_ROOT = path.join(PROJECT_ROOT, 'frontend', ...(compiled ? ['dist'] : []));
const UPLOADS_ROOT = path.join(BACKEND_ROOT, 'uploads');
const ENV_PATH = path.join(BACKEND_ROOT, '.env');

function resolveLogoPath(logoUrl: string): string {
  if (logoUrl.startsWith('/uploads/')) return path.join(BACKEND_ROOT, logoUrl);
  if (logoUrl.startsWith('/')) return path.join(FRONTEND_ROOT, logoUrl.replace(/^\//, ''));
  return path.isAbsolute(logoUrl) ? logoUrl : path.join(BACKEND_ROOT, logoUrl);
}

export = { BACKEND_ROOT, PROJECT_ROOT, FRONTEND_ROOT, UPLOADS_ROOT, ENV_PATH, resolveLogoPath };

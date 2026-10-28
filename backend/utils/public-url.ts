import type { Request } from 'express';
type PublicRequest = Pick<Request, 'get' | 'protocol' | 'app'>;
const TUNNEL_HOST_PATTERNS = [
  /\.trycloudflare\.com$/i,
  /\.cfargotunnel\.com$/i,
  /\.cloudflareaccess\.com$/i
];

function getExtraOrigins() {
  const fromCors = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const fromPublic = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromPublic && !fromCors.includes(fromPublic)) {
    fromCors.push(fromPublic);
  }
  return fromCors;
}

function isLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

/** Redes privadas RFC1918 — acceso LAN sin dominio local */
function isPrivateLanOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function isTunnelHostname(hostname: string | null | undefined) {
  if (!hostname) return false;
  return TUNNEL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function isAllowedCorsOrigin(origin: string | null | undefined) {
  if (!origin) return true;
  if (isLocalOrigin(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && isPrivateLanOrigin(origin)) return true;

  try {
    const { hostname, origin: parsedOrigin } = new URL(origin);
    if (isTunnelHostname(hostname)) return true;
    return getExtraOrigins().includes(parsedOrigin) || getExtraOrigins().includes(origin);
  } catch {
    return getExtraOrigins().includes(origin);
  }
}

export function getPublicOrigin(req?: PublicRequest | null) {
  const fromEnv = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (!req?.get) return null;

  const forwardedHost = req.get('x-forwarded-host');
  const host = (forwardedHost || req.get('host') || '').split(',')[0].trim();
  if (!host) return null;

  const hostname = host.split(':')[0];
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${host}`;
}

export function buildPublicAppUrl(req?: PublicRequest | null, path = '') {
  const origin = getPublicOrigin(req);
  const port = parseInt(String(req?.app?.get?.('puertoActivo')), 10)
    || parseInt(String(process.env.PORT), 10)
    || 3000;
  const base = origin || `http://localhost:${port}`;
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}


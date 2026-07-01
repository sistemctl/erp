const TUNNEL_HOST_PATTERNS = [
  /\.trycloudflare\.com$/i,
  /\.cfargotunnel\.com$/i,
  /\.cloudflareaccess\.com$/i
];

function getExtraOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function isTunnelHostname(hostname) {
  if (!hostname) return false;
  return TUNNEL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (isLocalOrigin(origin)) return true;

  try {
    const { hostname, origin: parsedOrigin } = new URL(origin);
    if (isTunnelHostname(hostname)) return true;
    return getExtraOrigins().includes(parsedOrigin) || getExtraOrigins().includes(origin);
  } catch {
    return getExtraOrigins().includes(origin);
  }
}

function getPublicOrigin(req) {
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

function buildPublicAppUrl(req, path = '') {
  const origin = getPublicOrigin(req);
  const port = parseInt(req?.app?.get?.('puertoActivo'), 10)
    || parseInt(process.env.PORT, 10)
    || 3000;
  const base = origin || `http://localhost:${port}`;
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

module.exports = {
  isAllowedCorsOrigin,
  getPublicOrigin,
  buildPublicAppUrl,
  isTunnelHostname
};

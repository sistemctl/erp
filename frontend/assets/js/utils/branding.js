/**
 * Marca, favicon y caché local — rutas relativas al origen actual (independiente del puerto).
 */

export function resolveAssetUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/')) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/assets/')) {
        return parsed.pathname;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export function updateFavicon(logoUrl) {
  let link = document.getElementById('app-favicon') || document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  const resolved = resolveAssetUrl(logoUrl);
  if (resolved) {
    const bust = encodeURIComponent(resolved);
    link.href = `${resolved}${resolved.includes('?') ? '&' : '?'}v=${bust}`;
    link.type = resolved.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  } else {
    link.href = '/assets/img/app-favicon.svg';
    link.type = 'image/svg+xml';
  }
}

export function applyDocumentBranding({ empresa, logoUrl } = {}) {
  const normalizedLogo = resolveAssetUrl(logoUrl);
  const name = (empresa || 'ERP').trim() || 'ERP';

  document.title = `${name} - ERP`;
  updateFavicon(normalizedLogo);

  try {
    localStorage.setItem('erp-brand', JSON.stringify({
      empresa: name,
      logoUrl: normalizedLogo
    }));
  } catch (_) { /* quota */ }

  return { empresa: name, logoUrl: normalizedLogo };
}

export function getCachedBrand() {
  try {
    const raw = localStorage.getItem('erp-brand');
    if (!raw) return { empresa: 'ERP', logoUrl: null };
    const parsed = JSON.parse(raw);
    return {
      empresa: parsed.empresa || 'ERP',
      logoUrl: resolveAssetUrl(parsed.logoUrl)
    };
  } catch {
    return { empresa: 'ERP', logoUrl: null };
  }
}

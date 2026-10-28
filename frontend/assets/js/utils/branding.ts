/**
 * Marca, favicon y caché local — rutas relativas al origen actual (independiente del puerto).
 */

export interface Brand { empresa: string; logoUrl: string | null; }
export function resolveAssetUrl(url: unknown): string | null {
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

export function updateFavicon(logoUrl: unknown): void {
  let link = document.querySelector<HTMLLinkElement>('link#app-favicon, link[rel="icon"]');
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

export function applyDocumentBranding({ empresa, logoUrl }: Partial<Brand> = {}): Brand {
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

export function getCachedBrand(): Brand {
  try {
    const raw = localStorage.getItem('erp-brand');
    if (!raw) return { empresa: 'ERP', logoUrl: null };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { empresa: 'ERP', logoUrl: null };
    return {
      empresa: 'empresa' in parsed && typeof parsed.empresa === 'string' ? parsed.empresa || 'ERP' : 'ERP',
      logoUrl: resolveAssetUrl('logoUrl' in parsed ? parsed.logoUrl : null)
    };
  } catch {
    return { empresa: 'ERP', logoUrl: null };
  }
}

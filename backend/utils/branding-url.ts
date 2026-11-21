/**
 * Normaliza URLs de assets locales para que sobrevivan cambios de puerto.
 */
export function normalizeLogoUrl(logoUrl: unknown): string | null {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  const trimmed = logoUrl.trim();
  if (!trimmed) return null;

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

  if (trimmed.startsWith('/')) return trimmed;
  return trimmed;
}


/** Denylist en memoria para JWT revocados (logout). Se limpia al expirar. */
const denied = new Map<string, number>();

export function denyToken(token: string | null | undefined, expiresAtMs?: number | string | null) {
  if (!token) return;
  const exp = Number(expiresAtMs) || (Date.now() + 8 * 60 * 60 * 1000);
  denied.set(token, exp);
}

export function isDenied(token: string | null | undefined) {
  if (!token) return false;
  const exp = denied.get(token);
  if (!exp) return false;
  if (Date.now() >= exp) {
    denied.delete(token);
    return false;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of denied.entries()) {
    if (now >= exp) denied.delete(token);
  }
}, 60 * 60 * 1000).unref?.();


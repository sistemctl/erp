/** Denylist en memoria para JWT revocados (logout). Se limpia al expirar. */
const denied = new Map();

function denyToken(token, expiresAtMs) {
  if (!token) return;
  const exp = Number(expiresAtMs) || (Date.now() + 8 * 60 * 60 * 1000);
  denied.set(token, exp);
}

function isDenied(token) {
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

module.exports = { denyToken, isDenied };

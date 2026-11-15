const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/** Escapa texto para insertarlo de forma segura dentro de HTML o de un atributo entre comillas. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] || char);
}

/** Solo permite enlaces internos (#/... o /...) o http(s); cualquier otro esquema (javascript:, data:) se descarta. */
export function safeHref(value: unknown, fallback = '#'): string {
  const href = String(value ?? '').trim();
  if (!href) return fallback;
  if (href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//'))) return escapeHtml(href);
  if (/^https?:\/\//i.test(href)) return escapeHtml(href);
  return fallback;
}

/** Descarga un archivo de la API enviando el token de sesión (los enlaces <a href> no lo envían). */
export async function downloadAuthenticatedFile(url: string, filename: string): Promise<void> {
  const token = localStorage.getItem('token');
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) {
    let message = 'No se pudo descargar el archivo.';
    try {
      const data = await response.json() as { error?: string };
      if (data?.error) message = data.error;
    } catch { /* respuesta no JSON */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}

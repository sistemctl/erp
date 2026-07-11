import { resolveAssetUrl } from '../utils/branding.js';

const ESTADO_STEPS = [
  { key: 'recibido', label: 'Recibido' },
  { key: 'diagnostico', label: 'Diagnóstico' },
  { key: 'en_reparacion', label: 'Reparación' },
  { key: 'listo', label: 'Listo' },
  { key: 'entregado', label: 'Entregado' }
];

const ESTADO_ORDER = {
  recibido: 0,
  diagnostico: 1,
  en_reparacion: 2,
  listo: 3,
  entregado: 4,
  cancelado: -1
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return '—';
  }
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(n);
}

function parseNumeroFromLocation(rawHash = window.location.hash) {
  // Preferir ruta /r/OR-xxx o /seguimiento/OR-xxx (sobrevive al escaneo QR)
  const pathname = window.location.pathname || '';
  const pathMatch = pathname.match(/^\/(?:r|seguimiento)\/([^/]+)\/?$/i);
  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1]).trim();
    } catch {
      return pathMatch[1].trim();
    }
  }

  const searchParams = new URLSearchParams(window.location.search || '');
  const fromQuery = (searchParams.get('orden') || '').trim();
  if (fromQuery) return fromQuery;

  const path = (rawHash || '').split('?')[0] || '';
  const match = path.match(/^#\/seguimiento\/(.+)$/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
  const hashParams = new URLSearchParams((rawHash || '').includes('?') ? rawHash.split('?')[1] : '');
  return (hashParams.get('orden') || hashParams.get('buscar') || '').trim();
}

/** True si la URL actual es seguimiento público (ruta, query o hash). */
export function isPublicSeguimientoLocation(rawHash = window.location.hash) {
  const pathname = window.location.pathname || '';
  if (/^\/(?:r|seguimiento)(?:\/|$)/i.test(pathname)) return true;
  const searchParams = new URLSearchParams(window.location.search || '');
  if (searchParams.get('orden') && (pathname === '/' || pathname === '/index.html')) return true;
  const hash = (rawHash || '').split('?')[0] || '';
  return hash === '#/seguimiento' || hash.startsWith('#/seguimiento/');
}

function renderTimeline(estado) {
  if (estado === 'cancelado') {
    return `
      <div class="track-timeline track-timeline--cancelled">
        <div class="track-timeline__cancelled">
          <i class="ti ti-ban" aria-hidden="true"></i>
          Esta reparación fue cancelada
        </div>
      </div>
    `;
  }

  const current = ESTADO_ORDER[estado] ?? 0;
  return `
    <ol class="track-timeline" aria-label="Progreso de la reparación">
      ${ESTADO_STEPS.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        const cls = done ? 'is-done' : active ? 'is-active' : '';
        return `
          <li class="track-timeline__step ${cls}">
            <span class="track-timeline__dot" aria-hidden="true"></span>
            <span class="track-timeline__label">${step.label}</span>
          </li>
        `;
      }).join('')}
    </ol>
  `;
}

export async function initSeguimientoReparacion(container, rawHash = window.location.hash) {
  const numero = parseNumeroFromLocation(rawHash);
  const colorScheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-bs-theme', colorScheme);
  container.className = 'track-page-wrap';

  if (!numero) {
    container.innerHTML = `
      <div class="track-page">
        <div class="track-card track-card--error">
          <i class="ti ti-qrcode-off" aria-hidden="true"></i>
          <h1>Código incompleto</h1>
          <p>Escanea de nuevo la etiqueta QR de tu orden de reparación.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="track-page">
      <div class="track-card track-card--loading">
        <div class="spinner-border text-primary" role="status"></div>
        <p>Consultando orden <strong>${escapeHtml(numero)}</strong>…</p>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`/api/public/reparaciones/${encodeURIComponent(numero)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo consultar la reparación.');
    }

    const logoUrl = resolveAssetUrl(data.logoUrl);
    const equipo = [data.equipo?.tipo, data.equipo?.marca, data.equipo?.modelo]
      .filter(Boolean)
      .join(' ');
    const totalLabel = data.estado === 'entregado'
      ? formatMoney(data.totalCobrado)
      : formatMoney(data.totalEstimado);

    document.title = `${data.numeroOrden} · ${data.empresa || 'Seguimiento'}`;

    container.innerHTML = `
      <div class="track-page">
        <header class="track-brand">
          ${logoUrl
            ? `<img src="${escapeHtml(logoUrl)}" alt="" class="track-brand__logo">`
            : `<span class="track-brand__mark"><i class="ti ti-tool" aria-hidden="true"></i></span>`}
          <div>
            <div class="track-brand__name">${escapeHtml(data.empresa || 'Servicio técnico')}</div>
            <div class="track-brand__kicker">Seguimiento de reparación</div>
          </div>
        </header>

        <article class="track-card">
          <div class="track-card__head">
            <div>
              <p class="track-card__eyebrow">Orden</p>
              <h1 class="track-card__title">${escapeHtml(data.numeroOrden)}</h1>
            </div>
            <span class="track-status track-status--${escapeHtml(data.estado)}">${escapeHtml(data.estadoLabel)}</span>
          </div>

          ${renderTimeline(data.estado)}

          <dl class="track-facts">
            <div>
              <dt>Equipo</dt>
              <dd>${escapeHtml(equipo || '—')}</dd>
            </div>
            ${data.equipo?.imeiMasked ? `
            <div>
              <dt>IMEI / Serial</dt>
              <dd class="font-monospace">${escapeHtml(data.equipo.imeiMasked)}</dd>
            </div>` : ''}
            ${data.clienteNombre ? `
            <div>
              <dt>Cliente</dt>
              <dd>${escapeHtml(data.clienteNombre)}</dd>
            </div>` : ''}
            ${data.sedeNombre ? `
            <div>
              <dt>Sede</dt>
              <dd>${escapeHtml(data.sedeNombre)}</dd>
            </div>` : ''}
            <div>
              <dt>Ingreso</dt>
              <dd>${formatDate(data.fechaIngreso)}</dd>
            </div>
            <div>
              <dt>Entrega estimada</dt>
              <dd>${formatDate(data.fechaEstimadaEntrega)}</dd>
            </div>
          </dl>

          <section class="track-note">
            <h2>Problema reportado</h2>
            <p>${escapeHtml(data.problemaReportado || '—')}</p>
          </section>

          ${data.diagnostico ? `
          <section class="track-note">
            <h2>Diagnóstico</h2>
            <p>${escapeHtml(data.diagnostico)}</p>
          </section>` : ''}

          ${totalLabel ? `
          <div class="track-total">
            <span>${data.estado === 'entregado' ? 'Total cobrado' : 'Total a cobrar'}</span>
            <strong>${totalLabel}</strong>
          </div>` : ''}

          ${data.diasGarantia ? `
          <p class="track-guarantee">Garantía: ${escapeHtml(data.diasGarantia)} días</p>
          ` : ''}

          <p class="track-updated">Actualizado ${formatDate(data.actualizadoEn)}</p>
        </article>

        <p class="track-footer">Escanea el QR de tu etiqueta para volver a consultar el estado.</p>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="track-page">
        <div class="track-card track-card--error">
          <i class="ti ti-alert-circle" aria-hidden="true"></i>
          <h1>No encontrado</h1>
          <p>${escapeHtml(err.message || 'No pudimos cargar esta reparación.')}</p>
          <p class="track-card__hint">Orden: <strong>${escapeHtml(numero)}</strong></p>
        </div>
      </div>
    `;
  }
}

export const EMAIL_PREVIEW_SAMPLE = {
  cliente: 'María González',
  equipo: 'iPhone 14 Pro',
  sede: 'CR 7 H 34-51',
  orden: 'REP-000042',
  total: '$ 350.000',
  factura: 'FE-000016',
  empresa: 'Servitec Gamers'
};

const PREVIEW_TYPES = [
  { id: 'factura', label: 'Factura PDF' },
  { id: 'recibido', label: 'Reparación · Recibido' },
  { id: 'listo', label: 'Reparación · Listo' },
  { id: 'entregado', label: 'Reparación · Entregado' }
];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderPlantilla(template, vars) {
  let result = template || '';
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val ?? '');
  }
  return result;
}

function getField(id) {
  return document.getElementById(id)?.value?.trim() ?? '';
}

function getPreviewVars() {
  const empresa = getField('cfg-empresa') || getField('cfg-smtp-from-name') || EMAIL_PREVIEW_SAMPLE.empresa;
  const sede = getField('cfg-direccion') || EMAIL_PREVIEW_SAMPLE.sede;
  return { ...EMAIL_PREVIEW_SAMPLE, empresa, sede };
}

function getPreviewContent(type, vars) {
  if (type === 'factura') {
    return {
      subject: renderPlantilla(getField('cfg-tpl-email-factura-asunto') || 'Factura {factura} — {empresa}', vars),
      body: renderPlantilla(getField('cfg-tpl-email-factura-cuerpo') || 'Estimado/a {cliente},\n\nAdjuntamos la factura {factura}.', vars),
      attachment: `factura_${vars.factura}.pdf`,
      channel: 'Correo con PDF adjunto'
    };
  }

  const tplMap = {
    recibido: 'cfg-tpl-recibido',
    listo: 'cfg-tpl-listo',
    entregado: 'cfg-tpl-entregado'
  };
  const defaults = {
    recibido: 'Hola {cliente}, recibimos tu {equipo} en {sede} bajo la orden #{orden}.',
    listo: 'Hola {cliente}, tu {equipo} (orden #{orden}) ya está listo en {sede}. Total: {total}.',
    entregado: 'Hola {cliente}, se entregó tu {equipo} (orden #{orden}). ¡Gracias!'
  };

  const body = renderPlantilla(getField(tplMap[type]) || defaults[type], vars);
  return {
    subject: `${vars.empresa} — Orden ${vars.orden}`,
    body,
    attachment: null,
    channel: 'Correo de reparación'
  };
}

export function renderNotificacionEmailPreviewHtml() {
  const typeButtons = PREVIEW_TYPES.map((t, i) => `
    <button type="button" class="email-preview-type${i === 0 ? ' is-active' : ''}" data-email-preview-type="${t.id}">
      ${t.label}
    </button>
  `).join('');

  return `
    <div class="email-preview-panel sticky-top" style="top: 5rem;">
      <h4 class="text-secondary mb-1"><i class="ti ti-eye me-1"></i> Vista previa en vivo</h4>
      <p class="email-preview-mode-label small mb-3" id="email-preview-mode-label">Correo de factura con PDF</p>

      <div class="email-preview-type-tabs" role="tablist" aria-label="Tipo de correo a previsualizar">
        ${typeButtons}
      </div>

      <div class="email-preview-mock" id="email-preview-mock">
        <div class="email-preview-toolbar">
          <span class="email-preview-dot email-preview-dot--red"></span>
          <span class="email-preview-dot email-preview-dot--yellow"></span>
          <span class="email-preview-dot email-preview-dot--green"></span>
          <span class="email-preview-toolbar-title">Bandeja de entrada</span>
        </div>
        <div class="email-preview-meta">
          <div class="email-preview-meta-row">
            <span class="email-preview-meta-label">De</span>
            <span class="email-preview-meta-value" id="email-preview-from">—</span>
          </div>
          <div class="email-preview-meta-row">
            <span class="email-preview-meta-label">Para</span>
            <span class="email-preview-meta-value" id="email-preview-to">cliente@ejemplo.com</span>
          </div>
          <div class="email-preview-meta-row">
            <span class="email-preview-meta-label">Asunto</span>
            <span class="email-preview-meta-value email-preview-meta-value--subject" id="email-preview-subject">—</span>
          </div>
        </div>
        <div class="email-preview-body" id="email-preview-body">—</div>
        <div class="email-preview-attachments" id="email-preview-attachments" hidden>
          <div class="email-preview-attachment">
            <i class="ti ti-file-type-pdf" aria-hidden="true"></i>
            <span id="email-preview-attachment-name">factura.pdf</span>
          </div>
        </div>
      </div>

      <p class="text-secondary small mt-3 mb-0">
        Los cambios en plantillas y remitente se reflejan al instante. Los datos del cliente son de ejemplo.
      </p>
    </div>
  `;
}

let activePreviewType = 'factura';

export function syncNotificacionEmailPreview() {
  const vars = getPreviewVars();
  const content = getPreviewContent(activePreviewType, vars);
  const fromName = getField('cfg-smtp-from-name') || vars.empresa;
  const fromEmail = getField('cfg-smtp-from-email') || getField('cfg-smtp-user') || 'ventas@empresa.com';

  const fromEl = document.getElementById('email-preview-from');
  const subjectEl = document.getElementById('email-preview-subject');
  const bodyEl = document.getElementById('email-preview-body');
  const attachWrap = document.getElementById('email-preview-attachments');
  const attachName = document.getElementById('email-preview-attachment-name');
  const modeLabel = document.getElementById('email-preview-mode-label');

  if (!fromEl || !subjectEl || !bodyEl) return;

  fromEl.textContent = `${fromName} <${fromEmail}>`;
  subjectEl.textContent = content.subject;
  bodyEl.innerHTML = escapeHtml(content.body).replace(/\n/g, '<br>');

  if (content.attachment && attachWrap && attachName) {
    attachWrap.hidden = false;
    attachName.textContent = content.attachment;
  } else if (attachWrap) {
    attachWrap.hidden = true;
  }

  if (modeLabel) {
    modeLabel.textContent = content.channel;
  }
}

export function initNotificacionEmailPreview() {
  const form = document.getElementById('form-config-twilio');
  if (!form) return;

  form.querySelectorAll('[data-email-preview-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      activePreviewType = btn.dataset.emailPreviewType;
      form.querySelectorAll('[data-email-preview-type]').forEach(b => {
        b.classList.toggle('is-active', b === btn);
      });
      syncNotificacionEmailPreview();
    });
  });

  const onChange = () => syncNotificacionEmailPreview();
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  document.getElementById('cfg-empresa')?.addEventListener('input', onChange);
  document.getElementById('cfg-direccion')?.addEventListener('input', onChange);

  syncNotificacionEmailPreview();
}

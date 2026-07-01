const ACTION_META = {
  view: { icon: 'ti-eye', label: 'Ver' },
  return: { icon: 'ti-arrow-back', label: 'Devolver' },
  edit: { icon: 'ti-pencil', label: 'Editar' },
  delete: { icon: 'ti-trash', label: 'Eliminar' },
  pdf: { icon: 'ti-file-text', label: 'PDF' },
  recv: { icon: 'ti-package-import', label: 'Recibir' },
  pay: { icon: 'ti-cash', label: 'Abonar' },
  anular: { icon: 'ti-ban', label: 'Anular' },
  unlink: { icon: 'ti-user-x', label: 'Desvincular' },
  chart: { icon: 'ti-chart-pie', label: 'Ver' },
  label: { icon: 'ti-barcode', label: 'Etiqueta' },
};

function escapeAttr(value) {
  return String(value ?? '').replace(/"/g, '&quot;');
}

/**
 * Botón de acción con icono + texto (estilo Ver / Devolver).
 */
export function erpAction(variant, options = {}) {
  const meta = ACTION_META[variant] || { icon: 'ti-dots', label: variant };
  const {
    label = meta.label,
    icon = meta.icon,
    className = '',
    attrs = {},
    type = 'button',
    title = label,
  } = options;

  const attrStr = Object.entries({ title, ...attrs })
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(' ');

  return `<button type="${type}" class="erp-action-btn erp-action-btn--${variant}${className ? ` ${className}` : ''}" ${attrStr}>
    <i class="ti ${icon}" aria-hidden="true"></i><span>${label}</span>
  </button>`;
}

/** Contenedor vertical/horizontal para acciones en tablas */
export function erpActions(buttonsHtml) {
  return `<div class="erp-actions">${buttonsHtml}</div>`;
}

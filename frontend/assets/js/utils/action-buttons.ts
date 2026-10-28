const ACTION_META = {
  view: { icon: 'ti-eye', label: 'Ver' },
  return: { icon: 'ti-arrow-back', label: 'Devolver' },
  edit: { icon: 'ti-pencil', label: 'Editar' },
  delete: { icon: 'ti-trash', label: 'Eliminar' },
  pdf: { icon: 'ti-file-text', label: 'PDF' },
  mail: { icon: 'ti-mail', label: 'Enviar' },
  recv: { icon: 'ti-package-import', label: 'Recibir' },
  pay: { icon: 'ti-cash', label: 'Abonar' },
  anular: { icon: 'ti-ban', label: 'Anular' },
  unlink: { icon: 'ti-user-x', label: 'Desvincular' },
  chart: { icon: 'ti-chart-pie', label: 'Ver' },
  label: { icon: 'ti-barcode', label: 'Etiqueta' },
};

function escapeAttr(value: unknown): string {
  return String(value ?? '').replace(/"/g, '&quot;');
}

/**
 * Botón de acción con icono + texto (estilo Ver / Devolver).
 */
interface ActionOptions { label?: string; icon?: string; className?: string; attrs?: Record<string, string | number | boolean | null | undefined>; type?: 'button' | 'submit' | 'reset'; title?: string; }
export function erpAction(variant: string, options: ActionOptions = {}): string {
  const meta = Object.hasOwn(ACTION_META, variant) ? ACTION_META[variant as keyof typeof ACTION_META] : { icon: 'ti-dots', label: variant };
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
export function erpActions(buttonsHtml: string): string {
  return `<div class="erp-actions">${buttonsHtml}</div>`;
}

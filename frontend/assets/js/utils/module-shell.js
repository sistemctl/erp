/**
 * Kit de módulo canónico:
 * erpHeader → erp-list-workspace(erp-filter-card → erp-table-panel)
 * (ver comentarios en custom.css sección ERP Module)
 */

export function erpHeader({ eyebrow, title, subtitle = '', actionsHtml = '', titleId = '', subId = '' }) {
  const titleAttr = titleId ? ` id="${titleId}"` : '';
  const subAttr = subId ? ` id="${subId}"` : '';
  const actions = actionsHtml
    ? `<div class="erp-header__actions d-print-none">${actionsHtml}</div>`
    : '';

  return `
    <header class="erp-header d-print-none">
      <div class="erp-header__main">
        ${eyebrow ? `<div class="erp-header__eyebrow">${eyebrow}</div>` : ''}
        <h1 class="erp-header__title"${titleAttr}>${title}</h1>
        ${subtitle ? `<p class="erp-header__sub"${subAttr}>${subtitle}</p>` : ''}
      </div>
      ${actions}
    </header>
  `;
}

/** Filtros de listado — siempre dentro de .erp-filter-card */
export function erpFilterCard(innerHtml, { className = 'mb-3' } = {}) {
  return `<div class="card ${className} erp-filter-card d-print-none"><div class="card-body">${innerHtml}</div></div>`;
}

/** Contenedor de tabla — .erp-table-panel sin striped */
export function erpTablePanel(tableOrInnerHtml) {
  const inner = tableOrInnerHtml.includes('<table')
    ? `<div class="table-responsive">${tableOrInnerHtml}</div>`
    : tableOrInnerHtml;
  return `<div class="card erp-table-panel">${inner}</div>`;
}

/** Botón Filtrar con texto + icono (no icon-only) */
export function erpFilterSubmitBtn(label = 'Filtrar', { fullWidth = true } = {}) {
  const w = fullWidth ? ' w-100' : '';
  return `<button type="submit" class="btn btn-primary erp-filter-submit${w}"><i class="ti ti-filter me-1"></i>${label}</button>`;
}

/**
 * Estado vacío reutilizable para listados.
 * @param {{ title?: string, description?: string, icon?: string, actionHtml?: string }} opts
 */
export function erpEmptyState({
  title = 'Sin resultados',
  description = 'Ajusta los filtros o crea un registro nuevo.',
  icon = 'ti-search-off',
  actionHtml = ''
} = {}) {
  return `
    <div class="erp-empty-state" role="status">
      <span class="erp-empty-state__icon" aria-hidden="true"><i class="ti ${icon}"></i></span>
      <p class="erp-empty-state__title">${title}</p>
      ${description ? `<p class="erp-empty-state__desc">${description}</p>` : ''}
      ${actionHtml ? `<div class="erp-empty-state__action">${actionHtml}</div>` : ''}
    </div>
  `;
}

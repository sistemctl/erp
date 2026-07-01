/**
 * Plantillas compartidas para cabeceras de módulo (estilo dashboard / compras).
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

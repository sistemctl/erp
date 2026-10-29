import { costoPorMetro, inventoryQuantity, moneyCents, moneyText } from './compra-unidad.js';
import type { ProductoDTO } from '../../../../shared/contracts.js';

/** Preview only. The cart and purchase API receive meters and price per meter. */
export function mountRolloCalculator(cost: HTMLInputElement, quantity: HTMLInputElement, host: HTMLElement) {
  const panel = document.createElement('div');
  panel.className = 'oc-rollo-calculator'; panel.hidden = true;
  const prefix = `${cost.id}-rollo`;
  panel.innerHTML = `<label class="form-label" for="${prefix}-modo">Forma de ingresar el costo</label>
    <select id="${prefix}-modo" class="form-select"><option value="unidad">Costo por metro</option><option value="rollo">Costo total del rollo</option></select>
    <div data-rollo-fields hidden class="row g-2 mt-1">
      <div class="col-12"><label class="form-label" for="${prefix}-total">Costo total de un rollo ($ COP)</label><input id="${prefix}-total" class="form-control" type="number" min="0.01" step="0.01" inputmode="decimal"></div>
      <div class="col-7"><label class="form-label" for="${prefix}-metros">Metros por rollo</label><input id="${prefix}-metros" class="form-control" type="number" min="1" step="1" inputmode="numeric"></div>
      <div class="col-5"><label class="form-label" for="${prefix}-cantidad">Rollos</label><input id="${prefix}-cantidad" class="form-control" type="number" min="1" step="1" value="1" inputmode="numeric"></div>
      <p class="col-12 small mb-0" data-rollo-preview role="status" aria-live="polite"></p>
    </div>`;
  const composeFields = host.querySelector(':scope > .oc-product-modal__compose-fields');
  if (composeFields) host.insertBefore(panel, composeFields); else host.append(panel);
  const mode = panel.querySelector('select')!;
  const total = panel.querySelector<HTMLInputElement>(`#${prefix}-total`)!;
  const meters = panel.querySelector<HTMLInputElement>(`#${prefix}-metros`)!;
  const rolls = panel.querySelector<HTMLInputElement>(`#${prefix}-cantidad`)!;
  const fields = panel.querySelector<HTMLElement>('[data-rollo-fields]')!;
  const preview = panel.querySelector<HTMLElement>('[data-rollo-preview]')!;
  const money = (value: string) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2 }).format(Number(value));
  const update = () => {
    const active = mode.value === 'rollo'; fields.hidden = !active; cost.readOnly = active; quantity.readOnly = active;
    if (!active) return;
    try {
      const result = costoPorMetro(total.value, meters.value), count = inventoryQuantity(rolls.value);
      cost.value = result.costoPorMetro; quantity.value = String(inventoryQuantity(result.metros * count));
      const amount = moneyText(moneyCents(result.costoPorMetro) * BigInt(quantity.value));
      preview.textContent = `Se guardarán ${quantity.value} m a ${money(result.costoPorMetro)}/m. Total calculado: ${money(amount)}.${result.diferenciaCentavos ? ' El costo por metro está redondeado a 2 decimales; el total calculado puede diferir del costo del rollo.' : ''}`;
      preview.className = 'col-12 small mb-0 text-secondary';
    } catch (error) { cost.value = ''; quantity.value = ''; preview.textContent = error instanceof Error ? error.message : 'Complete los datos del rollo.'; preview.className = 'col-12 small mb-0 text-danger'; }
  };
  mode.addEventListener('change', update);
  for (const field of [total, meters, rolls]) field.addEventListener('input', update);
  return {
    selectProduct(product: ProductoDTO | null) {
      panel.hidden = product?.unidadMedida !== 'm'; mode.value = 'unidad'; total.value = ''; meters.value = ''; rolls.value = '1'; fields.hidden = true; cost.readOnly = false; quantity.readOnly = false;
      const costLabel = cost.labels?.[0]; if (costLabel) costLabel.textContent = product?.unidadMedida === 'm' ? 'Costo por metro ($/m)' : 'Costo unitario';
      const quantityLabel = quantity.labels?.[0]; if (quantityLabel) quantityLabel.textContent = product?.unidadMedida === 'm' ? 'Cantidad (m)' : 'Cantidad (und)';
    }
  };
}

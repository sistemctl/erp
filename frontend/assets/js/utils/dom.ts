/** Elementos obligatorios de una vista: comprueba existencia y tipo sin aserciones. */
export function requireElement<T extends HTMLElement>(id: string, kind: { new(): T }, root: Document | Element = document): T {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof kind)) throw new Error(`No se encontró el elemento esperado: ${id}`);
  return element;
}

/** Campos que pueden ser un selector o un input oculto según el rol. */
export function requireField(id: string, root: Document | Element = document): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`No se encontró el campo esperado: ${id}`);
  }
  return element;
}

export function requireSelector<T extends Element>(selector: string, kind: { new(): T }, root: Document | Element = document): T {
  const element = root.querySelector(selector);
  if (!(element instanceof kind)) throw new Error(`No se encontró el elemento esperado: ${selector}`);
  return element;
}

export function eventField(event: Event): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const element = event.currentTarget || event.target;
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) throw new Error('El evento no proviene de un campo.');
  return element;
}

export function eventElement(event: Event): Element {
  if (!(event.target instanceof Element)) throw new Error('El evento no proviene de un elemento.');
  return event.target;
}

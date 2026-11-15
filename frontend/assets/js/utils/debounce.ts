/** Ejecuta `fn` cuando dejan de llegar llamadas durante `ms` (p. ej. al terminar de escribir). */
export function debounce<A extends unknown[]>(fn: (...args: A) => unknown, ms = 250): ((...args: A) => void) & { flush(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | null = null;
  const run = () => {
    timer = undefined;
    const args = lastArgs;
    lastArgs = null;
    if (args) void fn(...args);
  };
  const debounced = (...args: A) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  debounced.flush = () => { if (timer !== undefined) { clearTimeout(timer); run(); } };
  debounced.cancel = () => { clearTimeout(timer); timer = undefined; lastArgs = null; };
  return debounced;
}

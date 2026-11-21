/** Scroll only the navigation rail; never move the module's document or form. */
export function revealMobileModule(rail: HTMLElement | null): void {
  if (!rail || !rail.clientWidth) return;
  const active = rail.querySelector<HTMLElement>('[aria-current="page"]');
  if (!active) return;
  const viewport = rail.getBoundingClientRect();
  const item = active.getBoundingClientRect();
  if (item.left < viewport.left) rail.scrollLeft -= viewport.left - item.left;
  else if (item.right > viewport.right) rail.scrollLeft += item.right - viewport.right;
}

/** Shell-owned listeners survive module changes and are removed on logout. */
export function mountMobileNavigation(rail: HTMLElement): () => void {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const arrows = rail.parentElement?.querySelectorAll<HTMLButtonElement>('[data-nav-direction]');
  const update = () => {
    const maximum = rail.scrollWidth - rail.clientWidth;
    const arrowWidth = Array.from(arrows || []).reduce((width, arrow) => width + arrow.getBoundingClientRect().width, 0);
    const overflow = maximum > arrowWidth + 1;
    for (const arrow of arrows || []) {
      const previous = arrow.dataset.navDirection === '-1';
      arrow.disabled = previous ? rail.scrollLeft <= 1 : rail.scrollLeft >= maximum - 1;
      arrow.hidden = !overflow;
    }
  };
  for (const arrow of arrows || []) {
    arrow.addEventListener('click', () => {
      rail.scrollBy({ left: Number(arrow.dataset.navDirection) * Math.max(80, rail.clientWidth - 80), behavior: 'instant' });
      update();
    }, options);
  }
  rail.addEventListener('scroll', update, { ...options, passive: true });
  rail.addEventListener('focusin', event => {
    if (!(event.target instanceof HTMLElement)) return;
    const viewport = rail.getBoundingClientRect();
    const item = event.target.getBoundingClientRect();
    if (item.left < viewport.left) rail.scrollLeft -= viewport.left - item.left;
    else if (item.right > viewport.right) rail.scrollLeft += item.right - viewport.right;
    update();
  }, options);
  let resizeFrame = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { revealMobileModule(rail); update(); });
  });
  resize.observe(rail);
  update();
  return () => { controller.abort(); resize.disconnect(); cancelAnimationFrame(resizeFrame); };
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const highlights = new Map<HTMLElement, { marker: HTMLElement; geometry: string; visible: boolean }>();
const disclosures = new Map<HTMLElement, { shown: boolean; animation?: Animation }>();
let finishTabTransition: (() => void) | undefined;
let resizeFrame = 0;
const resizeObserver = new ResizeObserver(() => {
  if (!resizeFrame) resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    refreshOptionHighlights(false);
  });
});

export function showOptionTab(previous: HTMLElement | undefined, next: HTMLElement, direction: number) {
  finishTabTransition?.();
  next.hidden = false;
  next.inert = false;
  next.removeAttribute('aria-hidden');
  if (!previous) return;
  previous.inert = true;
  previous.setAttribute('aria-hidden', 'true');
  if (reducedMotion.matches) {
    previous.hidden = true;
    return;
  }
  previous.classList.add('option-tab-exiting');
  previous.style.top = `${next.offsetTop}px`;
  previous.style.maxHeight = `${next.offsetHeight}px`;
  const timing = { duration: 140, easing: 'cubic-bezier(.2, .8, .2, 1)' };
  const entering = next.animate([
    { opacity: 0, transform: `translateX(${direction * 5}px)` },
    { opacity: 1, transform: 'translateX(0)' }
  ], timing);
  const exiting = previous.animate([
    { opacity: 1, transform: 'translateX(0)' },
    { opacity: 0, transform: `translateX(${-direction * 5}px)` }
  ], timing);
  finishTabTransition = () => {
    entering.onfinish = null;
    entering.cancel();
    exiting.cancel();
    previous.hidden = true;
    previous.classList.remove('option-tab-exiting');
    previous.style.removeProperty('top');
    previous.style.removeProperty('max-height');
    finishTabTransition = undefined;
  };
  entering.onfinish = finishTabTransition;
}

export function refreshOptionHighlights(animate = true) {
  if (!highlights.size && !animate) return;
  const measurements = Array.from(document.querySelectorAll<HTMLElement>('.options-panel .segmented-control')).map(control => {
    const button = control.querySelector<HTMLElement>('button.active');
    return { control, visible: !!button?.getClientRects().length,
      x: button?.offsetLeft ?? 0, y: button?.offsetTop ?? 0,
      width: button?.offsetWidth ?? 0, height: button?.offsetHeight ?? 0 };
  });
  for (const { control, visible, x, y, width, height } of measurements) {
    let state = highlights.get(control);
    if (!state) {
      const marker = document.createElement('span');
      marker.className = 'option-selection';
      marker.setAttribute('aria-hidden', 'true');
      control.prepend(marker);
      control.classList.add('has-option-selection');
      highlights.set(control, state = { marker, geometry: '', visible: false });
      resizeObserver.observe(control);
    }
    const geometry = `${x},${y},${width},${height}`;
    if (!visible) {
      state.visible = false;
      continue;
    }
    if (geometry !== state.geometry || !state.visible) {
      const previous = getComputedStyle(state.marker).transform;
      const canAnimate = animate && state.visible && !reducedMotion.matches;
      state.marker.getAnimations().forEach(animation => animation.cancel());
      const transform = `translate(${x}px, ${y}px)`;
      state.marker.style.transform = transform;
      state.marker.style.width = `${width}px`;
      state.marker.style.height = `${height}px`;
      if (canAnimate) state.marker.animate([{ transform: previous }, { transform }], {
        duration: 150, easing: 'cubic-bezier(.2, .8, .2, 1)'
      });
      state.geometry = geometry;
    }
    state.visible = true;
  }
}

export function revealOption(element: HTMLElement, shown: boolean) {
  element.classList.add('option-dependent');
  const previous = disclosures.get(element);
  if (previous?.shown === shown) return;
  const visiblePanel = !!element.closest('.options-panel')?.getClientRects().length;
  const startStyle = getComputedStyle(element);
  const from = { height: `${element.getBoundingClientRect().height}px`, opacity: startStyle.opacity,
    paddingTop: startStyle.paddingTop, paddingBottom: startStyle.paddingBottom,
    borderTopWidth: startStyle.borderTopWidth, borderBottomWidth: startStyle.borderBottomWidth };
  previous?.animation?.cancel();
  const state: { shown: boolean; animation?: Animation } = { shown };
  disclosures.set(element, state);
  element.inert = !shown;
  element.setAttribute('aria-hidden', String(!shown));
  if (!shown && element.contains(document.activeElement)) {
    (document.activeElement as HTMLElement)?.blur();
  }
  if (!previous || !visiblePanel || reducedMotion.matches) {
    element.hidden = !shown;
    element.classList.remove('option-revealing');
    return;
  }
  element.hidden = false;
  element.classList.remove('option-revealing');
  const targetStyle = getComputedStyle(element);
  const expanded = { height: `${element.getBoundingClientRect().height}px`, opacity: '1',
    paddingTop: targetStyle.paddingTop, paddingBottom: targetStyle.paddingBottom,
    borderTopWidth: targetStyle.borderTopWidth, borderBottomWidth: targetStyle.borderBottomWidth };
  const collapsed = { height: '0px', opacity: '0', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' };
  element.classList.add('option-revealing');
  const animation = element.animate([previous.shown || previous.animation ? from : collapsed, shown ? expanded : collapsed], {
    duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)'
  });
  state.animation = animation;
  animation.onfinish = () => {
    state.animation = undefined;
    element.hidden = !state.shown;
    element.classList.remove('option-revealing');
  };
}

reducedMotion.addEventListener('change', () => {
  if (!reducedMotion.matches) return;
  finishTabTransition?.();
  for (const { marker } of highlights.values()) marker.getAnimations().forEach(animation => animation.finish());
  for (const { animation } of disclosures.values()) animation?.finish();
});

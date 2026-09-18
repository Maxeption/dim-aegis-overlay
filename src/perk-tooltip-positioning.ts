import { autoPlacement, autoUpdate, computePosition, offset, shift } from '@floating-ui/dom';

/** Reposition expanded PressTips with DIM's positioning engine, never across the trigger. */
export function createPerkTooltipPositioning(tooltip: HTMLElement, anchor: HTMLElement, aligned: () => void) {
  let alive = true, version = 0;
  const originalVisibility = tooltip.style.visibility;
  tooltip.style.visibility = 'hidden';
  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    if (tooltip.style.visibility === 'hidden') tooltip.style.visibility = originalVisibility;
  }
  const owned = new Map<HTMLElement, Map<string, { original: string; applied: string }>>();
  let originalPlacement = tooltip.getAttribute('data-popper-placement'), appliedPlacement: string | undefined;
  function write(node: HTMLElement, property: string, value: string) {
    let properties = owned.get(node);
    if (!properties) owned.set(node, properties = new Map());
    const current = node.style.getPropertyValue(property), previous = properties.get(property);
    const original = previous && current === previous.applied ? previous.original : current;
    if (current !== value) {
      if (value) node.style.setProperty(property, value); else node.style.removeProperty(property);
    }
    properties.set(property, { original, applied: node.style.getPropertyValue(property) });
  }
  function update() {
    if (!alive || !anchor.isConnected || !tooltip.isConnected) return;
    const current = ++version;
    const strategy = getComputedStyle(tooltip).position === 'fixed' ? 'fixed' : 'absolute';
    const padding = { left:10, right:10, bottom:10,
      top:Math.max(10, (parseFloat(document.documentElement.style.getPropertyValue('--header-height')) || 0) + 5) };
    void computePosition(anchor, tooltip, {
      strategy,
      middleware: [offset(8), autoPlacement({ padding }), shift({ padding, crossAxis:false })],
    }).then(({ x, y, placement }) => {
      if (!alive || current !== version || !anchor.isConnected || !tooltip.isConnected) return;
      write(tooltip, 'left', `${x}px`); write(tooltip, 'top', `${y}px`);
      const nativePlacement = tooltip.getAttribute('data-popper-placement');
      if (appliedPlacement === undefined || nativePlacement !== appliedPlacement) originalPlacement = nativePlacement;
      if (nativePlacement !== placement) tooltip.setAttribute('data-popper-placement', placement);
      appliedPlacement = placement;
      aligned();
      reveal();
    }).catch(() => { if (alive && current === version) reveal(); });
  }
  const stop = autoUpdate(anchor, tooltip, update, { ancestorScroll:false, ancestorResize:false, animationFrame:true });
  return {
    update,
    destroy() {
      alive = false; ++version; stop();
      reveal();
      for (const [node, properties] of owned) for (const [property, state] of properties) {
        if (node.style.getPropertyValue(property) !== state.applied) continue;
        if (state.original) node.style.setProperty(property, state.original); else node.style.removeProperty(property);
      }
      if (tooltip.getAttribute('data-popper-placement') === appliedPlacement) {
        if (originalPlacement === null) tooltip.removeAttribute('data-popper-placement');
        else tooltip.setAttribute('data-popper-placement', originalPlacement);
      }
    },
  };
}

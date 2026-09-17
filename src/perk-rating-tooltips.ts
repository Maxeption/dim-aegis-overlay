import type { PerkRating } from './perk-ratings';
import { createPerkTooltipPositioning } from './perk-tooltip-positioning';

type HostValue = any;
function fiberFor(node: Element): HostValue {
  const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'));
  return key && (node as unknown as Record<string, HostValue>)[key];
}

export function tooltipPerkHash(element: HostValue, depth = 0): number | undefined {
  if (!element || depth > 6) return;
  if (typeof element === 'function') return tooltipPerkHash(element(), depth + 1);
  if (Array.isArray(element)) {
    for (const child of element) { const hash = tooltipPerkHash(child, depth + 1); if (hash) return hash; }
  }
  const props = element.props;
  const definition = props?.plug?.plugDef || props?.def;
  if (definition?.plug && Number.isInteger(definition.hash)) return definition.hash;
  return tooltipPerkHash(props?.children, depth + 1);
}

/** Resolve any native DIM perk PressTip, including popup, Armory and perk drawers. */
export function findPerkTooltipAnchor(target: Element): { anchor: HTMLElement; hash: number } | undefined {
  const generated = target.closest<HTMLElement>('[data-aegis-compare-generated][data-aegis-compare-perk-hash]');
  if (generated) return { anchor: generated, hash: Number(generated.dataset.aegisComparePerkHash) };
  let node: Element | null = target;
  for (let step = 0; node && step < 6; step++, node = node.parentElement) {
    let fiber = fiberFor(node);
    if (!fiber) continue;
    for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      const trigger = props?.triggerRef?.current;
      if (trigger instanceof HTMLElement && trigger.contains(target) && props.tooltip) {
        const hash = tooltipPerkHash(props.tooltip);
        if (hash) return { anchor: trigger, hash };
      }
    }
    break;
  }
  return undefined;
}

/** Match the actual PressTip owner, not just a tooltip with the same perk name. */
export function tooltipBelongsTo(tooltip: HTMLElement, anchor: HTMLElement): boolean {
  const key = Object.keys(tooltip).find(key => key.startsWith('__reactFiber$'));
  let fiber = key && (tooltip as unknown as Record<string, any>)[key];
  for (let depth = 0; fiber && depth < 35; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    const trigger = props?.triggerRef?.current;
    if (props?.open && props.tooltip && trigger instanceof Element &&
      (trigger.contains(anchor) || anchor.contains(trigger))) return true;
  }
  return false;
}

/** Keep DIM's border-triangle arrow aimed at its owner after our viewport shift. */
export function alignPerkTooltipArrow(tooltip: HTMLElement, anchor: HTMLElement) {
  const owned = new Map<HTMLElement, Map<string, { original: string; applied: string }>>();
  function write(node: HTMLElement, property: string, value: string) {
    let properties = owned.get(node);
    if (!properties) owned.set(node, properties = new Map());
    const current = node.style.getPropertyValue(property);
    const previous = properties.get(property);
    // A later native positioning pass becomes the new value to restore.
    const original = previous && current === previous.applied ? previous.original : current;
    if (value !== current) node.style.setProperty(property, value);
    properties.set(property, { original, applied: node.style.getPropertyValue(property) });
  }
  return {
    update() {
      const side = tooltip.dataset.popperPlacement?.split('-')[0];
      if (!side || !['top', 'bottom', 'left', 'right'].includes(side)) return;
      // PressTip renders its empty arrow last. Validate its actual triangle shape
      // instead of depending on a release hash or a beta-only class name.
      const arrow = tooltip.lastElementChild;
      if (!(arrow instanceof HTMLElement) || arrow.childNodes.length) return;
      const vertical = side === 'top' || side === 'bottom';
      const css = getComputedStyle(arrow);
      const borderWidth = parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth);
      const borderHeight = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
      if (css.position !== 'absolute' || !borderWidth || !borderHeight || Math.max(borderWidth,borderHeight)>32
        || Math.abs(vertical ? borderWidth-borderHeight*2 : borderHeight-borderWidth*2)>.2) return;
      // Placement may have flipped. Clear the old cross-axis override so the
      // new static edge comes from DIM's CSS instead of the previous placement.
      write(arrow, vertical ? 'top' : 'left', '');
      const box = arrow.getBoundingClientRect();
      const width = arrow.offsetWidth, height = arrow.offsetHeight;
      const tip = tooltip.getBoundingClientRect(), target = anchor.getBoundingClientRect();
      const scale = vertical ? box.width / width : box.height / height;
      if (!scale || !target.width || !target.height) return;
      const center = vertical ? target.left + target.width / 2 : target.top + target.height / 2;
      const current = vertical ? box.left + box.width / 2 : box.top + box.height / 2;
      const half = (vertical ? box.width : box.height) / 2;
      const min = (vertical ? tip.left : tip.top) + half + 4 * scale;
      const max = (vertical ? tip.right : tip.bottom) - half - 4 * scale;
      const inside = side === 'top' ? tip.bottom <= target.top + 1
        : side === 'bottom' ? tip.top >= target.bottom - 1
        : side === 'left' ? tip.right <= target.left + 1 : tip.left >= target.right - 1;
      // An oversized card can overlap its owner. Keep it readable without
      // displaying a pointer that falsely identifies another perk.
      const visible = inside && center >= min && center <= max;
      const originalVisibility = owned.get(arrow)?.get('visibility')?.original ?? arrow.style.visibility;
      write(arrow, 'visibility', visible ? originalVisibility : 'hidden');
      if (!visible || Math.abs(center - current) < 0.25) return;
      const property = vertical ? 'left' : 'top';
      const position = parseFloat(css.getPropertyValue(property));
      const origin = Number.isFinite(position) ? position
        : (vertical ? (box.left - tip.left) / scale - tooltip.clientLeft : (box.top - tip.top) / scale - tooltip.clientTop);
      write(arrow, property, `${origin + (center - current) / scale}px`);
    },
    destroy() {
      for (const [node, properties] of owned) for (const [property, state] of properties) {
        if (node.style.getPropertyValue(property) !== state.applied) continue;
        if (state.original) node.style.setProperty(property, state.original); else node.style.removeProperty(property);
      }
      owned.clear();
    },
  };
}

export function initPerkRatingTooltips() {
  let enabled = false;
  let labels = { rating: 'Aegis PvE perk rating', tier: '{tier} Tier', perks: 'Perks', origins: 'Origin Traits' };
  let ratings: Record<number, PerkRating> = {};
  let activeHash = 0;
  let anchor: HTMLElement | null = null;
  let tooltip: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let frame = 0;
  let arrowAlignment: ReturnType<typeof alignPerkTooltipArrow> | undefined;
  let positioning: ReturnType<typeof createPerkTooltipPositioning> | undefined;
  let signature = '';
  // These observers are active only while a rated perk is hovered/focused.
  const observer = new MutationObserver(records => {
    if (!anchor?.isConnected || records.some(record => {
      // The positioner and border correction share this arrow. Their own
      // cross-axis writes must not start a competing positioning pass.
      if (record.type === 'attributes' && record.target === tooltip?.lastElementChild) return false;
      return (
      record.target === anchor || record.target === tooltip || tooltip?.contains(record.target) ||
      (!tooltip && (record.type === 'childList' || record.attributeName === 'data-popper-placement'))
      );
    })) {
      // Decorate newly mounted cards in the mutation microtask, before paint.
      // Waiting for another animation frame exposes DIM's unexpanded position.
      cancelAnimationFrame(frame);
      update();
    }
  });
  function clearTooltip() {
    arrowAlignment?.destroy(); arrowAlignment = undefined;
    positioning?.destroy(); positioning = undefined;
    panel?.remove(); panel = null;
    tooltip = null; signature = '';
  }
  function stop() {
    observer.disconnect(); cancelAnimationFrame(frame); frame = 0;
    clearTooltip(); anchor = null;
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function update() {
    frame = 0;
    if (!enabled || !anchor?.isConnected || !ratings[activeHash]) { stop(); return; }
    if (!tooltip?.isConnected) {
      clearTooltip();
      tooltip = [...document.querySelectorAll<HTMLElement>('[data-popper-placement]')]
        .find(node => tooltipBelongsTo(node, anchor!)) || null;
      if (!tooltip) return;
      arrowAlignment = alignPerkTooltipArrow(tooltip, anchor);
    }
    const data = JSON.stringify(ratings[activeHash]);
    const nextSignature = data + JSON.stringify(labels);
    if (!panel?.isConnected || signature !== nextSignature) {
      let rating: PerkRating;
      try { rating = JSON.parse(data); } catch { stop(); return; }
      if (!/^[SABCDEF][+-]?$/.test(rating.tier) || !Number.isInteger(rating.rank) || rating.rank < 1) { stop(); return; }
      panel?.remove(); panel = document.createElement('section');
      panel.className = 'aegis-compare-rating-panel';
      panel.setAttribute('aria-label', labels.rating);
      const heading = document.createElement('div'); heading.className = 'aegis-compare-rating-heading';
      const source = document.createElement('strong'); source.textContent = 'Aegis PvE';
      const tier = document.createElement('span'); tier.className = 'aegis-compare-rating-tier';
      tier.dataset.tier = rating.tier.charAt(0); tier.textContent = labels.tier.replace('{tier}', rating.tier);
      const rank = document.createElement('span'); rank.textContent = `#${rating.rank} · ${rating.tab === 'Perks' ? labels.perks : labels.origins}`;
      heading.append(source, tier, rank); panel.append(heading);
      if (rating.analysis) { const analysis = document.createElement('p'); analysis.textContent = rating.analysis; panel.append(analysis); }
      // Keep DIM's title, description, stats, and Community Insight intact.
      const header = tooltip.querySelector('h2')?.parentElement;
      if (header?.parentElement === tooltip) header.after(panel); else tooltip.prepend(panel);
      signature = nextSignature;
    }
    // DIM may mount its customized header after the tooltip's first render.
    const header = tooltip.querySelector('h2')?.parentElement;
    if (header?.parentElement === tooltip && header.nextElementSibling !== panel) header.after(panel!);
    // The native initial measurement precedes ratings and Community Insight.
    // Recompute the whole card and arrow together; never translate over its owner.
    if (!positioning) positioning = createPerkTooltipPositioning(tooltip, anchor, () => arrowAlignment?.update());
    else positioning.update();
  }
  function enter(event: Event) {
    if (!enabled || !(event.target instanceof Element)) return;
    let next;
    try { next = findPerkTooltipAnchor(event.target); } catch { return; }
    if (!next || !ratings[next.hash] || (next.anchor === anchor && next.hash === activeHash)) return;
    stop(); anchor = next.anchor; activeHash = next.hash;
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-popper-placement', 'style'] });
    update();
  }
  function leave(event: Event) {
    const related = (event as PointerEvent | FocusEvent).relatedTarget;
    if (event.target instanceof Node && anchor?.contains(event.target) && !(related instanceof Node && anchor.contains(related))) stop();
  }
  function readData() {
    try {
      const data = JSON.parse(document.getElementById('aegis-perk-analysis-data')?.textContent || '{}');
      if (data.labels) for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
        if (typeof data.labels[key] === 'string') labels[key] = data.labels[key];
      }
      enabled = data.enabled === true; ratings = data.byHash || {};
    } catch { enabled = false; ratings = {}; }
    if (!enabled) stop(); else if (anchor) schedule();
  }
  document.addEventListener('aegis-perk-analysis-updated', readData);
  readData();
  document.addEventListener('pointerover', enter);
  document.addEventListener('pointerdown', enter);
  document.addEventListener('focusin', enter);
  document.addEventListener('pointerout', leave);
  document.addEventListener('focusout', leave);
  document.addEventListener('pointercancel', stop);
  document.addEventListener('pointerup', event => { if (event.pointerType === 'touch') stop(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') stop(); });
  document.addEventListener('scroll', stop, true);
  document.addEventListener('aegis-compare-tooltips-hide', () => {
    if (anchor?.closest('[data-aegis-compare-slot]')) stop();
  });
  window.addEventListener('resize', stop);
}

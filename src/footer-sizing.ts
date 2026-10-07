// DIM tiles retain size containment. Reserve the natural badge height explicitly
// so larger dual grades can wrap without covering the native item label.
const targets = new WeakMap<Element, HTMLElement>();
const observer = new ResizeObserver(entries => {
  for (const entry of entries) {
    const badge = entry.target as HTMLElement;
    const tile = targets.get(badge);
    if (!tile) continue;
    if (!badge.isConnected || badge.parentElement !== tile) {
      releaseFooterSize(badge);
      continue;
    }
    const height = entry.borderBoxSize[0]?.blockSize;
    if (height && tile.style.getPropertyValue('--aegis-measured-footer-height') !== `${height}px`) {
      tile.style.setProperty('--aegis-measured-footer-height', `${height}px`);
    }
  }
});

export function releaseFooterSize(badge: HTMLElement) {
  observer.unobserve(badge);
  targets.get(badge)?.style.removeProperty('--aegis-measured-footer-height');
  targets.delete(badge);
  badge.removeAttribute('data-aegis-adaptive-footer');
}

export function updateFooterSize(badge: HTMLElement, dual: boolean) {
  const tile = badge.parentElement;
  if (!dual || !tile?.matches('.item') || !badge.matches('.aegis-style-footer.aegis-badge-split:not(.aegis-color-only)')) {
    releaseFooterSize(badge);
    return;
  }
  if (targets.get(badge) === tile) return;
  releaseFooterSize(badge);
  targets.set(badge, tile);
  badge.setAttribute('data-aegis-adaptive-footer', '');
  observer.observe(badge, { box: 'border-box' });
}

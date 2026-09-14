export function measurePerkCardWidth(card: HTMLElement, minimum = 280): number {
  const perks = '.aegis-perk-row, .aegis-tooltip-perks-grid';
  const limit = Math.max(0, window.innerWidth - 28);
  if (!card.querySelector(perks)) return Math.min(minimum, limit);

  // Retain the perk layout and its padding, without letting prose determine width.
  function copyLayout(element: Element): Element | null {
    if (element.matches(perks)) return element.cloneNode(true) as Element;
    const copy = element.cloneNode(false) as Element;
    for (const child of element.children) {
      const layout = copyLayout(child);
      if (layout) copy.append(layout);
    }
    return copy.childElementCount ? copy : null;
  }

  const sample = copyLayout(card) as HTMLElement;
  sample.removeAttribute('id');
  sample.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  sample.removeAttribute('style');
  sample.classList.remove('hidden', 'aegis-auto-width', 'aegis-tooltip-auto-max-height');
  sample.classList.add('aegis-width-measure');
  sample.inert = true;
  sample.setAttribute('aria-hidden', 'true');
  document.body.append(sample);
  try {
    return Math.min(limit, Math.max(minimum, Math.ceil(sample.getBoundingClientRect().width) + 4));
  } finally {
    sample.remove();
  }
}

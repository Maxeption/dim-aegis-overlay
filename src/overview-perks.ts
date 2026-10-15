/** Read the committed native circle state without changing the inventory item. */
export function annotateOverviewPerks(popup: HTMLElement) {
  const selected: number[] = [];
  for (const svg of popup.querySelectorAll<SVGElement>('svg[viewBox="0 0 100 100"]')) {
    if (svg.closest('[data-aegis-compare-generated]')) continue;
    const control = svg.parentElement;
    if (!control) continue;
    // React updates the host control's props with its rendered PerkCircle.
    // Read that element's explicit plugged flag instead of a possibly stale
    // ancestor item or the inventory's original socket choices.
    const controlKey = Object.keys(control).find(key => key.startsWith('__reactProps$'));
    const controlProps = controlKey && (control as unknown as Record<string, any>)[controlKey];
    const pending: any[] = [controlProps?.children];
    let perk: { hash: number; selected: boolean } | undefined;
    for (let i = 0; pending.length && i < 20; i++) {
      const element = pending.shift();
      if (Array.isArray(element)) { pending.push(...element); continue; }
      const props = element?.props;
      if (props?.plug?.plugDef && typeof props.plugged === 'boolean') {
        perk = { hash: props.plug.plugDef.hash, selected: props.plugged }; break;
      }
      if (props?.children) pending.push(props.children);
    }
    if (!perk) continue;
    let button: HTMLElement | null = control.parentElement;
    for (let depth = 0; button && depth < 4; depth++, button = button.parentElement) {
      const key = Object.keys(button).find(key => key.startsWith('__reactProps$'));
      const props = key && (button as unknown as Record<string, any>)[key];
      if (!props?.onClick) continue;
      if (button.dataset.aegisOverviewPerkHash !== String(perk.hash)) button.dataset.aegisOverviewPerkHash = String(perk.hash);
      if (perk.selected) selected.push(perk.hash);
      break;
    }
  }
  const value = selected.join(',');
  if (popup.dataset.aegisOverviewActivePerkHashes !== value) popup.dataset.aegisOverviewActivePerkHashes = value;
}

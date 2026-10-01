import { getRecommendedMasterworks } from './tooltip';
import { masterworkMatches } from './masterwork';
import { getLocalizedStatName } from './hash-translator';
import { t } from './i18n';
import { getLocalizedPerkName, getPerkIcon, getPerkHashFromEnglish } from './hash-translator';
import { COMPARE_BUCKET_SELECTOR, COMPARE_HEADER_SELECTOR } from './compare-selectors';
import { iconPath, planCompareBubbles, type OwnedComparePerk } from './compare-bubbles';
import type { AegisSheetWeapon, SheetPerksGroup, TooltipPerk, WeaponEvaluationPayload } from './types';

const slots = ['barrel', 'mag', 'perk1', 'perk2', 'origin'] as const;
const slotKeys = ['barrels', 'mags', 'perk1s', 'perk2s', 'origins'] as const;
const labels = ['barrel', 'magazine', 'compareTrait1', 'compareTrait2', 'origin'];
const statusLabels = { active: 'compareSelected', selectable: 'selectable', missing: 'missing', other: 'compareOtherOwned' };
const ownSelector = '.aegis-compare-panel, .aegis-perk-label, .aegis-perk-name-sizer, [data-aegis-compare-generated], .aegis-perk-layout-toggle, .aegis-masterwork-recommendations, .aegis-overview-footer';

function recommendedPerks(perks?: SheetPerksGroup | null): TooltipPerk[] {
  return perks?.all || [...(perks?.matched || []), ...(perks?.missing || [])];
}

function hasOverviewRecommendations(sheet?: AegisSheetWeapon | null, perks?: SheetPerksGroup | null): boolean {
  return !!sheet && (recommendedPerks(perks).some(perk => slots.some(slot => slot === perk.type)) || getRecommendedMasterworks(sheet).length > 0);
}
type Original = { title: string | null; aria: string | null; order: string; priority: string };
type SocketState = { originals: Map<HTMLElement, Original>; generated: Map<string, HTMLElement>; count: number; name: HTMLElement; sizer: HTMLElement; names: string };

export function initComparePerks(options: {
  getData: (element: HTMLElement) => WeaponEvaluationPayload | undefined;
  getMode: () => 'pve' | 'pvp' | 'both';
  getOrder: () => 'sheet' | 'owned';
  getEnhancedToNormal?: () => Record<number, number>;
  enabled: () => boolean;
  view?: 'compare' | 'overview';
  getLayout?: () => 'grid' | 'list';
  setLayout?: (layout: 'grid' | 'list') => void;
}) {
  const overview = options.view === 'overview';
  const rootSelector = overview ? '.item-popup[data-aegis-item-hash]' : COMPARE_BUCKET_SELECTOR;
  const gridParents = new Set<HTMLElement>();
  const perkHeaders = new Set<HTMLElement>();
  let bucket: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let layoutButton: HTMLButtonElement | null = null;
  let overviewFooter: HTMLElement | null = null;
  let overviewControls: HTMLElement | null = null;
  let overviewButton: HTMLButtonElement | null = null;
  let overviewBody: HTMLElement | null = null;
  const positioned = new Map<HTMLElement, { left: string; priority: string; applied: string }>();
  let overviewBounds = '';
  const overviewResize = overview ? new ResizeObserver(() => syncOverviewGeometry()) : null;
  const observedOverview = new Set<HTMLElement>();
  let frame = 0;
  let context: 'pve' | 'pvp' = 'pve';
  let toolbarSignature = '';
  let layout: 'grid' | 'list' = 'grid';
  const sockets = new Map<HTMLElement, SocketState>();
  const masterworks = new Map<HTMLElement, HTMLElement>();
  function property(node: HTMLElement, name: string, value: string) {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  }

  function syncCompareRows() {
    if (overview || !bucket) return;
    for (const slot of slots) {
      let rows = 1;
      for (const [socket, state] of sockets) if (socket.dataset.aegisCompareSlot === slot) {
        rows = Math.max(rows, layout === 'list' ? 1 : Math.ceil(state.count / 4));
      }
      property(bucket, `--aegis-${slot}-rows`, String(rows));
    }
  }

  function refresh() {
    if (frame) return;
    // DIM can replace its sockets during a layout switch. Reattach the Overview
    // header before paint, including while the new sockets await annotation.
    if (overview) { frame = -1; queueMicrotask(render); }
    else frame = requestAnimationFrame(render);
  }

  function overviewAnchor() {
    return bucket?.querySelector('button .fa-th, button .fa-list')?.closest('button')?.parentElement;
  }

  function clearOverviewGeometry() {
    overviewResize?.disconnect(); observedOverview.clear();
    overviewControls?.removeAttribute('data-aegis-overview-controls');
    overviewControls?.style.removeProperty('--aegis-overview-header-height');
    overviewButton?.removeAttribute('data-aegis-overview-layout-button');
    overviewBody?.style.removeProperty('--aegis-overview-required-width');
    overviewBody?.removeAttribute('data-aegis-overview-resizable');
    for (const [node, original] of positioned) {
      if (node.style.left === original.applied) {
        if (original.left) node.style.setProperty('left', original.left, original.priority);
        else node.style.removeProperty('left');
      }
    }
    positioned.clear();
    const resized = !!overviewBounds;
    overviewBounds = '';
    overviewControls = null; overviewButton = null; overviewBody = null;
    if (resized) document.dispatchEvent(new Event('aegis-overview-resize'));
  }

  function originalLeft(node: HTMLElement) {
    let original = positioned.get(node);
    // DIM can reposition the popup itself after a React update.
    if (!original || node.style.left !== original.applied) {
      original = { left: node.style.left, priority: node.style.getPropertyPriority('left'), applied: node.style.left };
      positioned.set(node, original);
    }
    return original;
  }

  function fitOverviewToViewport() {
    if (!bucket || !['absolute', 'fixed'].includes(getComputedStyle(bucket).position)) return;
    const original = originalLeft(bucket);
    const nativeLeft = parseFloat(original.left);
    if (!Number.isFinite(nativeLeft)) return;
    const rect = bucket.getBoundingClientRect();
    const left = rect.left - (parseFloat(bucket.style.left) - nativeLeft);
    const maxLeft = Math.max(12, document.documentElement.clientWidth - 12 - rect.width);
    const shift = Math.min(Math.max(left, 12), maxLeft) - left;
    property(bucket, 'left', `${nativeLeft + shift}px`);
    original.applied = bucket.style.left;
    // Keep a top/bottom arrow pointing at DIM's original anchor after shifting.
    const arrow = bucket.querySelector<HTMLElement>(':scope > .arrow');
    if (arrow && /^(top|bottom)/.test(bucket.dataset.popperPlacement || '')) {
      const arrowOriginal = originalLeft(arrow);
      const x = parseFloat(arrowOriginal.left);
      if (Number.isFinite(x)) {
        property(arrow, 'left', `${Math.max(8, Math.min(rect.width - arrow.offsetWidth - 8, x - shift))}px`);
        arrowOriginal.applied = arrow.style.left;
      }
    }
    const bounds = `${bucket.getBoundingClientRect().left}:${rect.width}`;
    if (bounds !== overviewBounds) {
      overviewBounds = bounds;
      document.dispatchEvent(new Event('aegis-overview-resize'));
    }
  }

  function syncOverviewGeometry() {
    if (!overview || !bucket || !panel?.isConnected) return;
    const anchor = overviewAnchor();
    if (!anchor) return;
    const button = anchor.querySelector<HTMLButtonElement>(':scope > button:has(.fa-th, .fa-list)');
    // Resize DIM's content body; the popup root also contains its action rail.
    const body = anchor.closest<HTMLElement>('.gi12X5mX, [class*="ItemPopup-m_desktopPopupBody-"]') || bucket;
    if (overviewControls !== anchor || overviewButton !== button || overviewBody !== body) {
      clearOverviewGeometry(); overviewControls = anchor; overviewButton = button; overviewBody = body;
    }
    attribute(anchor, 'data-aegis-overview-controls', '');
    if (button) attribute(button, 'data-aegis-overview-layout-button', '');
    property(anchor, '--aegis-overview-header-height', `${panel.getBoundingClientRect().height}px`);
    const grids = [...gridParents].filter(grid => grid.isConnected);
    const targets = new Set([body, panel, ...grids]);
    for (const node of observedOverview) if (!targets.has(node)) { overviewResize?.unobserve(node); observedOverview.delete(node); }
    for (const node of targets) if (!observedOverview.has(node)) { overviewResize?.observe(node); observedOverview.add(node); }
    // Retain the width through React's brief unannotated layout transition.
    if (!grids.length) { fitOverviewToViewport(); return; }
    const pixels = (value: string) => parseFloat(value) || 0;
    const bodyStyle = getComputedStyle(body);
    const bodyInset = bodyStyle.boxSizing === 'border-box' ? 0 : pixels(bodyStyle.paddingLeft) + pixels(bodyStyle.paddingRight) + pixels(bodyStyle.borderLeftWidth) + pixels(bodyStyle.borderRightWidth);
    let required = 0;
    for (const grid of grids) {
      const style = getComputedStyle(grid);
      const columns = [...grid.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute('data-aegis-compare-slot'));
      const widths = layout === 'list'
        ? style.gridTemplateColumns.split(' ').map(pixels)
        : columns.map(node => {
          const columnStyle = getComputedStyle(node);
          return Math.max(node.getBoundingClientRect().width, node.scrollWidth + pixels(columnStyle.borderLeftWidth) + pixels(columnStyle.borderRightWidth)) + pixels(columnStyle.marginLeft) + pixels(columnStyle.marginRight);
        });
      const intrinsic = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * pixels(style.columnGap)
        + pixels(style.paddingLeft) + pixels(style.paddingRight) + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth);
      required = Math.max(required, intrinsic + body.getBoundingClientRect().width - grid.getBoundingClientRect().width - bodyInset);
    }
    // Keep the native width rule. A minimum only enlarges it when perks overflow.
    // On narrow screens, retain scrolling rather than expanding beyond the viewport.
    const actionWidth = Math.max(0, bucket.getBoundingClientRect().width - body.getBoundingClientRect().width);
    const available = Math.max(0, document.documentElement.clientWidth - actionWidth - 24 - bodyInset);
    property(body, '--aegis-overview-required-width', `${Math.ceil(Math.min(required, available))}px`);
    attribute(body, 'data-aegis-overview-resizable', '');
    fitOverviewToViewport();
  }
  function attribute(node: Element, name: string, value: string | null) {
    if (node.getAttribute(name) === value) return;
    if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
  }
  function restoreBubble(node: HTMLElement, original: Original) {
    node.querySelector('.aegis-perk-label')?.remove();
    for (const attr of ['data-aegis-compare-state', 'data-aegis-compare-selected', 'data-aegis-compare-perk-hash', 'data-aegis-compare-rating']) node.removeAttribute(attr);
    attribute(node, 'title', original.title); attribute(node, 'aria-label', original.aria);
    if (original.order) node.style.setProperty('--aegis-compare-order', original.order, original.priority);
    else node.style.removeProperty('--aegis-compare-order');
    node.style.removeProperty('--aegis-perk-column');
  }
  function restoreSocket(socket: HTMLElement, state: SocketState) {
    state.originals.forEach((original, node) => restoreBubble(node, original));
    state.generated.forEach(node => node.remove());
    state.name.remove();
    state.sizer.remove();
    socket.querySelectorAll('.aegis-perk-label-outgoing').forEach(node => node.remove());
    socket.removeAttribute('data-aegis-compare-slot');
    socket.removeAttribute('data-aegis-compare-label');
    socket.style.removeProperty('--aegis-slot-rows');
    sockets.delete(socket);
  }
  function removeMasterwork(key: HTMLElement, row: HTMLElement) {
    row.parentElement?.removeAttribute('data-aegis-masterwork-cell');
    row.remove(); masterworks.delete(key);
  }
  function cleanup() {
    if (overview) bucket?.removeAttribute('data-aegis-overview-enhanced');
    clearOverviewGeometry();
    masterworks.forEach((row, key) => removeMasterwork(key, row));
    if (sockets.size) document.dispatchEvent(new Event('aegis-compare-tooltips-hide'));
    sockets.forEach((state, socket) => restoreSocket(socket, state));
    gridParents.forEach(parent => { parent.removeAttribute('data-aegis-overview-grid'); parent.removeAttribute('data-aegis-perk-layout'); parent.style.removeProperty('--aegis-perk-columns'); }); gridParents.clear();
    perkHeaders.forEach(header => header.removeAttribute('data-aegis-perks-header')); perkHeaders.clear();
    if (!overview && bucket) {
      bucket.removeAttribute('data-aegis-compare-layout');
      for (const slot of slots) bucket.style.removeProperty(`--aegis-${slot}-rows`);
    }
    overviewFooter?.remove(); overviewFooter = null; panel?.remove(); layoutButton?.remove(); layoutButton = null; panel = null; bucket = null; toolbarSignature = '';
  }

  function missingBubble(sample: HTMLElement): HTMLElement {
    // Borrow DIM's size classes only. Native bubbles keep their React handlers
    // and full tooltips; missing perks are informational, with no click handler.
    const node = document.createElement('span');
    node.className = sample.className;
    node.setAttribute('data-aegis-compare-generated', '');
    node.setAttribute('role', 'img'); node.tabIndex = 0;
    const svg = sample.querySelector('svg')!.cloneNode(false) as SVGSVGElement;
    svg.removeAttribute('id');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '50'); circle.setAttribute('cy', '50'); circle.setAttribute('r', '46');
    circle.setAttribute('stroke-width', '3'); svg.append(circle);
    // Preserve DIM's icon wrappers, including list-mode size and padding.
    let content: Element = svg;
    for (let parent = sample.querySelector('svg')!.parentElement; parent && parent !== sample; parent = parent.parentElement) {
      const wrapper = parent.cloneNode(false) as HTMLElement;
      wrapper.removeAttribute('id'); wrapper.removeAttribute('title'); wrapper.append(content); content = wrapper;
    }
    node.append(content);
    return node;
  }

  function paintSocket(socket: HTMLElement, slot: typeof slots[number], native: HTMLElement[], owned: OwnedComparePerk[], recommendations: TooltipPerk[]) {
    let state = sockets.get(socket);
    if (!state) {
      const name = document.createElement('span'); name.className = 'aegis-perk-label'; name.setAttribute('aria-hidden', 'true');
      const sizer = document.createElement('span'); sizer.className = 'aegis-perk-name-sizer'; sizer.setAttribute('aria-hidden', 'true');
      state = { originals: new Map(), generated: new Map(), count: 0, name, sizer, names: '' }; sockets.set(socket, state);
    }
    if (!overview || layout === 'list') {
      if (state.name.parentElement !== socket) socket.append(state.name);
      if (state.sizer.parentElement !== socket) socket.append(state.sizer);
    } else {
      state.name.remove(); state.sizer.remove();
    }
    // Reserve every selectable name so selection changes cannot resize the column.
    const names = owned.map(perk => getLocalizedPerkName(perk.hash || perk.name, perk.name));
    const nameSignature = JSON.stringify(names);
    if (state.names !== nameSignature) {
      state.names = nameSignature;
      state.sizer.replaceChildren(...names.map(value => {
        const span = document.createElement('span'); span.textContent = value; return span;
      }));
    }
    attribute(socket, 'data-aegis-compare-slot', slot);
    attribute(socket, 'data-aegis-compare-label', t(labels[slots.indexOf(slot)]));
    const plan = planCompareBubbles(recommendations, owned, options.getOrder());
    state.count = plan.length;
    const selected = plan.find(perk => perk.selected);
    const selectedName = selected ? getLocalizedPerkName(selected.hash || selected.name, selected.name) : '';
    if (state.name.textContent !== selectedName) {
      if (state.name.isConnected && state.name.textContent && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        socket.querySelectorAll('.aegis-perk-label-outgoing').forEach(node => node.remove());
        const outgoing = state.name.cloneNode(true) as HTMLElement;
        outgoing.classList.add('aegis-perk-label-outgoing'); socket.append(outgoing);
        const fade = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
        void fade.finished.then(() => outgoing.remove(), () => outgoing.remove());
        state.name.getAnimations().forEach(animation => animation.cancel());
        state.name.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      }
      state.name.textContent = selectedName;
    }
    attribute(state.name, 'data-aegis-perk-status', selected?.status || 'other');
    attribute(state.name, 'title', null);
    if (!overview) property(socket, '--aegis-slot-rows', `var(--aegis-${slot}-rows, 1)`);
    const enhancements = options.getEnhancedToNormal?.() || {};
    const enhancedColumn = owned.some(perk => !!enhancements[perk.hash]) || native.some(node => !!node.querySelector('svg > path[fill="#eade8b"]'));
    const normalToEnhanced = new Map(Object.entries(enhancements).map(([enhanced, normal]) => [normal, Number(enhanced)]));
    const missingHash = (perk: { hash?: number; name: string }) => {
      const hash = perk.hash || getPerkHashFromEnglish(perk.name) || undefined;
      if (!hash) return;
      const normal = enhancements[hash] || hash;
      return enhancedColumn ? normalToEnhanced.get(normal) || hash : normal;
    };
    const kept = new Set<string>();
    for (const [index, perk] of plan.entries()) {
      let node: HTMLElement;
      if (perk.ownedIndex !== undefined) {
        node = native[perk.ownedIndex];
        if (!state.originals.has(node)) state.originals.set(node, {
          title: node.getAttribute('title'), aria: node.getAttribute('aria-label'),
          order: node.style.getPropertyValue('--aegis-compare-order'), priority: node.style.getPropertyPriority('--aegis-compare-order'),
        });
      } else {
        const key = String(perk.hash || perk.name); kept.add(key);
        node = state.generated.get(key) || missingBubble(native[0]); state.generated.set(key, node);
        const perkHash = missingHash(perk);
        attribute(node, 'data-aegis-compare-perk-hash', perkHash ? String(perkHash) : null);
        const svg = node.querySelector('svg')!;
        const url = safeIcon(getPerkIcon(perkHash || perk.name) || perk.icon);
        let icon = svg.querySelector('image');
        if (url) {
          if (!icon) {
            icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            for (const [key, value] of Object.entries({ x: '12', y: '12', width: '76', height: '76' })) icon.setAttribute(key, value);
            svg.append(icon);
          }
          attribute(icon, 'href', url); svg.querySelector('text')?.remove();
        } else {
          icon?.remove();
          if (!svg.querySelector('text')) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = '?'; text.setAttribute('x', '50'); text.setAttribute('y', '65');
            text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '45'); text.setAttribute('fill', 'white'); svg.append(text);
          }
        }
        const marker = native.find(node => node.querySelector('svg > path[fill="#eade8b"]'))?.querySelector('svg > path[fill="#eade8b"]');
        if (enhancedColumn && marker && !svg.querySelector('path')) svg.append(marker.cloneNode(true));
        if (!enhancedColumn) svg.querySelectorAll('path').forEach(path => path.remove());
        if (node.parentElement !== socket) socket.append(node);
      }
      attribute(node, 'data-aegis-compare-state', perk.status);
      const ratingHash = perk.ownedIndex === undefined ? missingHash(perk) : perk.hash || getPerkHashFromEnglish(perk.name) || undefined;
      attribute(node, 'data-aegis-compare-perk-hash', ratingHash ? String(ratingHash) : null);
      attribute(node, 'data-aegis-compare-selected', perk.selected ? '' : null);
      if (node.style.getPropertyValue('--aegis-compare-order') !== String(index)) node.style.setProperty('--aegis-compare-order', String(index));
      const name = getLocalizedPerkName(perk.hash || perk.name, perk.name);
      property(node, '--aegis-perk-column', String(index + 2));
      const description = `${name} — ${t(statusLabels[perk.status])}${perk.selected && perk.status !== 'active' ? ` · ${t('compareSelected')}` : ''}`;
      // Native and generated perks already have rich tooltips. Keep the status
      // accessible without triggering the browser's separate title tooltip.
      attribute(node, 'title', null); attribute(node, 'aria-label', description);
    }
    for (const [key, node] of state.generated) if (!kept.has(key)) { node.remove(); state.generated.delete(key); }
    for (const [node, original] of state.originals) if (!native.includes(node)) { restoreBubble(node, original); state.originals.delete(node); }
  }

  function render() {
    frame = 0;
    layout = options.getLayout?.() || layout;
    const next = document.querySelector<HTMLElement>(rootSelector);
    if (!next || !options.enabled()) { cleanup(); return; }
    if (bucket !== next) { cleanup(); bucket = next; context = 'pve'; }
    // DIM's native button shows the destination layout. Keep its handler and
    // saved preference; only enhance the list that DIM has actually rendered.
    if (overview) layout = bucket.querySelector('button .fa-th') ? 'list' : 'grid';
    const mode = options.getMode(); if (mode !== 'both') context = mode;
    const seen = new Set<HTMLElement>();
    const seenMasterworks = new Set<HTMLElement>();
    let hasRecommendations = false;
    const headers = overview ? [bucket] : Array.from(bucket.querySelectorAll<HTMLElement>(COMPARE_HEADER_SELECTOR)).filter(node => node.parentElement === bucket);
    for (const header of headers) {
      const item = overview ? bucket : header.querySelector<HTMLElement>('.item[data-aegis-item-hash]') || header.querySelector<HTMLElement>('[data-aegis-item-hash]');
      const data = item && options.getData(item);
      if (!item || !data || item.dataset.aegisItemType === 'armor') continue;
      const sheet = mode === 'both' ? context === 'pve' ? data.sheetWeaponPvE : data.sheetWeaponPvP : data.sheetWeapon;
      const perks = mode === 'both' ? context === 'pve' ? data.sheetPerksPvE : data.sheetPerksPvP : data.sheetPerks;
      // The alternate activity must remain reachable even when this one has no sheet.
      hasRecommendations ||= overview
        ? hasOverviewRecommendations(sheet, perks) || mode === 'both' &&
          (hasOverviewRecommendations(data.sheetWeaponPvE, data.sheetPerksPvE) || hasOverviewRecommendations(data.sheetWeaponPvP, data.sheetPerksPvP))
        : !!(sheet && perks) || mode === 'both' &&
          !!((data.sheetWeaponPvE && data.sheetPerksPvE) || (data.sheetWeaponPvP && data.sheetPerksPvP));
      const all = recommendedPerks(perks);
      const hasPerks = all.some(perk => slots.some(slot => slot === perk.type));
      let categories: Record<string, string[]>;
      try { categories = JSON.parse(item.dataset.aegisWeaponPossiblePerks || '{}'); } catch { continue; }
      const activeHashes = overview && item.hasAttribute('data-aegis-overview-active-perk-hashes')
        ? (item.dataset.aegisOverviewActivePerkHashes || '').split(',').map(Number) : data.activeHashes;
      const byIcon = new Map(Object.entries(data.perksMap).filter(([, p]) => p.icon).map(([hash, p]) => [iconPath(p.icon), { hash: Number(hash), ...p, selected: activeHashes?.includes(Number(hash)) || false }]));
      const usedSlots = new Set<string>();
      let perkCell: Element | null = null;
      let perkGrid: HTMLElement | null = null;
      // Compare columns are contiguous grid children: header followed by cells.
      for (let cell: Element | null = overview ? bucket : header.nextElementSibling; cell && (overview || !headers.includes(cell as HTMLElement)); cell = overview ? null : cell.nextElementSibling) {
        if (!overview && cell.getAttribute('role') !== 'cell') continue;
        const groups = new Map<HTMLElement, { nodes: HTMLElement[]; owned: OwnedComparePerk[] }>();
        for (const image of cell.querySelectorAll('svg[viewBox="0 0 100 100"] image')) {
          const node = image.closest<HTMLElement>(overview ? '[data-aegis-overview-perk-hash]' : '[role="button"]');
          if (!node || node.hasAttribute('data-aegis-compare-generated')) continue;
          const href = image.getAttribute('href') || image.getAttribute('xlink:href') || '';
          const perk = byIcon.get(iconPath(href));
          if (!perk || !node.parentElement) continue;
          const group = groups.get(node.parentElement) || { nodes: [], owned: [] };
          if (!group.nodes.includes(node)) { group.nodes.push(node); group.owned.push(perk); }
          groups.set(node.parentElement, group);
        }
        for (const [socket, group] of groups) {
          const candidates = slots.map((slot, i) => ({ slot, score: usedSlots.has(slot) ? 0 : group.owned.filter(p => categories[slotKeys[i]]?.includes(p.name)).length }))
            .filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score);
          const slot = candidates[0]?.slot; if (!slot) continue;
          usedSlots.add(slot);
          if (!overview) {
            const children = Array.from(bucket.children);
            // DIM has a separate highlight column before the row labels.
            const rowHeaders = children.filter(node => node.getAttribute('role') === 'rowheader');
            const rowHeader = rowHeaders[children.indexOf(cell) - children.indexOf(header) - 1];
            if (rowHeader instanceof HTMLElement && rowHeader.getAttribute('role') === 'rowheader') {
              attribute(rowHeader, 'data-aegis-perks-header', ''); perkHeaders.add(rowHeader);
            }
          }
          if (!sheet || !perks || overview && !hasPerks) continue;
          seen.add(socket);
          perkCell = cell; perkGrid = socket.parentElement;
          paintSocket(socket, slot, group.nodes, group.owned, all.filter(p => p.type === slot));
          if (socket.parentElement) {
            if (overview) attribute(socket.parentElement, 'data-aegis-overview-grid', '');
            attribute(socket.parentElement, 'data-aegis-perk-layout', overview && layout === 'grid' ? null : layout);
            gridParents.add(socket.parentElement);
          }
        }
      }
      const recommended = sheet && (overview || perks) ? getRecommendedMasterworks(sheet) : [];
      // Keep Compare masterworks with the perks, above DIM's separate mods row.
      const target = overview ? overviewAnchor() || perkGrid : perkCell as HTMLElement | null;
      if (target && recommended.length) {
        seenMasterworks.add(header);
        let row = masterworks.get(header);
        if (!row) { row = document.createElement('div'); row.className = 'aegis-masterwork-recommendations'; masterworks.set(header, row); }
        const signature = JSON.stringify([recommended, data.equippedMasterwork, t('masterwork'), ...recommended.map(getLocalizedStatName), t('mwEquipped')]);
        if (row.dataset.signature !== signature) {
          row.dataset.signature = signature;
          row.setAttribute('aria-label', t('masterwork'));
          row.replaceChildren();
          for (const stat of recommended) {
            const chip = document.createElement('span'); chip.className = 'aegis-masterwork-chip';
            const matched = masterworkMatches([stat], data.equippedMasterwork || '', getLocalizedStatName);
            chip.classList.toggle('aegis-masterwork-matched', matched);
            chip.textContent = `${matched ? '✓' : '☆'} ${getLocalizedStatName(stat)}`;
            chip.title = matched ? t('mwEquipped') : t('aegisRecommendsMw', { mw: getLocalizedStatName(stat) }); row.append(chip);
          }
        }
        if (overview) {
          if (overviewFooter?.isConnected) { if (row.parentElement !== overviewFooter) overviewFooter.prepend(row); }
          else if (target.nextElementSibling !== row) target.after(row);
        }
        else {
          if (row.parentElement !== target) { row.parentElement?.removeAttribute('data-aegis-masterwork-cell'); target.append(row); }
          attribute(target, 'data-aegis-masterwork-cell', '');
        }
      }
    }
    for (const [key, row] of masterworks) if (!seenMasterworks.has(key)) removeMasterwork(key, row);
    if (overview && [...sockets.keys()].some(socket => !seen.has(socket))) document.dispatchEvent(new Event('aegis-compare-tooltips-hide'));
    for (const [socket, state] of sockets) if (!seen.has(socket)) restoreSocket(socket, state);
    for (const parent of gridParents) if (![...sockets.keys()].some(socket => socket.parentElement === parent)) {
      parent.removeAttribute('data-aegis-overview-grid'); parent.removeAttribute('data-aegis-perk-layout'); parent.style.removeProperty('--aegis-perk-columns'); gridParents.delete(parent);
    }
    syncCompareRows();
    for (const parent of gridParents) {
      const count = Math.max(1, ...[...sockets].filter(([socket]) => socket.parentElement === parent).map(([, state]) => state.count));
      if (!overview || layout === 'list') property(parent, '--aegis-perk-columns', String(count));
      else parent.style.removeProperty('--aegis-perk-columns');
    }
    const controlsAnchor = overview ? overviewAnchor() : [...perkHeaders].find(header => header.isConnected);
    if (!sockets.size && !(hasRecommendations && controlsAnchor)) { cleanup(); return; }
    if (overview) attribute(bucket, 'data-aegis-overview-enhanced', sockets.size || masterworks.size ? '' : null);
    if (!overview) attribute(bucket, 'data-aegis-compare-layout', layout);
    renderLayoutButton();
    renderToolbar(mode);
    syncOverviewGeometry();
  }

  function renderLayoutButton() {
    if (overview || !bucket) return;
    const organizer = bucket.closest('[role="dialog"]')?.querySelector<HTMLAnchorElement>('a[href*="/organizer"]');
    if (!organizer) { layoutButton?.remove(); return; }
    if (!layoutButton) {
      layoutButton = document.createElement('button'); layoutButton.type = 'button';
      // DIM's ItemSocketsWeapons displayStyleButton and resetButton classes,
      // in release and beta. Use DIM's AppIcon font for the native layout icons.
      layoutButton.className = 'aegis-perk-layout-toggle qIajuSK6 o3oKAnUN ItemSocketsWeapons-m_displayStyleButton-qIajuSK6 common-m_resetButton-o3oKAnUN';
      const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); layoutButton.append(icon);
      layoutButton.addEventListener('click', () => {
        layout = layout === 'grid' ? 'list' : 'grid'; options.setLayout?.(layout); refresh();
      });
    }
    const next = layout === 'grid' ? 'list' : 'grid';
    attribute(layoutButton, 'title', t(next === 'list' ? 'perkLayoutList' : 'perkLayoutGrid'));
    attribute(layoutButton, 'aria-label', layoutButton.title);
    attribute(layoutButton, 'data-aegis-perk-layout-choice', next);
    attribute(layoutButton.firstElementChild!, 'class', `fas ${next === 'list' ? 'fa-list' : 'fa-th'} app-icon`);
    if (organizer.nextElementSibling !== layoutButton) organizer.after(layoutButton);
  }

  function renderToolbar(mode: 'pve' | 'pvp' | 'both') {
    const signature = JSON.stringify([mode, t('compareRecommendations'), t('modePve'), t('modePvp')]);
    const grid = [...gridParents][0];
    const anchor = overviewAnchor() || grid;
    const rowHeader = [...perkHeaders].find(header => header.isConnected);
    if (panel) {
      if (overview && anchor?.previousElementSibling !== panel) anchor?.before(panel);
      else if (!overview && panel.parentElement !== rowHeader) rowHeader?.append(panel);
    }
    if (overview && anchor) {
      if (!overviewFooter) { overviewFooter = document.createElement('div'); overviewFooter.className = 'aegis-overview-footer'; }
      if (anchor.nextElementSibling !== overviewFooter) anchor.after(overviewFooter);
      for (const row of masterworks.values()) if (row.parentElement !== overviewFooter) overviewFooter.prepend(row);
    }
    if (panel?.isConnected && toolbarSignature === signature) { updateContextSwitch(); return; }
    if (!panel?.isConnected) {
      panel = document.createElement('section'); panel.className = 'aegis-compare-panel';
      if (overview) { panel.classList.add('aegis-overview-panel'); anchor?.before(panel); }
      else rowHeader?.append(panel);
    }
    toolbarSignature = signature;
    overviewFooter?.querySelector('.aegis-compare-context')?.remove();
    panel.replaceChildren();
    if (overview) {
      const title = document.createElement('strong'); title.textContent = t('compareRecommendations'); panel.append(title);
    }
    if (mode === 'both') {
      const group = document.createElement('span');
      group.className = 'segmented-control aegis-compare-context';
      group.setAttribute('role', 'group'); group.setAttribute('aria-label', `${t('modePve')} / ${t('modePvp')}`);
      if (!overview) {
        // DIM's sortable header handles press and long-press events as well as
        // clicks. Isolate the switch without preventing native button activation.
        for (const event of ['click', 'pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel', 'keydown', 'keyup']) {
          group.addEventListener(event, event => event.stopPropagation());
        }
      }
      for (const value of ['pve', 'pvp'] as const) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = value === 'pve' ? 'PvE' : 'PvP';
        button.dataset.aegisContext = value;
        button.setAttribute('aria-pressed', String(context === value));
        button.addEventListener('click', () => { context = value; refresh(); }); group.append(button);
      }
      (overview ? overviewFooter! : panel).append(group); updateContextSwitch();
    }

  }

  function updateContextSwitch() {
    const group = (overview ? overviewFooter : panel)?.querySelector<HTMLElement>('.aegis-compare-context');
    if (!group) return;
    attribute(group, 'data-context', context);
    group.querySelectorAll<HTMLElement>('button').forEach(button => attribute(button, 'aria-pressed', String(button.dataset.aegisContext === context)));
  }

  function observe(mutations: MutationRecord[]) {
    if (bucket && !bucket.isConnected) { refresh(); return; }
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target?.closest(ownSelector)) continue;
      if (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes].every(node => node instanceof Element && node.matches(ownSelector))) continue;
      if ((!overview && bucket?.closest('[role="dialog"]')?.contains(target || null)) || target?.closest(rootSelector) || Array.from(mutation.addedNodes).some(node => node instanceof Element && (node.matches(rootSelector) || node.querySelector(rootSelector)))) { refresh(); return; }
    }
  }
  if (overview) window.addEventListener('resize', refresh);
  return { refresh, observe };
}

function safeIcon(value?: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value, 'https://www.bungie.net'); return url.protocol === 'https:' && url.hostname === 'www.bungie.net' ? url.href : null; } catch { return null; }
}

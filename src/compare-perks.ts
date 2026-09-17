import { t } from './i18n';
import { getLocalizedPerkName, getPerkIcon, getPerkHashFromEnglish } from './hash-translator';
import { COMPARE_BUCKET_SELECTOR, COMPARE_HEADER_SELECTOR } from './compare-selectors';
import { iconPath, planCompareBubbles, type OwnedComparePerk } from './compare-bubbles';
import type { TooltipPerk, WeaponEvaluationPayload } from './types';

const slots = ['barrel', 'mag', 'perk1', 'perk2', 'origin'] as const;
const slotKeys = ['barrels', 'mags', 'perk1s', 'perk2s', 'origins'] as const;
const labels = ['barrel', 'magazine', 'compareTrait1', 'compareTrait2', 'origin'];
const statusLabels = { active: 'compareSelected', selectable: 'selectable', missing: 'missing', other: 'compareOtherOwned' };
const ownSelector = '.aegis-compare-panel, .aegis-perk-label, .aegis-perk-name-sizer, [data-aegis-compare-generated]';
type Original = { title: string | null; aria: string | null; order: string; priority: string };
type SocketState = { originals: Map<HTMLElement, Original>; generated: Map<string, HTMLElement>; count: number; name: HTMLElement; sizer: HTMLElement; names: string };

export function initComparePerks(options: {
  getData: (element: HTMLElement) => WeaponEvaluationPayload | undefined;
  getMode: () => 'pve' | 'pvp' | 'both';
  getOrder: () => 'sheet' | 'owned';
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
  let frame = 0;
  let context: 'pve' | 'pvp' = 'pve';
  let toolbarSignature = '';
  let layout: 'grid' | 'list' = 'grid';
  const sockets = new Map<HTMLElement, SocketState>();
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

  function refresh() { if (!frame) frame = requestAnimationFrame(render); }
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
  function cleanup() {
    if (sockets.size) document.dispatchEvent(new Event('aegis-compare-tooltips-hide'));
    sockets.forEach((state, socket) => restoreSocket(socket, state));
    gridParents.forEach(parent => { parent.removeAttribute('data-aegis-overview-grid'); parent.removeAttribute('data-aegis-perk-layout'); parent.style.removeProperty('--aegis-perk-columns'); }); gridParents.clear();
    perkHeaders.forEach(header => header.removeAttribute('data-aegis-perks-header')); perkHeaders.clear();
    if (!overview && bucket) {
      bucket.removeAttribute('data-aegis-compare-layout');
      for (const slot of slots) bucket.style.removeProperty(`--aegis-${slot}-rows`);
    }
    panel?.remove(); panel = null; bucket = null; toolbarSignature = '';
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
    circle.setAttribute('stroke-width', '3'); svg.append(circle); node.append(svg);
    return node;
  }

  function paintSocket(socket: HTMLElement, slot: typeof slots[number], native: HTMLElement[], owned: OwnedComparePerk[], recommendations: TooltipPerk[]) {
    let state = sockets.get(socket);
    if (!state) {
      const name = document.createElement('span'); name.className = 'aegis-perk-label'; name.setAttribute('aria-hidden', 'true');
      const sizer = document.createElement('span'); sizer.className = 'aegis-perk-name-sizer'; sizer.setAttribute('aria-hidden', 'true');
      state = { originals: new Map(), generated: new Map(), count: 0, name, sizer, names: '' }; sockets.set(socket, state);
    }
    if (state.name.parentElement !== socket) socket.append(state.name);
    if (state.sizer.parentElement !== socket) socket.append(state.sizer);
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
    const columns = layout === 'list' ? Math.max(1, plan.length) : 4;
    const selected = plan.find(perk => perk.selected);
    const selectedName = selected ? getLocalizedPerkName(selected.hash || selected.name, selected.name) : '';
    if (state.name.textContent !== selectedName) {
      if (state.name.textContent && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    attribute(state.name, 'title', selectedName || null);
    property(socket, '--aegis-slot-rows', overview ? String(Math.max(1, Math.ceil(plan.length / columns))) : `var(--aegis-${slot}-rows, 1)`);
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
        const perkHash = perk.hash || getPerkHashFromEnglish(perk.name);
        attribute(node, 'data-aegis-compare-perk-hash', perkHash ? String(perkHash) : null);
        const svg = node.querySelector('svg')!;
        const url = safeIcon(getPerkIcon(perk.hash || perk.name) || perk.icon);
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
        if (node.parentElement !== socket) socket.append(node);
      }
      attribute(node, 'data-aegis-compare-state', perk.status);
      const ratingHash = perk.hash || getPerkHashFromEnglish(perk.name) || undefined;
      attribute(node, 'data-aegis-compare-perk-hash', ratingHash ? String(ratingHash) : null);
      attribute(node, 'data-aegis-compare-selected', perk.selected ? '' : null);
      if (node.style.getPropertyValue('--aegis-compare-order') !== String(index)) node.style.setProperty('--aegis-compare-order', String(index));
      const name = getLocalizedPerkName(perk.hash || perk.name, perk.name);
      property(node, '--aegis-perk-column', String(index + 2));
      const description = `${name} — ${t(statusLabels[perk.status])}${perk.selected && perk.status !== 'active' ? ` · ${t('compareSelected')}` : ''}`;
      attribute(node, 'title', node.hasAttribute('data-aegis-compare-tooltip-open') ? null : description); attribute(node, 'aria-label', description);
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
    const mode = options.getMode(); if (mode !== 'both') context = mode;
    const seen = new Set<HTMLElement>();
    const headers = overview ? [bucket] : Array.from(bucket.querySelectorAll<HTMLElement>(COMPARE_HEADER_SELECTOR)).filter(node => node.parentElement === bucket);
    for (const header of headers) {
      const item = overview ? bucket : header.querySelector<HTMLElement>('.item[data-aegis-item-hash]') || header.querySelector<HTMLElement>('[data-aegis-item-hash]');
      const data = item && options.getData(item);
      if (!item || !data || item.dataset.aegisItemType === 'armor') continue;
      const sheet = mode === 'both' ? context === 'pve' ? data.sheetWeaponPvE : data.sheetWeaponPvP : data.sheetWeapon;
      const perks = mode === 'both' ? context === 'pve' ? data.sheetPerksPvE : data.sheetPerksPvP : data.sheetPerks;
      if (!sheet || !perks) continue;
      const all = perks.all || [...perks.matched, ...perks.missing];
      let categories: Record<string, string[]>;
      try { categories = JSON.parse(item.dataset.aegisWeaponPossiblePerks || '{}'); } catch { continue; }
      const activeHashes = overview && item.hasAttribute('data-aegis-overview-active-perk-hashes')
        ? (item.dataset.aegisOverviewActivePerkHashes || '').split(',').map(Number) : data.activeHashes;
      const byIcon = new Map(Object.entries(data.perksMap).filter(([, p]) => p.icon).map(([hash, p]) => [iconPath(p.icon), { hash: Number(hash), ...p, selected: activeHashes?.includes(Number(hash)) || false }]));
      const usedSlots = new Set<string>();
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
          usedSlots.add(slot); seen.add(socket);
          paintSocket(socket, slot, group.nodes, group.owned, all.filter(p => p.type === slot));
          if (!overview) {
            const children = Array.from(bucket.children);
            const rowHeader = children[children.indexOf(cell) - children.indexOf(header)];
            if (rowHeader instanceof HTMLElement && rowHeader.getAttribute('role') === 'rowheader') {
              attribute(rowHeader, 'data-aegis-perks-header', ''); perkHeaders.add(rowHeader);
            }
          }
          if (socket.parentElement) {
            if (overview) attribute(socket.parentElement, 'data-aegis-overview-grid', '');
            attribute(socket.parentElement, 'data-aegis-perk-layout', layout); gridParents.add(socket.parentElement);
          }
        }
      }
    }
    for (const [socket, state] of sockets) if (!seen.has(socket)) restoreSocket(socket, state);
    for (const parent of gridParents) if (![...sockets.keys()].some(socket => socket.parentElement === parent)) {
      parent.removeAttribute('data-aegis-overview-grid'); parent.removeAttribute('data-aegis-perk-layout'); parent.style.removeProperty('--aegis-perk-columns'); gridParents.delete(parent);
    }
    syncCompareRows();
    for (const parent of gridParents) {
      const count = Math.max(1, ...[...sockets].filter(([socket]) => socket.parentElement === parent).map(([, state]) => state.count));
      property(parent, '--aegis-perk-columns', String(count));
    }
    if (!sockets.size) { cleanup(); return; }
    if (!overview) attribute(bucket, 'data-aegis-compare-layout', layout);
    renderToolbar(mode);
  }

  function renderToolbar(mode: 'pve' | 'pvp' | 'both') {
    const text = Object.values(statusLabels).map(key => t(key));
    const signature = JSON.stringify([mode, context, layout, t('compareRecommendations'), t('perkLayoutGrid'), t('perkLayoutList'), text]);
    if (overview && panel?.isConnected && [...gridParents][0]?.previousElementSibling !== panel) [...gridParents][0]?.before(panel);
    if (panel?.isConnected && toolbarSignature === signature) return;
    if (!panel?.isConnected) {
      panel = document.createElement('section'); panel.className = 'aegis-compare-panel';
      if (overview) { panel.classList.add('aegis-overview-panel'); [...gridParents][0]?.before(panel); }
      else bucket!.before(panel);
    }
    toolbarSignature = signature;
    const title = document.createElement('strong'); title.textContent = t('compareRecommendations'); panel.replaceChildren(title);
    if (mode === 'both') for (const value of ['pve', 'pvp'] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = value === 'pve' ? 'PvE' : 'PvP';
      button.setAttribute('aria-pressed', String(context === value));
      button.addEventListener('click', () => { context = value; refresh(); }); panel.append(button);
    } else { const label = document.createElement('span'); label.textContent = mode === 'pve' ? 'PvE' : 'PvP'; panel.append(label); }
    const layoutGroup = document.createElement('span'); layoutGroup.className = 'aegis-perk-layout-controls';
    layoutGroup.setAttribute('role', 'group'); layoutGroup.setAttribute('aria-label', t('perkLayout'));
    for (const value of ['grid', 'list'] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = t(value === 'grid' ? 'perkLayoutGrid' : 'perkLayoutList');
      button.dataset.aegisPerkLayoutChoice = value; button.setAttribute('aria-pressed', String(layout === value));
      button.addEventListener('click', () => { layout = value; options.setLayout?.(value); refresh(); }); layoutGroup.append(button);
    }
    panel.append(layoutGroup);
    for (const [status, key] of Object.entries(statusLabels)) {
      const label = document.createElement('span'); label.dataset.aegisCompareLegend = status; label.textContent = t(key); panel.append(label);
    }
  }

  function observe(mutations: MutationRecord[]) {
    if (bucket && !bucket.isConnected) { refresh(); return; }
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target?.closest(ownSelector)) continue;
      if (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes].every(node => node instanceof Element && node.matches(ownSelector))) continue;
      if (target?.closest(rootSelector) || Array.from(mutation.addedNodes).some(node => node instanceof Element && (node.matches(rootSelector) || node.querySelector(rootSelector)))) { refresh(); return; }
    }
  }
  return { refresh, observe };
}

function safeIcon(value?: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value, 'https://www.bungie.net'); return url.protocol === 'https:' && url.hostname === 'www.bungie.net' ? url.href : null; } catch { return null; }
}

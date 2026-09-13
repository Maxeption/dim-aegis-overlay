import { applyGradeColors } from './grade-colors';
import { t } from './i18n';
import { getLocalizedPerkName, getLocalizedStatName, getPerkIcon } from './hash-translator';
import { getRecommendedMasterworks } from './tooltip';
import { masterworkMatches } from './masterwork';
import { COMPARE_BUCKET_SELECTOR, COMPARE_HEADER_SELECTOR } from './compare-selectors';
import type { WeaponEvaluationPayload } from './types';

type Status = 'active' | 'selectable' | 'missing';
type Perk = { name: string; status: Status; icon?: string };
const slots = ['barrel', 'mag', 'perk1', 'perk2', 'origin', 'mw'] as const;
const labels = ['barrel', 'magazine', 'perk1', 'perk2', 'origin', 'masterwork'];
const statusLabel = { active: 'compareSelected', selectable: 'selectable', missing: 'missing' };
const symbols = { active: '✓', selectable: '↗', missing: '−' };

export function initComparePerks(options: {
  getData: (element: HTMLElement) => WeaponEvaluationPayload | undefined;
  getMode: () => 'pve' | 'pvp' | 'both';
  enabled: () => boolean;
}) {
  let bucket: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let frame = 0;
  let signature = '';
  let context: 'pve' | 'pvp' = 'pve';
  let expanded = false;
  let collapsed = false;
  const expandedRows = new Set<string>();
  const resize = new ResizeObserver(refresh);

  function refresh() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function cleanup() {
    resize.disconnect();
    panel?.remove();
    panel = null;
    bucket = null;
    signature = '';
  }

  function render() {
    frame = 0;
    const next = document.querySelector<HTMLElement>(COMPARE_BUCKET_SELECTOR);
    if (!next || !options.enabled()) { cleanup(); return; }
    if (bucket !== next || !panel?.isConnected) {
      cleanup();
      bucket = next;
      expanded = collapsed = false;
      expandedRows.clear();
      context = 'pve';
      bucket.parentElement?.querySelectorAll('.aegis-compare-panel').forEach(node => node.remove());
      panel = document.createElement('section');
      panel.className = 'aegis-compare-panel';
      bucket.after(panel);
      resize.observe(bucket);
    }
    const mode = options.getMode();
    if (mode !== 'both') context = mode;
    const headers = Array.from(bucket.querySelectorAll<HTMLElement>(COMPARE_HEADER_SELECTOR))
      .filter(header => header.parentElement === bucket);
    if (!headers.length) { panel!.hidden = true; return; }
    const columns = headers.map(header => {
      const elements = Array.from(header.querySelectorAll<HTMLElement>('[data-aegis-item-hash]'));
      const element = elements.find(el => options.getData(el)) || elements[0];
      const data = element && options.getData(element);
      const sheet = mode === 'both' ? context === 'pve' ? data?.sheetWeaponPvE : data?.sheetWeaponPvP : data?.sheetWeapon;
      const perks = mode === 'both' ? context === 'pve' ? data?.sheetPerksPvE : data?.sheetPerksPvP : data?.sheetPerks;
      const result = mode === 'both' ? context === 'pve' ? data?.pveResult : data?.pvpResult : data?.result;
      const grade = mode === 'both' ? (context === 'pve' ? data?.result.pveGrade : data?.result.pvpGrade) || result?.grade : result?.grade;
      const all = sheet ? perks?.all || [...(perks?.matched || []), ...(perks?.missing || [])] : [];
      const rows: Perk[][] = slots.map(slot => slot === 'mw'
        ? (sheet ? getRecommendedMasterworks(sheet).map(mw => ({ name: getLocalizedStatName(mw), status: masterworkMatches([mw], data?.equippedMasterwork || '', getLocalizedStatName) ? 'active' as const : 'missing' as const })) : [])
        : all.filter(perk => perk.type === slot).map(perk => ({
          name: getLocalizedPerkName(perk.hash || perk.name, perk.name),
          icon: getPerkIcon(perk.hash || perk.name) || perk.icon,
          status: !perk.matched || perk.status === 'missing' ? 'missing' : perk.status === 'active' ? 'active' : 'selectable',
        })));
      return { name: data?.name || element?.dataset.aegisItemName || '', type: element?.dataset.aegisItemType,
        id: element?.dataset.aegisInstanceId, loading: !data, sheet: !!sheet, grade: grade || '', rows };
    });
    if (columns.every(column => column.type === 'armor')) { panel!.hidden = true; return; }
    const bounds = bucket.getBoundingClientRect();
    const rects = headers.map(header => header.getBoundingClientRect());
    if (!bounds.width || rects.some(rect => !rect.width)) { panel!.hidden = true; return; }
    panel!.hidden = false;
    const widths = [rects[0].left - bounds.left, ...rects.map((rect, index) => (rects[index + 1]?.left ?? bounds.right) - rect.left)];
    const text = { title: t('compareRecommendations'), all: t(expanded ? 'compareCompact' : 'compareAll'),
      grade: t('compareGrade'), loading: t('compareLoading'), noSheet: t('compareNoSheet'),
      notRecommended: t('compareNotRecommended'), less: t('compareLess'),
      legend: Object.entries(symbols).map(([key, symbol]) => `${symbol} ${t(statusLabel[key as Status])}`).join(' · '),
      previewNote: t('comparePreviewNote'),
      labels: labels.map(label => t(label)), statuses: Object.fromEntries(Object.entries(statusLabel).map(([key, value]) => [key, t(value)])) };
    const nextSignature = JSON.stringify({ columns, widths, context, mode, expanded, collapsed, rows: [...expandedRows], text });
    if (nextSignature === signature) { applyGradeColors(panel!); return; }
    signature = nextSignature;
    const active = document.activeElement instanceof HTMLElement && panel!.contains(document.activeElement)
      ? document.activeElement.dataset.compareAction : undefined;
    panel!.replaceChildren();
    panel!.style.width = `${bounds.width}px`;
    panel!.setAttribute('aria-label', text.title);
    const toolbar = document.createElement('div');
    toolbar.className = 'aegis-compare-toolbar';
    const toggle = button(`${collapsed ? '▸' : '▾'} ${text.title}`, 'collapse', () => { collapsed = !collapsed; refresh(); });
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toolbar.append(toggle);
    if (mode === 'both') {
      for (const value of ['pve', 'pvp'] as const) {
        const tab = button(value === 'pve' ? 'PvE' : 'PvP', value, () => { context = value; refresh(); });
        tab.setAttribute('aria-pressed', String(value === context));
        toolbar.append(tab);
      }
    } else {
      const modeLabel = document.createElement('span');
      modeLabel.textContent = context === 'pve' ? 'PvE' : 'PvP';
      toolbar.append(modeLabel);
    }
    if (!collapsed) {
      const all = button(text.all, 'all', () => { expanded = !expanded; refresh(); });
      all.setAttribute('aria-pressed', String(expanded));
      toolbar.append(all);
    }
    panel!.append(toolbar);
    if (!collapsed) {
      const table = document.createElement('table');
      table.setAttribute('aria-label', text.title);
      const colgroup = document.createElement('colgroup');
      for (const width of widths) {
        const col = document.createElement('col'); col.style.width = `${Math.max(0, width)}px`; colgroup.append(col);
      }
      table.append(colgroup);
      const body = document.createElement('tbody');
      table.append(body);
      const addRow = (label: string) => {
        const row = document.createElement('tr');
        const heading = document.createElement('th'); heading.scope = 'row'; heading.textContent = label;
        row.append(heading); body.append(row); return row;
      };
      const grades = addRow(text.grade);
      for (const column of columns) {
        const cell = document.createElement('td');
        cell.setAttribute('aria-label', column.name);
        if (column.sheet && column.grade) {
          const grade = document.createElement('span');
          grade.className = 'aegis-compare-grade'; grade.dataset.aegisGrade = column.grade; grade.textContent = column.grade;
          cell.append(grade);
        } else cell.textContent = column.loading ? text.loading : text.noSheet;
        grades.append(cell);
      }
      slots.forEach((slot, index) => {
        if (!columns.some(column => column.rows[index].length)) return;
        const row = addRow(text.labels[index]);
        columns.forEach((column, columnIndex) => {
          const cell = document.createElement('td'); cell.setAttribute('aria-label', column.name);
          const perks = column.rows[index];
          if (!perks.length) { cell.textContent = '—'; cell.title = column.sheet ? text.notRecommended : text.noSheet; }
          else {
            const list = document.createElement('div'); list.className = 'aegis-compare-perks';
            const showAll = expanded || expandedRows.has(slot);
            const best = perks.find(perk => perk.status === 'active') || perks.find(perk => perk.status === 'selectable') || perks[0];
            for (const perk of showAll ? perks : [best]) {
              const chip = document.createElement('span'); chip.className = `aegis-compare-chip aegis-compare-${perk.status}`;
              chip.title = `${text.statuses[perk.status]}: ${perk.name}`;
              chip.setAttribute('aria-label', chip.title);
              const status = document.createElement('span'); status.textContent = symbols[perk.status]; status.setAttribute('aria-hidden', 'true');
              chip.append(status);
              if (perk.icon) {
                try {
                  const url = new URL(perk.icon, 'https://www.bungie.net');
                  if (url.protocol === 'https:' && url.hostname === 'www.bungie.net') {
                    const image = document.createElement('img'); image.src = url.href; image.alt = ''; image.loading = 'lazy'; chip.append(image);
                  }
                } catch { /* A missing icon does not hide the perk name. */ }
              }
              const name = document.createElement('span'); name.textContent = perk.name; chip.append(name); list.append(chip);
            }
            if (perks.length > 1 && !expanded) {
              const more = button(showAll ? text.less : `+${perks.length - 1}`, `${slot}-${columnIndex}`, () => {
                if (expandedRows.has(slot)) expandedRows.delete(slot); else expandedRows.add(slot); refresh();
              });
              more.setAttribute('aria-label', t(showAll ? 'compareCollapseRow' : 'compareExpandRow', { slot: text.labels[index] }));
              more.setAttribute('aria-expanded', String(showAll)); list.append(more);
            }
            cell.append(list);
          }
          row.append(cell);
        });
      });
      const legend = document.createElement('div'); legend.className = 'aegis-compare-legend'; legend.textContent = `${text.legend} · ${text.previewNote}`;
      panel!.append(table, legend);
    }
    applyGradeColors(panel!);
    if (active) panel!.querySelectorAll<HTMLElement>('[data-compare-action]').forEach(control => { if (control.dataset.compareAction === active) control.focus({ preventScroll: true }); });
  }

  function button(label: string, action: string, onClick: () => void) {
    const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
    element.dataset.compareAction = action; element.addEventListener('click', onClick); return element;
  }

  function observe(mutations: MutationRecord[]) {
    if ((bucket && !bucket.isConnected) || (panel && !panel.isConnected)) { refresh(); return; }
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target?.closest('.aegis-compare-panel')) continue;
      if (target?.closest(COMPARE_BUCKET_SELECTOR) || Array.from(mutation.addedNodes).some(node =>
        node instanceof Element && (node.matches(COMPARE_BUCKET_SELECTOR) || node.querySelector(COMPARE_BUCKET_SELECTOR)))) {
        refresh(); return;
      }
    }
  }
  return { refresh, observe };
}

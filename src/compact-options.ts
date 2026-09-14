import { localizeElements, t } from './i18n';
import { refreshOptionHighlights, showOptionTab } from './options-motion';
import { renderOptionsPreview } from './options-preview';

export function refreshOptionDescriptions() {
  document.querySelectorAll<HTMLButtonElement>('[data-option-description]').forEach(button => {
    const text = t(button.dataset.optionDescription!);
    const parts = text.match(/^(.+?)\n(.+)$/) || text.match(/^(.+?)\s*[(（](.+)[)）]$/);
    button.querySelector('span')!.textContent = parts ? parts[1] : text;
    const detail = button.querySelector('small')!;
    detail.textContent = parts?.[2] || '';
    detail.hidden = !parts;
    button.title = text.replace('\n', ' ');
    button.setAttribute('aria-label', button.title);
  });
  document.querySelectorAll<HTMLElement>('.segmented-control:has([data-option-description])').forEach(control => {
    control.classList.toggle('segmented-control-two-line', !!control.querySelector('small:not([hidden])'));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector<HTMLElement>('.popup-main')!;
  const original = main.querySelector('.settings-card')!;
  const nav = document.createElement('nav');
  nav.className = 'options-tabs';
  nav.setAttribute('role', 'tablist');
  nav.dataset.i18nAriaLabel = 'compactSections';
  const panels = new Map<string, HTMLElement>();
  const scrollPositions = new Map<HTMLElement, number>();
  const tabs: HTMLButtonElement[] = [];
  let activeIndex = -1;

  function activate(index: number) {
    if (index === activeIndex) return;
    const previous = activeIndex < 0 ? undefined : panels.get(tabs[activeIndex].dataset.panel!);
    if (previous) scrollPositions.set(previous, previous.scrollTop);
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    const next = panels.get(tabs[index].dataset.panel!)!;
    showOptionTab(previous, next, Math.sign(index - activeIndex));
    next.scrollTop = scrollPositions.get(next) ?? 0;
    activeIndex = index;
    if (tabs[index].dataset.panel === 'Badges') renderOptionsPreview();
    refreshOptionHighlights(false);
  }

  for (const name of ['Scoring', 'Badges', 'Details', 'Advanced']) {
    const panel = document.createElement('section');
    panel.id = `options-${name}`;
    panel.className = 'options-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${name}`);
    const tab = document.createElement('button');
    tab.id = `tab-${name}`;
    tab.type = 'button';
    tab.dataset.panel = name;
    tab.dataset.i18n = `compact${name}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.addEventListener('click', () => activate(tabs.indexOf(tab)));
    tab.addEventListener('keydown', event => {
      const current = tabs.indexOf(tab);
      const index = event.key === 'ArrowRight' ? (current + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (index < 0) return;
      event.preventDefault();
      activate(index);
      tabs[index].focus();
    });
    tabs.push(tab);
    nav.append(tab);
    panels.set(name, panel);
  }
  main.prepend(nav);
  nav.after(...panels.values());

  function move(panel: string, ids: string[]) {
    for (const id of ids) {
      const control = document.getElementById(id);
      if (control) {
        panels.get(panel)!.append(control.closest('.input-group') ?? control);
      }
    }
  }

  // 1. Scoring tab setup
  const langDropdown = document.getElementById('aegis-language-dropdown');
  if (langDropdown) {
    panels.get('Scoring')!.append(langDropdown.closest('.input-group') ?? langDropdown);
  }

  const topActions = main.querySelector('.top-actions-row');
  if (topActions) {
    panels.get('Scoring')!.append(topActions);
  }

  move('Scoring', [
    'scoring-source-segmented',
    'aegis-db-segmented',
    'aegis-mode-segmented',
    'aegis-grade-display-segmented',
    'aegis-armor-source-segmented'
  ]);
  const rankingSource = document.getElementById('aegis-db-segmented');
  if (rankingSource) {
    const bothOpt = rankingSource.querySelector('[data-value="both"]');
    if (bothOpt) rankingSource.append(bothOpt);
  }

  // Move Custom Wishlist card to the bottom of Scoring (retaining .settings-card)
  const wishlistCard = document.getElementById('wishlist-url')?.closest('.settings-card');
  if (wishlistCard) {
    panels.get('Scoring')!.append(wishlistCard);
  }

  // 2. Badges tab setup
  move('Badges', [
    'aegis-two-tier-segmented',
    'aegis-two-tier-options',
    'aegis-badge-style-segmented',
    'aegis-upgrade-style-group',
    'aegis-badge-scale-slider',
    'aegis-badge-size-slider',
    'interactive-weapon-tile',
    'aegis-visibility-options',
    'aegis-fade-hover-segmented'
  ]);

  const portrait = document.getElementById('interactive-weapon-tile')?.closest('.input-group');
  if (portrait) {
    const posRow = portrait.querySelector('.portrait-pos-label-row') as HTMLElement;
    if (posRow) posRow.id = 'aegis-badge-position-group';
  }

  // 3. Details tab setup (Analysis & Tooltips)
  const analysisSections: [string, string[]][] = [
    ['analysisPerkCard', ['aegis-perk-order-segmented', 'aegis-matrix-segmented', 'aegis-auto-max-height-segmented', 'aegis-tooltip-width-mode-segmented', 'aegis-tooltip-width-slider-group']],
    ['analysisDetailsPopup', ['aegis-layout-segmented', 'aegis-popup-summary-segmented', 'aegis-armory-enabled-segmented']],
    ['inlineHover', ['aegis-hover-enabled-segmented']]
  ];
  for (const [key, ids] of analysisSections) {
    const section = document.createElement('section');
    section.className = 'options-section';
    if (key !== 'inlineHover') {
      const heading = document.createElement('h2');
      heading.id = `${key}-title`;
      heading.dataset.i18n = key;
      section.setAttribute('aria-labelledby', heading.id);
      section.append(heading);
    }
    for (const id of ids) {
      const control = document.getElementById(id);
      if (control) section.append(control.closest('.input-group') ?? control);
    }
    panels.get('Details')!.append(section);
  }

  // 4. Advanced tab setup (Light.gg cache, DB status)
  const lightggCard = document.getElementById('lightgg-sync-button')?.closest('.settings-card');
  if (lightggCard) {
    panels.get('Advanced')!.append(lightggCard);
  }

  for (const card of main.querySelectorAll(':scope > .settings-card, :scope > .status-card, :scope > .info-card')) {
    if (card !== original && card !== wishlistCard && card !== lightggCard) {
      panels.get('Advanced')!.append(card);
    }
  }

  // Append credit footer to all tab panels so it shows when scrolling to the bottom
  const footer = document.querySelector<HTMLElement>('.popup-footer');
  if (footer) {
    for (const panel of panels.values()) {
      panel.append(footer.cloneNode(true));
    }
    footer.remove();
  }

  // Convert sliders to inline ranges
  for (const id of ['aegis-badge-scale-slider', 'aegis-badge-size-slider', 'aegis-tooltip-width-slider']) {
    const slider = document.getElementById(id);
    if (!slider) continue;
    const group = slider.closest('.input-group');
    if (!group) continue;
    const heading = group.querySelector('div');
    if (!heading) continue;
    const label = heading.querySelector('label');
    if (!label) continue;
    label.id ||= `${id}-label`;
    slider.setAttribute('aria-labelledby', label.id);
    const span = heading.querySelector('span');
    if (span) group.append(label, slider, span);
    else group.append(label, slider);
    heading.remove();
    group.classList.add('inline-range');
  }

  original.remove();

  const labels: Record<string, string> = {
    badgeMode: 'compactFormat', badgeStyle: 'compactStyle', upgradeIndicatorStyle: 'compactUpgrade',
    activeRankingSource: 'compactSource', spreadsheetMode: 'compactActivity',
    perkEvaluation: 'compactEvaluate', armorSource: 'compactArmor', badgeTextScale: 'compactTextSize',
    badgeScale: 'compactTextSize', badgeTileSize: 'compactTextSize', badgeSize: 'compactTextSize',
    badgeExoticWeapons: 'compactExotic', badgeOtherWeapons: 'compactOther',
    scoringEngine: 'inlineEngine', perksLayout: 'inlineLayout', recPerkOrder: 'inlinePerkOrder',
    hoverCard: 'inlineHover', compactPerksMatrix: 'inlineMatrix', popupSummaryTitle: 'inlineSummary',
    armoryCardTitle: 'inlineArmory',
    autoMaxHeightTitle: 'inlineHeight', tooltipWidthMode: 'inlineWidthMode',
    tooltipWidthSlider: 'inlineWidth', fadeOnHover: 'inlinePeek', displayLanguage: 'inlineLanguage',
    engineAegis: 'inlineAegis', engineLightgg: 'inlineLightgg',
    modePve: 'inlinePve', modePvp: 'inlinePvp', modeBoth: 'sourceBoth',
    badgeColorPerk: 'inlinePerk', badgeColorGradient: 'inlineGradient',
    evalEquipped: 'inlineEquipped', evalDual: 'inlineDual', evalPotential: 'inlinePotential',
    armorLowco: 'inlineLowco', armorAegis: 'inlineAegis', layoutSide: 'inlineSide', layoutInline: 'inlineInline',
    orderSheetRank: 'inlineRank'
  };
  for (const [oldKey, key] of Object.entries(labels)) {
    main.querySelectorAll<HTMLElement>(`[data-i18n="${oldKey}"]`).forEach(el => {
      el.dataset.i18n = key;
      el.dataset.i18nTitle = oldKey;
      if (el.matches('button')) el.dataset.i18nAriaLabel = oldKey;
    });
  }
  const twoLineOptions: Record<string, [string, string]> = {
    engineAegis: ['inlineAegis', 'optionDimWishlist'],
    engineLightgg: ['inlineLightgg', 'optionRollAppraiser'],
    evalEquipped: ['inlineEquipped', 'optionActivePerks'],
    evalDual: ['optionDual', ''],
    evalPotential: ['inlinePotential', 'optionBestAvailable'],
    armorLowco: ['inlineLowco', 'optionPveBreakdown'],
    armorAegis: ['inlineAegis', 'optionTierRatings']
  };
  for (const [key, [heading, detail]] of Object.entries(twoLineOptions)) {
    const button = main.querySelector<HTMLButtonElement>(`button[data-i18n-title="${key}"]`);
    if (button && button.parentElement) {
      button.parentElement.classList.add('segmented-control-two-line');
      delete button.dataset.i18n;
      const title = document.createElement('span');
      title.dataset.i18n = heading;
      const description = document.createElement('small');
      if (detail) description.dataset.i18n = detail;
      else description.textContent = 'F → S+';
      button.replaceChildren(title, description);
    }
  }
  for (const key of ['badgeStandard', 'badgeTwoTier', 'badgeColorPerk', 'badgeColorGradient', 'modePve', 'modePvp', 'modeBoth', 'sourceBoth', 'sourceSpreadsheet', 'sourceWishlist', 'layoutSide', 'layoutInline', 'orderSheetRank', 'widthModeAuto', 'widthModeFixed']) {
    const button = main.querySelector<HTMLButtonElement>(`button[data-i18n="${key}"], button[data-i18n-title="${key}"]`);
    if (button && button.parentElement) {
      button.parentElement.classList.add('segmented-control-two-line');
      button.dataset.optionDescription = key;
      delete button.dataset.i18n;
      button.replaceChildren(document.createElement('span'), document.createElement('small'));
    }
  }
  for (const button of main.querySelectorAll<HTMLButtonElement>('#aegis-upgrade-style-segmented button')) {
    const key = button.dataset.i18n;
    if (key) {
      button.dataset.i18nTitle = key;
      button.dataset.i18nAriaLabel = key;
      delete button.dataset.i18n;
    }
    const preview = document.createElement('span');
    preview.className = 'upgrade-option-preview aegis-style-footer';
    preview.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('span');
    const none = button.dataset.value === 'none';
    icon.className = none ? 'upgrade-option-none' : `aegis-badge-upgrade-arrow aegis-upgrade-${button.dataset.value}`;
    icon.textContent = none ? '' : '▲';
    preview.append(icon);
    button.replaceChildren(preview);
  }

  document.body.classList.add('compact-options');
  activate(0);
  localizeElements(nav);
});

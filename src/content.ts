import { scoreWeapon } from './scorer';
import { WishlistDatabase, ScoringResult, AegisSheetDatabase, AegisSheetWeapon, TooltipPerk, AegisArmorSet, SheetPerksGroup, AegisShoppingDatabase, AegisShoppingItem, DualSheetInfo, ManifestWeapon, AegisChaseItem, WeaponEvaluationPayload } from './types';
import { showTooltip, hideTooltip, extractRecommendedMasterwork, renderViabilityMatrix, formatFormattedNotes, renderShoppingBannerHtml } from './tooltip';
import { initLanguage, t, getCurrentLanguage, getLocalizedElement, getLocalizedFrame, getLocalizedCategory, getLocalizedArchetypeLabel } from './i18n';
import { updateLocalizedRegistries, getLocalizedPerkName, getLocalizedWeaponName, getPerkIcon, getPerkHashFromEnglish, getEnglishWeaponNameFromHash, getEnglishPerkNameFromHash } from './hash-translator';
import { applyEvaluationLocale, EvaluationLocaleBundle, getOriginalEvaluationText } from './evaluation-i18n';
import { safeSetInnerHTML } from './dom-utils';

/** Strongly typed, GC-safe storage for weapon/armor evaluation data attached to DOM tiles */
export const weaponDataMap = new WeakMap<HTMLElement, WeaponEvaluationPayload>();
const winnowerPinBoundBadges = new WeakSet<HTMLElement>();

// Winnower (winnower.garden) cooperates with this extension. It writes the
// data-aegis-* attributes itself (no main-world script there) and provides an
// inline [data-aegis-badge-slot] per weapon name. The <meta name="dim-aegis-host">
// tag identifies a localhost dev server of Winnower.
const IS_WINNOWER_HOST =
  /(^|\.)winnower\.garden$/.test(location.hostname) ||
  document.querySelector('meta[name="dim-aegis-host"][content="winnower"]') !== null;

/** The name cell hosting a Winnower row's badge slot. */
function winnowerNameCell(row: HTMLElement): HTMLElement | null {
  return (row.querySelector('[data-aegis-badge-slot]')?.closest('td') as HTMLElement | null) ?? null;
}

function getGradeValue(grade: string): number {
  const g = (grade || '').trim().toUpperCase();
  if (g.startsWith('S')) return 100;
  if (g === 'A+') return 90;
  if (g === 'A') return 85;
  if (g === 'B+') return 75;
  if (g === 'B') return 70;
  if (g === 'C+') return 60;
  if (g === 'C') return 55;
  if (g === 'D') return 45;
  if (g === 'PVP') return 40;
  if (g === 'E') return 30;
  if (g === 'F') return 10;
  return 0;
}

function findAegisArmorSet(itemName: string): AegisArmorSet | null {
  const activeDb = (aegisMode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE) || aegisSheetDb;
  if (!activeDb) return null;

  let db: Record<string, AegisArmorSet> | undefined;
  if (aegisArmorSource === 'lowco') {
    // User explicitly chose LowCo: check PvE database's LowCo armor data first
    const lowcoDb = (aegisSheetDbPvE?.armor && Object.keys(aegisSheetDbPvE.armor).length > 0)
      ? aegisSheetDbPvE.armor
      : (aegisSheetDb?.armor && Object.keys(aegisSheetDb.armor).length > 0 ? aegisSheetDb.armor : undefined);
    db = lowcoDb || activeDb.armor || activeDb.armorAegis || aegisSheetDbPvP?.armorAegis;
  } else {
    // User chose Spreadsheet / Set Bonuses: use active mode's Set Bonuses (Finnald in PvP, Aegis in PvE)
    if (aegisMode === 'pvp') {
      db = (aegisSheetDbPvP?.armorAegis && Object.keys(aegisSheetDbPvP.armorAegis).length > 0)
        ? aegisSheetDbPvP.armorAegis
        : (activeDb.armorAegis || activeDb.armor);
    } else {
      db = (activeDb.armorAegis && Object.keys(activeDb.armorAegis).length > 0)
        ? activeDb.armorAegis
        : (activeDb.armor || activeDb.armorAegis);
    }
  }

  if (!db) return null;

  const normalizedName = itemName.toLowerCase().trim();

  // Try direct substring match first
  for (const [setName, data] of Object.entries(db)) {
    if (normalizedName.includes(setName)) {
      return data;
    }
  }

  // Fallback map for raid/dungeon sets with unique naming schemes
  const lowerName = normalizedName.replace(/[^a-z0-9\s]/g, '');

  // 1. Vault of Glass (Atheon's Memory)
  if (
    lowerName.includes('kabr') ||
    lowerName.includes('hezen lord') ||
    lowerName.includes('prime zealot') ||
    lowerName.includes('shattered vault') ||
    lowerName.includes('fragment of the prime') ||
    lowerName.includes('great prism')
  ) {
    return db["atheon's memory"] || null;
  }

  // 2. Crota's End (Crota's Memory)
  if (
    lowerName.includes('deathsinger') ||
    lowerName.includes('bone circlet') ||
    lowerName.includes('willbreaker') ||
    lowerName.includes('mark of the pit') ||
    lowerName.includes('unyielding casque') ||
    lowerName.includes('dogged gage') ||
    lowerName.includes('relentless harness') ||
    lowerName.includes('tireless strides') ||
    lowerName.includes('shroud of flies')
  ) {
    return db["crota's memory"] || null;
  }

  // 3. King's Fall (Oryx's Memory)
  if (
    lowerName.includes('war numen') ||
    lowerName.includes('darkhollow') ||
    lowerName.includes('mouth of ur') ||
    lowerName.includes('grasp of eir') ||
    lowerName.includes('chasm of yul') ||
    lowerName.includes('path of xol') ||
    lowerName.includes('bond of the wormlore')
  ) {
    return db["oryx's memory"] || null;
  }

  // 4. Garden of Salvation (Kentarch 3)
  if (lowerName.includes('kentarch') ||
    lowerName.includes('righteousness') ||
    lowerName.includes('exaltation') ||
    lowerName.includes('transcendence') ||
    lowerName.includes('ascendancy') ||
    lowerName.includes('temptation')) {
    return db["kentarch 3"] || null;
  }

  // 5. Root of Nightmares (Nezarec's Nightmare)
  if (
    lowerName.includes('agony') ||
    lowerName.includes('agonized') ||
    lowerName.includes('detestation') ||
    lowerName.includes('detested') ||
    lowerName.includes('trepidation')
  ) {
    return db["nezarec's nightmare"] || null;
  }

  // 6. Spire of the Watcher (TM Custom)
  if (
    lowerName.includes('tmgogburn') ||
    lowerName.includes('tmcogburn') ||
    lowerName.includes('tmearp') ||
    lowerName.includes('tmmoss')
  ) {
    return db["tm custom"] || null;
  }

  // 7. Iron Banner (Iron Panoply)
  if (
    lowerName.includes('iron companion') ||
    lowerName.includes('iron forerunner') ||
    lowerName.includes('iron truage') ||
    lowerName.includes('iron remembrance') ||
    lowerName.includes('iron fellowship') ||
    lowerName.includes('iron pledge') ||
    lowerName.includes('iron symmachy') ||
    lowerName.includes('iron will')
  ) {
    return db["iron panoply"] || db["iron battalion"] || null;
  }

  // 8. Grasp of Avarice (Yearning Echo)
  if (
    lowerName.includes('descending echo') ||
    lowerName.includes('twisting echo') ||
    lowerName.includes('corrupting echo')
  ) {
    return db["yearning echo"] || null;
  }

  return null;
}

const AMMO_TYPE_MAP: Record<string, string> = {
  'Autos': 'Primary',
  'Bows': 'Primary',
  'HCs': 'Primary',
  'Pulses': 'Primary',
  'Scouts': 'Primary',
  'Sidearms': 'Primary',
  'SMGs': 'Primary',
  'BGLs': 'Special',
  'Fusions': 'Special',
  'Glaives': 'Special',
  'Shotguns': 'Special',
  'Snipers': 'Special',
  'Rocket Sidearms': 'Special',
  'Traces': 'Special',
  'HGLs': 'Heavy',
  'LFRs': 'Heavy',
  'LMGs': 'Heavy',
  'Rockets': 'Heavy',
  'Swords': 'Heavy',
  'Other': 'Other'
};

let wishlistDb: WishlistDatabase = {};
let enhancedToNormalMap: Record<number, number> = {};
let scoringSource = 'aegis';
let aegisLayoutSide = 'side';
let aegisPerkOrder: 'sheet' | 'owned' = 'sheet';
let aegisDbMode = 'both';
let aegisTwoTier = false;
let aegisBadgePosition: 'bottom-left' | 'top-left' | 'top-right' | 'bottom-right' = 'bottom-left';
let aegisBadgeStyle: 'classic' | 'pill' | 'notch' = 'classic';
let aegisBadgeScale = 100;
let aegisFadeHover = false;
let aegisGradeDisplayMode: 'equipped' | 'dual' | 'potential' = 'equipped';
let aegisHoverEnabled = true;
let aegisArmorSource = 'lowco';
let aegisMode: 'pve' | 'pvp' | 'both' = 'pve';
let aegisCompactPerksMatrix = false;
let aegisInlineHeader = true;
let aegisPopupSummaryMode: 'full' | 'badge' | 'hidden' = 'full';
let aegisAutoMaxHeight = true;
let aegisTooltipWidthMode: 'auto' | 'fixed' = 'fixed';
let aegisTooltipWidth = 280;

function applyTooltipWidthStyles() {
  if (aegisTooltipWidthMode === 'auto') {
    document.documentElement.style.setProperty('--aegis-tooltip-width', 'max-content');
    document.documentElement.style.setProperty('--aegis-tooltip-min-width', '280px');
    document.documentElement.style.setProperty('--aegis-tooltip-max-width', 'min(390px, calc(100vw - 28px))');
    document.documentElement.style.setProperty('--aegis-side-panel-width', '320px');
  } else {
    const w = typeof aegisTooltipWidth === 'number' ? aegisTooltipWidth : 280;
    document.documentElement.style.setProperty('--aegis-tooltip-width', `${w}px`);
    document.documentElement.style.setProperty('--aegis-tooltip-min-width', `${w}px`);
    document.documentElement.style.setProperty('--aegis-tooltip-max-width', `min(${w}px, calc(100vw - 28px))`);
    document.documentElement.style.setProperty('--aegis-side-panel-width', `${w}px`);
  }
}

let lightggDb: Record<string, string> = {};
let aegisSheetDb: AegisSheetDatabase | null = null;
let aegisSheetDbPvE: AegisSheetDatabase | null = null;
let aegisSheetDbPvP: AegisSheetDatabase | null = null;
let aegisShoppingDb: AegisShoppingDatabase | null = null;
let aegisShoppingDbPvE: AegisShoppingDatabase | null = null;
let aegisShoppingDbPvP: AegisShoppingDatabase | null = null;
let evaluationLocaleRequestToken = 0;
let evaluationLocaleApplyQueue: Promise<void> = Promise.resolve();

async function refreshEvaluationLocale(force = false, reprocess = true): Promise<void> {
  const token = ++evaluationLocaleRequestToken;
  const locale = getCurrentLanguage();
  let bundle: EvaluationLocaleBundle | null = null;

  if (locale !== 'en') {
    bundle = await new Promise<EvaluationLocaleBundle | null>((resolve) => {
      chrome.runtime.sendMessage({ action: 'getEvaluationLocale', locale, force }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          resolve(null);
          return;
        }
        resolve(response.bundle || null);
      });
    });
  }

  if (token !== evaluationLocaleRequestToken) return;
  evaluationLocaleApplyQueue = evaluationLocaleApplyQueue.catch(() => {}).then(async () => {
    if (token !== evaluationLocaleRequestToken) return;
    const uniqueDbs = Array.from(
      new Set([aegisSheetDb, aegisSheetDbPvE, aegisSheetDbPvP].filter((db): db is AegisSheetDatabase => db !== null && db !== undefined))
    );
    for (const db of uniqueDbs) {
      await applyEvaluationLocale(db, bundle);
    }
    if (token === evaluationLocaleRequestToken && reprocess) reprocessAllElements();
  });
  await evaluationLocaleApplyQueue;
}
function normName(s: string): string {
  return (s ?? '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Pure helper function to resolve primary shopping item and alternative fallback.
 */
function resolveShoppingItem(
  primaryDb: AegisShoppingDatabase | null | undefined,
  fallbackDb: AegisShoppingDatabase | null | undefined,
  normalizedName: string
): {
  item: AegisShoppingItem | null;
  alt: { primaryName: string; role: string; priority: string; priorityNum: number } | null;
} {
  if (!normalizedName) return { item: null, alt: null };
  const item = primaryDb?.byName[normalizedName] ?? fallbackDb?.byName[normalizedName] ?? null;
  const alt = !item
    ? (primaryDb?.alternativesMap[normalizedName] ?? fallbackDb?.alternativesMap[normalizedName] ?? null)
    : null;
  return { item, alt };
}
interface PlayerOwnedItemInfo {
  name: string;
  grade: string;
  element: HTMLElement;
  isPerfect: boolean;
  hash: number;
  armorPerks?: string[];
  armorStats?: Record<string, number>;
  matchedPerks?: TooltipPerk[];
  perkHashes?: number[];
  equippedMasterwork?: string;
  instanceId?: string;
  potentialGrade?: string;
  upgradeAvailable?: boolean;
  isOmniRoll?: boolean;
  isPerfect5of5?: boolean;
}
const playerVaultInventory = new Map<string, PlayerOwnedItemInfo[]>();
let hoveredElement: HTMLElement | null = null;
let registryObserver: MutationObserver | null = null;
let nameToHash: Record<string, number> = {};
let perkNameToIcon: Record<string, string> = {};
let activeDetailsTimeout: ReturnType<typeof setTimeout> | null = null;
let completedWeapons: Record<string, boolean> = {};
let chaseList: Record<string, AegisChaseItem> = {};
let activeTab = 'explorer';
let shoppingTypeFilter: 'all' | 'weapon' | 'armor' = 'all';
let shoppingRarityFilter: 'all' | 'legendary' | 'exotic' = 'all';
let shoppingPriorityFilter: 'all' | 'high' | 'medium' | 'low' | 'niche' = 'all';
let shoppingStatusFilter: 'all' | 'ready' | 'suboptimal' | 'missing' = 'all';

// Manifest Weapons On-Demand Engine
const MANIFEST_WEAPONS_CDN_URL =
  'https://raw.githubusercontent.com/Maxeption/dim-aegis-overlay/master/data/manifest-weapons.json';
const MANIFEST_WEAPONS_FALLBACK_URL =
  'https://raw.githubusercontent.com/Maxeption/dim-aegis-overlay/WIP/data/manifest-weapons.json';

let manifestWeaponsMap: Record<string, ManifestWeapon> = {};
let manifestWeaponsByHash: Record<number, ManifestWeapon> = {};
let manifestWeaponList: ManifestWeapon[] = [];
let manifestLoadingPromise: Promise<boolean> | null = null;
let manifestLoaded = false;

let currentChaseSearchQuery = '';

async function loadManifestWeapons(): Promise<boolean> {
  if (manifestLoaded && manifestWeaponList.length > 0) return true;
  if (manifestLoadingPromise) return manifestLoadingPromise;

  manifestLoadingPromise = (async () => {
    try {
      let list: ManifestWeapon[] | null = null;

      // 1. Try local extension runtime asset (instant developer & local load)
      try {
        const localUrl = chrome.runtime.getURL('data/manifest-weapons.json');
        const localRes = await fetch(localUrl);
        if (localRes.ok) {
          list = await localRes.json();
        }
      } catch (e) {}

      // 2. Try chrome.storage.local cache
      if (!list || list.length === 0) {
        try {
          const stored = await chrome.storage.local.get(['aegisManifestWeapons']);
          if (stored.aegisManifestWeapons && Array.isArray(stored.aegisManifestWeapons) && stored.aegisManifestWeapons.length > 0) {
            list = stored.aegisManifestWeapons;
          }
        } catch (e) {}
      }

      // 3. Fetch from CDN mirror if not cached
      if (!list || list.length === 0) {
        try {
          const res = await fetch(MANIFEST_WEAPONS_CDN_URL, { cache: 'no-cache' });
          if (res.ok) {
            list = await res.json();
          }
        } catch (e) {}

        if (!list || list.length === 0) {
          try {
            const res = await fetch(MANIFEST_WEAPONS_FALLBACK_URL, { cache: 'no-cache' });
            if (res.ok) {
              list = await res.json();
            }
          } catch (e) {}
        }

        if (list && Array.isArray(list) && list.length > 0) {
          try {
            await chrome.storage.local.set({ aegisManifestWeapons: list });
          } catch (e) {}
        }
      }

      if (list && Array.isArray(list) && list.length > 0) {
        manifestWeaponList = list;
        manifestWeaponsMap = {};
        manifestWeaponsByHash = {};
        for (const w of list) {
          if (w.name) {
            const norm = w.name.toLowerCase().trim();
            if (!manifestWeaponsMap[norm] || (!w.superseded && manifestWeaponsMap[norm].superseded)) {
              manifestWeaponsMap[norm] = w;
            }
          }
          if (w.hash) {
            manifestWeaponsByHash[w.hash] = w;
          }
        }
        manifestLoaded = true;
        return true;
      }
    } catch (err) {
      console.warn('Failed to load manifest weapons database:', err);
    } finally {
      manifestLoadingPromise = null;
    }

    return false;
  })();

  return manifestLoadingPromise;
}

function isShoppingItemArmor(item: AegisShoppingItem): boolean {
  if (item.isArmor) return true;
  const n = normName(item.name);
  const activeDb = (aegisMode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE) || aegisSheetDb;
  if (activeDb?.armorAegis && activeDb.armorAegis[n]) return true;
  if (activeDb?.armor && activeDb.armor[n]) return true;
  const r = item.role.toLowerCase();
  if (r.includes('pcs') || r.includes('dr') || r.includes('armor') || r.includes('regen') || r.includes('augmentation')) return true;
  const c1 = item.column1.toLowerCase();
  if (c1.includes('specialist') || c1.includes('powerhouse') || c1.includes('gunner') || c1.includes('skirmisher')) return true;
  return false;
}

function isShoppingItemExotic(item: AegisShoppingItem): boolean {
  if (item.isExotic) return true;
  const n = normName(item.name);
  const activeDb = (aegisMode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE) || aegisSheetDb;
  const w = activeDb?.weapons[n];
  if (w && (w.tier?.toLowerCase() === 'exotic' || w.rank?.toLowerCase() === 'exotic')) return true;
  if (item.role.toLowerCase().includes('exotic')) return true;
  if (item.source.toLowerCase().includes('monument') || item.source.toLowerCase().includes('kiosk') || item.source.toLowerCase().includes('rahool')) return true;
  return false;
}

const expandedShoppingCards = new Set<string>();

function renderCompactShoppingPerkChip(perkName: string, isCol1: boolean): string {
  const trimmed = perkName.trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'n/a') return '';
  const cleanName = cleanPerkName(trimmed);
  const displayName = getLocalizedPerkName(trimmed);
  const icon = getPerkIcon(trimmed) || perkNameToIcon[normName(trimmed)] || perkNameToIcon[cleanName.toLowerCase()] || perkNameToIcon[trimmed.toLowerCase().trim()];
  const iconHtml = icon ? `<img src="https://www.bungie.net${icon}" class="aegis-shopping-chip-icon" />` : '';
  const colClass = isCol1 ? 'col1' : 'col2';
  return `
    <span class="aegis-shopping-perk-chip ${colClass}" title="${trimmed}">
      ${iconHtml}
      <span class="aegis-shopping-chip-text">${displayName}</span>
    </span>
  `;
}

let perkNameToHash: Record<string, number> = {};
const expandedChaseWeapons = new Set<string>();
interface OwnedItem {
  instanceId: string;
  name: string;
  hash: number;
  perkHashes: number[];
  perkNames: string[];
}
const ownedItemsMap = new Map<string, OwnedItem>();
let weaponPossiblePerksCache: Record<string, {
  barrels: string[];
  mags: string[];
  perk1s: string[];
  perk2s: string[];
  origins: string[];
  isFromManifest?: boolean;
}> = {};

const requestedWeapons = new Set<string>();
const failedWeaponRequests = new Map<string, number>();

/**
 * Chase cards created before optional component filters were introduced used the
 * first spreadsheet barrel/mag/origin as an implicit requirement. Clear only
 * those untouched defaults; deliberately chosen alternatives are preserved.
 */
function clearLegacyDefaultChaseFilters(): boolean {
  if (!aegisSheetDb?.weapons) return false;
  let changed = false;
  const firstRecommendation = (value: string) => value.split(/[\/\n,]+/).map(part => part.trim()).find(Boolean) || '';
  for (const item of Object.values(chaseList)) {
    const weapon = aegisSheetDb.weapons[item.name.toLowerCase().trim()];
    if (!weapon) continue;
    for (const [key, recommendation] of [
      ['barrel', firstRecommendation(weapon.barrel)],
      ['mag', firstRecommendation(weapon.mag)],
      ['origin', firstRecommendation(weapon.origin)],
    ] as const) {
      if (recommendation && item[key] === recommendation) {
        item[key] = '';
        changed = true;
      }
    }
  }
  return changed;
}

function updatePerkNameToHash(perkRegistry: Record<string, { name: string, icon: string }>) {
  if (!perkRegistry) return;
  perkNameToHash = {};
  for (const [hashStr, p] of Object.entries(perkRegistry)) {
    const hash = parseInt(hashStr, 10);
    if (p && p.name && !isNaN(hash)) {
      perkNameToHash[p.name.toLowerCase().trim()] = hash;
      const clean = cleanPerkName(p.name);
      perkNameToHash[clean] = hash;
    }
  }
}

function updatePerkNameToIcon(perkRegistry: Record<string, { name: string, icon: string }>) {
  if (!perkRegistry) return;
  for (const p of Object.values(perkRegistry)) {
    if (p && p.name && p.icon) {
      const cleanName = cleanPerkName(p.name);
      perkNameToIcon[cleanName] = p.icon;
      perkNameToIcon[p.name.toLowerCase().trim()] = p.icon;
    }
  }
}

function updateNameToHashFromWishlist() {
  if (!wishlistDb) return;
  for (const [hashStr, rolls] of Object.entries(wishlistDb)) {
    const hash = parseInt(hashStr, 10);
    if (isNaN(hash)) continue;
    for (const roll of rolls) {
      if (roll.title) {
        const normName = roll.title.split('\n')[0].trim().toLowerCase();
        nameToHash[normName] = hash;
        const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
        nameToHash[baseName] = hash;
      }
    }
  }
}

/**
 * Debounced persistence of the perk registry. The registry updates constantly
 * while items are scanned; writing the full object to storage on every update
 * floods storage.onChanged listeners. Persist at most once every few seconds.
 */
let perkRegistryPersistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPerkRegistry: Record<string, { name: string; icon: string }> | null = null;

function schedulePerkRegistryPersist(registry: Record<string, { name: string; icon: string }>) {
  pendingPerkRegistry = registry;
  if (perkRegistryPersistTimer) return;
  perkRegistryPersistTimer = setTimeout(() => {
    perkRegistryPersistTimer = null;
    if (pendingPerkRegistry) {
      chrome.storage.local.set({ perkRegistry: pendingPerkRegistry });
      pendingPerkRegistry = null;
    }
  }, 3000);
}

/**
 * Sets up a MutationObserver on the global perk registry element to watch for
 * resolved perk names and trigger real-time updates to the active tooltip.
 */
function setupRegistryObserver() {
  // The registry element is created by the main-world script, which does not
  // run on Winnower. Without this gate, every call would add another
  // body-wide observer waiting for an element that never appears.
  if (IS_WINNOWER_HOST) return;
  if (registryObserver) return;
  const registryEl = document.getElementById('aegis-global-perk-registry');
  if (!registryEl) {
    // Wait for the main world script to create the registry element
    const bodyObserver = new MutationObserver(() => {
      const el = document.getElementById('aegis-global-perk-registry');
      if (el) {
        bodyObserver.disconnect();
        setupRegistryObserver();
      }
    });
    bodyObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    return;
  }

  registryObserver = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-registry') {
        const registryStr = registryEl.getAttribute('data-registry');
        if (registryStr) {
          try {
            const parsed = JSON.parse(registryStr);
            schedulePerkRegistryPersist(parsed);
            updatePerkNameToIcon(parsed);
            updateLocalizedRegistries(parsed);
          } catch (e) {
            // Ignore
          }
        }

        const weaponRegEl = document.getElementById('aegis-global-weapon-registry');
        if (weaponRegEl) {
          const weaponStr = weaponRegEl.getAttribute('data-registry');
          if (weaponStr) {
            try {
              const parsedWeapons = JSON.parse(weaponStr);
              updateLocalizedRegistries({}, parsedWeapons);
            } catch (e) {
              // Ignore
            }
          }
        }

        if (hoveredElement) {
          const data = weaponDataMap.get(hoveredElement);
          if (data && data.result && data.result.grade) {
            showTooltip(
              hoveredElement,
              data.result,
              data.name,
              data.perksMap,
              data.activeHashes,
              scoringSource === 'lightgg',
              data.sheetWeapon,
              data.bestAlternative,
              data.isBestInClass,
              data.sheetPerks,
              perkNameToIcon,
              data.sheetArmor,
              data.equippedMasterwork,
              aegisMode as any,
              aegisPerkOrder,
              data.shoppingItem,
              data.shoppingAlt,
              {
                compactPerksMatrix: aegisCompactPerksMatrix,
                inlineHeader: aegisInlineHeader,
                autoMaxHeight: aegisAutoMaxHeight,
                tooltipWidthMode: aegisTooltipWidthMode,
                tooltipWidth: aegisTooltipWidth,
                dualInfo: aegisMode === 'both' ? data.dualInfo : undefined,
              }
            );
          }
        }
      }

      if (mutation.type === 'attributes' && mutation.attributeName === 'data-weapon-perks-response') {
        const responseStr = registryEl.getAttribute('data-weapon-perks-response');
        if (responseStr) {
          registryEl.removeAttribute('data-weapon-perks-response'); // Clear immediately
          try {
            const { results } = JSON.parse(responseStr);
            let hasNewData = false;
            if (Array.isArray(results)) {
              for (const { name, possible, error } of results) {
                if (!name) continue;
                const norm = name.toLowerCase().trim();
                if (possible) {
                  failedWeaponRequests.delete(norm);
                  addDiagnosticLog(`Received perks response for "${name}" (Col3: ${possible.perk1s?.length || 0}, Col4: ${possible.perk2s?.length || 0}, Barrels: ${possible.barrels?.length || 0}, Mags: ${possible.mags?.length || 0}).`);
                  weaponPossiblePerksCache[norm] = possible;
                  hasNewData = true;
                } else {
                  failedWeaponRequests.set(norm, Date.now());
                  addDiagnosticLog(`Could not load perks for "${name}": ${error || 'unknown error'}`);
                }
              }
              if (hasNewData) {
                renderResults();
              }
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }
  });

  registryObserver.observe(registryEl, {
    attributes: true,
    attributeFilter: ['data-registry', 'data-weapon-perks-response'],
  });
}

/**
 * Parses a comma, slash, or newline delimited recommendation string into trimmed components.
 * High-performance allocation-free scanner avoids intermediate array copies and regex overhead.
 */
function parseRecommendations(str: string): string[] {
  if (!str) return [];
  const result: string[] = [];
  let start = 0;
  const len = str.length;
  for (let i = 0; i <= len; i++) {
    const char = i < len ? str[i] : '\n';
    if (char === '/' || char === '\n' || char === ',') {
      if (start < i) {
        // Find trimmed boundaries within [start, i)
        let tStart = start;
        let tEnd = i - 1;
        while (tStart <= tEnd && str.charCodeAt(tStart) <= 32) {
          tStart++;
        }
        while (tEnd >= tStart && str.charCodeAt(tEnd) <= 32) {
          tEnd--;
        }
        if (tStart <= tEnd) {
          result.push(str.substring(tStart, tEnd + 1));
        }
      }
      start = i + 1;
    }
  }
  return result;
}

function cleanPerkName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*/g, '') // strip parentheses (e.g. (best), (PvE))
    .replace(/[*+]/g, '')            // strip markers like or +
    .trim();
}

/** Treat DIM's enhanced display names as the same chase target as their base perk. */
function cleanPerkNameForMatch(name: string): string {
  return cleanPerkName(name).replace(/^enhanced\s+/, '').trim();
}

function cleanWeaponNameBase(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)\s+version$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)$/gi, '')
    .replace(/^(adept|timelost|harrowed)\s+/gi, '')
    .trim();
}

function findAegisWeapon(
  name: string,
  perksMap?: Record<number, { name: string; icon: string }>,
  activeHashes?: number[],
  elText?: string,
  itemHash?: number,
  targetDb?: AegisSheetDatabase | null
): AegisSheetWeapon | null {
  const db = targetDb || aegisSheetDb;
  if (!db || !db.weapons) return null;

  let lookupName = name.split('\n')[0].trim().toLowerCase();
  if (itemHash) {
    const canonicalEnglish = getEnglishWeaponNameFromHash(itemHash);
    if (canonicalEnglish) {
      lookupName = canonicalEnglish.toLowerCase().trim();
    }
  }

  const normalized = lookupName;
  const baseNormalized = cleanWeaponNameBase(normalized);

  // 1. Get variants array for this base weapon name
  const variants = db.variants?.[baseNormalized] || db.variants?.[normalized] || [];

  // 2. Multi-variant disambiguation (when 2+ variants exist for the base name)
  if (variants.length > 1) {
    // Gather ALL perk names & text signals attached to this item (from perksMap, activeHashes, element text)
    const allItemPerkNames: string[] = [];
    if (perksMap) {
      for (const p of Object.values(perksMap)) {
        if (p?.name) {
          const pName = p.name.toLowerCase().trim();
          if (!allItemPerkNames.includes(pName)) {
            allItemPerkNames.push(pName);
          }
        }
      }
    }
    if (activeHashes && perksMap) {
      for (const h of activeHashes) {
        if (perksMap[h]?.name) {
          const hName = perksMap[h].name.toLowerCase().trim();
          if (!allItemPerkNames.includes(hName)) {
            allItemPerkNames.push(hName);
          }
        }
      }
    }
    if (elText) {
      const textWords = elText.toLowerCase().split(/[^a-z0-9]+/);
      for (const w of textWords) {
        if (w && w.length > 2 && !allItemPerkNames.includes(w)) {
          allItemPerkNames.push(w);
        }
      }
    }

    // Check specific Origin Traits & Source Keywords
    const hasIndomitability = allItemPerkNames.some(p => p.includes('indomitability') || p.includes('onslaught') || p.includes('brave'));
    const hasEllipticalOrbit = allItemPerkNames.some(p => p.includes('elliptical orbit') || p.includes('pantheon'));
    const hasGravityWell = allItemPerkNames.some(p => p.includes('gravity well') || p.includes('rotn') || p.includes('rite of the nine'));
    const hasSouldrinker = allItemPerkNames.some(p => p.includes('souldrinker') || p.includes('soul drinker') || p.includes('vow of the disciple'));
    const hasBrayInheritance = allItemPerkNames.some(p => p.includes('bray inheritance') || p.includes('deep stone crypt'));

    // A. Into the Light / BRAVE version (Indomitability / Onslaught / BRAVE)
    if (hasIndomitability) {
      const match = variants.find(v => (v.versionTag === 'brave' || v.name.toLowerCase().includes('brave')));
      if (match) return match;
    }

    // B. Pantheon version (Elliptical Orbit / Pantheon)
    if (hasEllipticalOrbit) {
      const match = variants.find(v => (v.versionTag === 'pantheon' || v.name.toLowerCase().includes('pantheon')));
      if (match) return match;
    }

    // C. Rite of the Nine / RotN version (Gravity Well / RotN / Rite of the Nine)
    if (hasGravityWell) {
      const match = variants.find(v => (v.versionTag === 'rotn' || v.name.toLowerCase().includes('rotn')));
      if (match) return match;
    }

    // D. Raid / Legacy versions (Souldrinker for Vow Forbearance, Bray Inheritance for DSC Succession)
    if (hasSouldrinker || hasBrayInheritance) {
      const match = variants.find(v => !v.versionTag && !v.name.toLowerCase().includes('brave') && !v.name.toLowerCase().includes('pantheon') && !v.name.toLowerCase().includes('rotn'));
      if (match) return match;
    }

    // E. High Albedo (Rocket Sidearm vs Primary Sidearm)
    if (baseNormalized.includes('high albedo')) {
      const isRocketSidearm = allItemPerkNames.some(p => p.includes('rocket') || p.includes('nanotech') || p.includes('origin'));
      if (isRocketSidearm) {
        const match = variants.find(v => v.frame.toLowerCase().includes('rocket') || (v.origin && v.origin !== '-') || v.source?.toLowerCase().includes('triumph'));
        if (match) return match;
      }
    }

    // F. Universal Origin Trait Matcher:
    // If the variant's origin in Aegis's sheet matches any perk on this item
    for (const variant of variants) {
      if (variant.origin && variant.origin !== '-') {
        const cleanOrigin = cleanPerkName(variant.origin);
        if (allItemPerkNames.some(p => isPerkMatch(p, cleanOrigin))) {
          return variant;
        }
      }
    }

    // G. Universal Perk Synergy / Overlap Score Fallback:
    // If origin traits are missing, score each variant against the item's available perks
    if (allItemPerkNames.length > 0) {
      let bestVariant: AegisSheetWeapon | null = null;
      let maxScore = -1;

      for (const variant of variants) {
        let score = 0;
        const vP1s = variant.perk1.split(/[\/\n,]+/).map(cleanPerkName).filter(Boolean);
        const vP2s = variant.perk2.split(/[\/\n,]+/).map(cleanPerkName).filter(Boolean);

        for (const itemPerk of allItemPerkNames) {
          if (vP1s.some(vp => isPerkMatch(itemPerk, vp))) score += 2;
          if (vP2s.some(vp => isPerkMatch(itemPerk, vp))) score += 2;
        }

        if (score > maxScore) {
          maxScore = score;
          bestVariant = variant;
        }
      }

      if (bestVariant && maxScore > 0) {
        return bestVariant;
      }
    }

    // H. Fallback: if no origin traits or perk overlap matched, prefer legacy variant if one exists
    const legacyMatch = variants.find(v => !v.versionTag && !v.name.toLowerCase().includes('brave') && !v.name.toLowerCase().includes('pantheon') && !v.name.toLowerCase().includes('rotn'));
    if (legacyMatch) return legacyMatch;

    return variants[0];
  }

  // 3. Single variant or no variant list fallback
  if (db.weapons[normalized]) return db.weapons[normalized];
  if (db.weapons[baseNormalized]) return db.weapons[baseNormalized];
  if (variants.length > 0 && variants[0]) return variants[0];

  // 4. Fuzzy fallback across all weapons in the sheet
  for (const [sheetKey, weapon] of Object.entries(db.weapons)) {
    const cleanKey = cleanWeaponNameBase(sheetKey);
    if (cleanKey === baseNormalized || sheetKey.toLowerCase().trim() === normalized) {
      return weapon;
    }
  }

  return null;
}

function findWeaponCategory(weaponName: string, itemHash?: number, targetDb?: AegisSheetDatabase | null): string {
  const db = targetDb || aegisSheetDb;
  if (!db || !db.categories) return '';
  let lookupName = weaponName.split('\n')[0].trim().toLowerCase();
  if (itemHash) {
    const canonicalEnglish = getEnglishWeaponNameFromHash(itemHash);
    if (canonicalEnglish) {
      lookupName = canonicalEnglish.toLowerCase().trim();
    }
  }
  const norm = lookupName;
  const baseNorm = norm.replace(/\s*\([^)]+\)\s*$/, '').trim();
  for (const [tab, list] of Object.entries(db.categories)) {
    if (list.some(w => {
      const n = w.name.toLowerCase();
      return n === norm || n === baseNorm;
    })) {
      return tab;
    }
  }
  return '';
}

interface SuperiorsResult {
  byEnergy: AegisSheetWeapon | null;
  byFrame: AegisSheetWeapon | null;
  byBoth: AegisSheetWeapon | null;
}

const superiorsCache = new Map<string, SuperiorsResult>();

function findSuperiors(categoryTab: string, currentEnergy: string, currentFrame: string, targetDb?: AegisSheetDatabase | null): SuperiorsResult {
  const db = targetDb || aegisSheetDb;
  if (!db || !db.categories || !categoryTab) {
    return { byEnergy: null, byFrame: null, byBoth: null };
  }

  const normEnergy = currentEnergy.toLowerCase().trim();
  const normFrame = currentFrame.toLowerCase().replace(/ frame$/, '').trim();
  const dbTag = db === aegisSheetDb ? 'active' : (db === aegisSheetDbPvP ? 'pvp' : 'pve');
  const cacheKey = `${categoryTab}:${normEnergy}:${normFrame}:${dbTag}`;

  const cached = superiorsCache.get(cacheKey);
  if (cached) return cached;

  const list = db.categories[categoryTab] || [];
  const byEnergy = list.find(w => w.energy.toLowerCase().trim() === normEnergy) || null;
  const byFrame = list.find(w => w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame) || null;
  const byBoth = list.find(w => 
    w.energy.toLowerCase().trim() === normEnergy && 
    w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame
  ) || null;

  const result: SuperiorsResult = { byEnergy, byFrame, byBoth };
  if (superiorsCache.size > 1000) superiorsCache.clear();
  superiorsCache.set(cacheKey, result);
  return result;
}

function isWordSubsequence(subWords: string[], mainWords: string[]): boolean {
  let subIdx = 0;
  for (let mainIdx = 0; mainIdx < mainWords.length && subIdx < subWords.length; mainIdx++) {
    if (mainWords[mainIdx] === subWords[subIdx]) {
      subIdx++;
    }
  }
  return subIdx === subWords.length;
}

interface PerkMatchData {
  clean: string;
  words: string[];
  stripped: string;
}

/** Cache map to store pre-parsed representations of perk and recommendation names. */
const perkMatchCache = new Map<string, PerkMatchData>();

/**
 * Returns pre-parsed, memoized string representation of a perk or recommendation name.
 * Caches regex cleanup, word arrays, and stripped strings to avoid costly re-parsing in hot loops.
 */
function getPerkMatchData(name: string): PerkMatchData {
  const key = name ?? '';
  let cached = perkMatchCache.get(key);
  if (!cached) {
    const clean = key.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = clean ? clean.split(' ') : [];
    const stripped = clean.replace(/\s+/g, '');
    cached = { clean, words, stripped };
    perkMatchCache.set(key, cached);
  }
  return cached;
}

/**
 * Checks whether a given perk name matches a recommended perk string.
 * Uses memoized perk data via getPerkMatchData for high-performance matching.
 */
function isPerkMatch(perkName: string, recName: string): boolean {
  const pData = getPerkMatchData(perkName);
  const rData = getPerkMatchData(recName);

  if (!pData.clean || !rData.clean) return false;

  if (pData.stripped === rData.stripped) return true;

  if (isWordSubsequence(rData.words, pData.words)) return true;
  if (isWordSubsequence(pData.words, rData.words)) return true;

  return false;
}

function computeGrade(
  p1: 'active' | 'selectable' | 'missing',
  p2: 'active' | 'selectable' | 'missing',
  mag: 'active' | 'selectable' | 'missing',
  barrel: 'active' | 'selectable' | 'missing',
  origin: 'active' | 'selectable' | 'missing',
  treatSelectableAsActive: boolean
): 'S+' | 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F' {
  const effectiveP1 = p1 === 'active' || (treatSelectableAsActive && p1 === 'selectable');
  const effectiveP2 = p2 === 'active' || (treatSelectableAsActive && p2 === 'selectable');
  const effectiveMag = mag === 'active' || (treatSelectableAsActive && mag === 'selectable');
  const effectiveBarrel = barrel === 'active' || (treatSelectableAsActive && barrel === 'selectable');
  const effectiveOrigin = origin === 'active' || (treatSelectableAsActive && origin === 'selectable');

  const activeTraitsCount = (p1 === 'active' ? 1 : 0) + (p2 === 'active' ? 1 : 0);
  const selectableTraitsCount = (p1 === 'selectable' ? 1 : 0) + (p2 === 'selectable' ? 1 : 0);
  const hasActiveMag = mag === 'active';
  const hasActiveBarrel = barrel === 'active';

  // 1. S+ : Traits (P1 & P2) + Mag + Barrel + Origin all active
  if (effectiveP1 && effectiveP2 && effectiveMag && effectiveBarrel && effectiveOrigin) {
    return 'S+';
  }

  // 2. S : Traits (P1 & P2) + Mag active
  if (effectiveP1 && effectiveP2 && effectiveMag) {
    return 'S';
  }

  // 3. A+ : Traits (P1 & P2) + Barrel active
  if (effectiveP1 && effectiveP2 && effectiveBarrel) {
    return 'A+';
  }

  // 4. A : Traits (P1 & P2) active
  if (effectiveP1 && effectiveP2) {
    return 'A';
  }

  // 5. B+ : One active Trait + One selectable Trait + Mag or Barrel active
  if (!treatSelectableAsActive) {
    if (activeTraitsCount === 1 && selectableTraitsCount === 1 && (hasActiveMag || hasActiveBarrel)) {
      return 'B+';
    }
    // 6. B : One active Trait + One selectable Trait
    if (activeTraitsCount === 1 && selectableTraitsCount === 1) {
      return 'B';
    }
  }

  // 7. C : One active Trait + Mag or Barrel active
  const effectiveActiveTraitsCount = (effectiveP1 ? 1 : 0) + (effectiveP2 ? 1 : 0);
  if (effectiveActiveTraitsCount === 1 && (effectiveMag || effectiveBarrel)) {
    return 'C';
  }

  // 8. D : One active or selectable Trait
  if (effectiveActiveTraitsCount === 1 || (!treatSelectableAsActive && selectableTraitsCount === 1)) {
    return 'D';
  }

  return 'F';
}

interface EvaluatedPerk {
  name: string;
  icon?: string;
  matched: boolean;
  status: 'active' | 'selectable' | 'missing';
}

function evaluateCategoryPerks(
  recString: string,
  availablePerks: { hash: number; name: string; icon: string; active: boolean }[],
  perksMap: Record<number, { name: string; icon: string }>
): EvaluatedPerk[] {
  if (!recString || recString.trim() === '' || recString.trim() === '-' || recString.toLowerCase() === 'none') {
    return [];
  }

  // Split by slashes or newlines
  const recs = recString
    .split(/[\/\n]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const results: EvaluatedPerk[] = [];

  for (const rawRec of recs) {
    const rec = cleanPerkName(rawRec);
    if (!rec) continue;

    const recHash = getPerkHashFromEnglish(rawRec);
    let foundPerk: { hash: number; name: string; icon: string; active: boolean } | null = null;

    const matchesRec = (p: { hash: number; name: string }) => {
      // 1. Direct name match (e.g. English DIM)
      if (isPerkMatch(p.name, rec)) return true;

      // 2. English name from Hash match (e.g. non-English DIM)
      const englishName = getEnglishPerkNameFromHash(p.hash);
      if (englishName && isPerkMatch(englishName, rec)) return true;

      // 3. Normal hash from enhancedToNormalMap
      const normalHash = enhancedToNormalMap[p.hash];
      if (normalHash) {
        const normalEnglish = getEnglishPerkNameFromHash(normalHash);
        if (normalEnglish && isPerkMatch(normalEnglish, rec)) return true;
        if (recHash && normalHash === recHash) return true;
      }

      // 4. Hash exact match
      if (recHash && p.hash === recHash) return true;

      return false;
    };
    
    // First pass: try to find an active matching perk
    for (const perk of availablePerks) {
      if (perk.active && matchesRec(perk)) {
        foundPerk = perk;
        break;
      }
    }

    // Second pass: if no active match, try to find a selectable matching perk
    if (!foundPerk) {
      for (const perk of availablePerks) {
        if (matchesRec(perk)) {
          foundPerk = perk;
          break;
        }
      }
    }

    if (foundPerk) {
      results.push({
        name: perksMap[foundPerk.hash]?.name || foundPerk.name,
        icon: foundPerk.icon,
        matched: true,
        status: foundPerk.active ? 'active' : 'selectable',
      });
    } else {
      // Localized display name and icon for missing perks
      const displayName = getLocalizedPerkName(rawRec);
      const missingIcon = getPerkIcon(rawRec) || perkNameToIcon[rec] || perkNameToIcon[displayName.toLowerCase().trim()];
      results.push({
        name: displayName,
        icon: missingIcon || undefined,
        matched: false,
        status: 'missing',
      });
    }
  }

  return results;
}

function getSlotStatusFromEvaluations(evals: EvaluatedPerk[]): 'active' | 'selectable' | 'missing' {
  if (evals.length === 0) {
    return 'active'; // treated as active if no recommendations exist
  }
  if (evals.some(e => e.status === 'active')) {
    return 'active';
  }
  if (evals.some(e => e.status === 'selectable')) {
    return 'selectable';
  }
  return 'missing';
}

function scoreSheetWeapon(
  sheetWeapon: AegisSheetWeapon,
  perksMap: Record<number, { name: string; icon: string }>,
  activeHashes: number[]
): {
  result: ScoringResult;
  potentialGrade: string;
  upgradeAdvice: string;
  sheetPerks: SheetPerksGroup;
} {
  if (sheetWeapon.exoticViability || sheetWeapon.source === 'Exotic') {
    const grade = sheetWeapon.tier ? sheetWeapon.tier.trim() : 'S';
    return {
      result: {
        grade,
        matchPercentage: 100,
        matchedPerks: activeHashes,
        missingPerks: [],
        notes: sheetWeapon.notes,
        wishlistPerks: [],
      },
      potentialGrade: grade,
      upgradeAdvice: '',
      sheetPerks: { matched: [], missing: [], all: [] }
    };
  }

  const availablePerks: { hash: number; name: string; icon: string; active: boolean }[] = [];
  for (const [hashStr, p] of Object.entries(perksMap)) {
    const hash = parseInt(hashStr, 10);
    if (!isNaN(hash)) {
      availablePerks.push({
        hash,
        name: p.name.toLowerCase().trim(),
        icon: p.icon,
        active: activeHashes.includes(hash),
      });
    }
  }

  const barrelEvals = evaluateCategoryPerks(sheetWeapon.barrel, availablePerks, perksMap);
  const magEvals = evaluateCategoryPerks(sheetWeapon.mag, availablePerks, perksMap);
  const p1Evals = evaluateCategoryPerks(sheetWeapon.perk1, availablePerks, perksMap);
  const p2Evals = evaluateCategoryPerks(sheetWeapon.perk2, availablePerks, perksMap);
  const originEvals = evaluateCategoryPerks(sheetWeapon.origin, availablePerks, perksMap);

  const barrelStatus = getSlotStatusFromEvaluations(barrelEvals);
  const magStatus = getSlotStatusFromEvaluations(magEvals);
  const p1Status = getSlotStatusFromEvaluations(p1Evals);
  const p2Status = getSlotStatusFromEvaluations(p2Evals);
  const originStatus = getSlotStatusFromEvaluations(originEvals);

  const currentGrade = computeGrade(p1Status, p2Status, magStatus, barrelStatus, originStatus, false);
  const potentialGrade = computeGrade(p1Status, p2Status, magStatus, barrelStatus, originStatus, true);

  let pct = 0;
  const slots = [barrelStatus, magStatus, p1Status, p2Status];
  for (const s of slots) {
    if (s === 'active') pct += 25;
    else if (s === 'selectable') pct += 15;
  }

  const matchedList: TooltipPerk[] = [];
  const missingList: TooltipPerk[] = [];
  const allList: TooltipPerk[] = [];

  const categories: { type: TooltipPerk['type']; evals: EvaluatedPerk[] }[] = [
    { type: 'barrel', evals: barrelEvals },
    { type: 'mag', evals: magEvals },
    { type: 'perk1', evals: p1Evals },
    { type: 'perk2', evals: p2Evals },
    { type: 'origin', evals: originEvals },
  ];

  const selectablePerkNames: string[] = [];

  for (const cat of categories) {
    for (let i = 0; i < cat.evals.length; i++) {
      const perk = cat.evals[i];
      const tooltipPerk: TooltipPerk = {
        name: perk.name,
        icon: perk.icon,
        matched: perk.matched,
        type: cat.type,
        status: perk.status,
        rankIndex: i + 1,
      };

      allList.push(tooltipPerk);

      if (perk.status === 'active' || perk.status === 'selectable') {
        matchedList.push(tooltipPerk);
        if (perk.status === 'selectable') {
          const formattedName = perk.name.replace(/\b\w/g, c => c.toUpperCase());
          if (!selectablePerkNames.includes(formattedName)) {
            selectablePerkNames.push(formattedName);
          }
        }
      } else {
        missingList.push(tooltipPerk);
      }
    }
  }

  const isSlotMatched = (s: 'active' | 'selectable' | 'missing') => s === 'active' || s === 'selectable';
  const hasBarrel = isSlotMatched(barrelStatus) || !sheetWeapon.barrel || sheetWeapon.barrel === '-';
  const hasMag = isSlotMatched(magStatus) || !sheetWeapon.mag || sheetWeapon.mag === '-';
  const hasP1 = isSlotMatched(p1Status);
  const hasP2 = isSlotMatched(p2Status);
  const hasOrigin = isSlotMatched(originStatus) || !sheetWeapon.origin || sheetWeapon.origin === '-';

  const matchedSlots = (hasBarrel ? 1 : 0) + (hasMag ? 1 : 0) + (hasP1 ? 1 : 0) + (hasP2 ? 1 : 0) + (hasOrigin ? 1 : 0);
  const isPerfect5of5 = hasBarrel && hasMag && hasP1 && hasP2 && hasOrigin;
  const isOmniRoll = missingList.length === 0 && matchedList.length >= 4;

  let upgradeAdvice = '';
  const gradeOrder = ['F', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+'];
  const curIdx = gradeOrder.indexOf(currentGrade);
  const potIdx = gradeOrder.indexOf(potentialGrade);

  if (potIdx > curIdx && selectablePerkNames.length > 0) {
    const perksStr = selectablePerkNames.join(' / ');
    upgradeAdvice = t('upgradeAdvice', { perks: perksStr, grade: potentialGrade });
  }

  const finalGrade = currentGrade;
  const upgradeAvailable = potIdx > curIdx;

  return {
    result: {
      grade: finalGrade,
      matchPercentage: pct,
      matchedPerks: [],
      missingPerks: [],
      notes: sheetWeapon.notes || '',
      wishlistPerks: [],
      upgradeAvailable,
      isPerfect5of5,
      isOmniRoll,
      matchedSlotsCount: matchedSlots,
    },
    potentialGrade,
    upgradeAdvice,
    sheetPerks: { matched: matchedList, missing: missingList, all: allList }
  };
}

/* ==========================================================================
   Aegis Database Explorer Slide-out Panel Injection & Controller Logic
   ========================================================================== */

const comboboxOptions: Record<string, string[]> = {
  category: [],
  frame: [],
  element: ['Kinetic', 'Arc', 'Solar', 'Void', 'Stasis', 'Strand'],
  ammo: ['Primary', 'Special', 'Heavy'],
  source: [],
  'widget-source': []
};

function populateComboboxMenu(id: string) {
  const wrapper = document.querySelector(`.aegis-combobox-wrapper[data-combobox-id="${id}"]`);
  if (!wrapper) return;

  const optionsContainer = wrapper.querySelector('.aegis-combobox-options');
  const input = wrapper.querySelector('.aegis-combobox-input') as HTMLInputElement;
  if (!optionsContainer || !input) return;

  const filterText = input.value.toLowerCase().trim();
  const list = comboboxOptions[id] || [];

  const keyMap: Record<string, string> = {
    category: t('allCategories'),
    frame: t('allFrames'),
    element: t('allElements'),
    ammo: t('allAmmo'),
    source: t('allSources'),
    'widget-source': t('allSources')
  };

  const displayTitle = keyMap[id] || `All ${id.charAt(0).toUpperCase() + id.slice(1)}s`;
  let html = `<div class="aegis-combobox-option all-option" data-value="">${displayTitle}</div>`;

  const filtered = list.filter(item => !filterText || item.toLowerCase().includes(filterText));

  if (filtered.length === 0) {
    html += `<div style="padding: 8px; font-size: 11px; color: #88c0d0; text-align: center;">${t('noMatchingWeapons')}</div>`;
  } else {
    for (const item of filtered) {
      let displayLabel = item;
      if (id === 'element') displayLabel = getLocalizedElement(item);
      else if (id === 'frame') displayLabel = getLocalizedFrame(item);
      else if (id === 'category') displayLabel = getLocalizedCategory(item);
      else if (id === 'ammo') displayLabel = t(item.toLowerCase());

      const isSelected = input.value.trim().toLowerCase() === item.trim().toLowerCase();
      const selectedClass = isSelected ? 'selected' : '';
      const checkMark = isSelected ? '<span style="color: #ffd700; font-weight: bold; font-size: 11px;">✓</span>' : '';
      const subLabel = displayLabel !== item ? ` <span style="font-size: 10px; opacity: 0.6;">(${item})</span>` : '';
      html += `
        <div class="aegis-combobox-option ${selectedClass}" data-value="${item.replace(/"/g, '&quot;')}">
          <span>${displayLabel}${subLabel}</span>
          ${checkMark}
        </div>
      `;
    }
  }

  optionsContainer.innerHTML = html;

  optionsContainer.querySelectorAll('.aegis-combobox-option').forEach(optEl => {
    optEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = optEl.getAttribute('data-value') || '';
      input.value = val;
      wrapper.classList.remove('active');
      wrapper.querySelector('.aegis-combobox-menu')?.classList.add('hidden');

      if (id === 'category') populateFramesFilter(val);
      if (id === 'ammo') populateFilters();
      if (id === 'widget-source') {
        const mainSearchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]') as HTMLInputElement;
        if (mainSearchInput && val) {
          mainSearchInput.value = `aegis:s:${val}`;
          mainSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
          mainSearchInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const widgetMenu = document.querySelector('.aegis-search-widget-menu');
        if (widgetMenu) widgetMenu.classList.add('hidden');
      }

      renderResults();
    });
  });
}

function populateFramesFilter(selectedCat: string) {
  if (!aegisSheetDb) return;

  const frames = new Set<string>();
  const normCat = selectedCat.toLowerCase().trim();

  if (normCat) {
    for (const [cat, list] of Object.entries(aegisSheetDb.categories)) {
      if (cat.toLowerCase().includes(normCat)) {
        for (const w of list) {
          if (w.frame) frames.add(w.frame.trim());
        }
      }
    }
  } else {
    for (const w of Object.values(aegisSheetDb.weapons)) {
      if (w.frame) frames.add(w.frame.trim());
    }
  }

  comboboxOptions.frame = Array.from(frames).sort();
  populateComboboxMenu('frame');
}

function populateFilters() {
  if (!aegisSheetDb || !aegisSheetDb.categories) return;

  const ammoInput = document.querySelector('.aegis-explorer-ammo-input') as HTMLInputElement;
  const selectedAmmo = ammoInput ? ammoInput.value.toLowerCase().trim() : '';

  const categories = Object.keys(aegisSheetDb.categories).sort();
  const validCats: string[] = [];

  for (const cat of categories) {
    if (selectedAmmo) {
      const weaponAmmo = (AMMO_TYPE_MAP[cat] || 'Other').toLowerCase();
      if (!weaponAmmo.includes(selectedAmmo)) continue;
    }
    validCats.push(cat);
  }

  comboboxOptions.category = validCats;
  populateComboboxMenu('category');

  const catInput = document.querySelector('.aegis-explorer-category-input') as HTMLInputElement;
  populateFramesFilter(catInput ? catInput.value : '');
}

function populateSourceFilter() {
  if (!aegisSheetDb || !aegisSheetDb.weapons) return;

  const sources = new Set<string>();
  for (const w of Object.values(aegisSheetDb.weapons)) {
    if (w.source) {
      const trimmed = w.source.trim();
      if (trimmed) sources.add(trimmed);
    }
  }

  const sorted = Array.from(sources).sort();
  comboboxOptions.source = sorted;
  comboboxOptions['widget-source'] = sorted;
  populateComboboxMenu('source');
  populateComboboxMenu('widget-source');
}

function updateProgressIndicator() {
  let totalWeaponsCount = 0;
  let completedWeaponsCount = 0;
  if (aegisSheetDb && aegisSheetDb.weapons) {
    const uniqueWeapons = new Set<string>();
    for (const w of Object.values(aegisSheetDb.weapons)) {
      uniqueWeapons.add(w.name);
    }
    totalWeaponsCount = uniqueWeapons.size;
    for (const name of uniqueWeapons) {
      if (completedWeapons[name.toLowerCase().trim()]) {
        completedWeaponsCount++;
      }
    }
  }
  const progressText = document.querySelector('.aegis-explorer-progress-text');
  const progressBar = document.querySelector('.aegis-explorer-progress-bar') as HTMLElement;
  if (progressText && progressBar) {
    const pct = totalWeaponsCount > 0 ? Math.round((completedWeaponsCount / totalWeaponsCount) * 100) : 0;
    progressText.textContent = t('completedProgress', { count: completedWeaponsCount, total: totalWeaponsCount, pct });
    progressBar.style.width = `${pct}%`;
  }
}

function triggerDimSearchForIds(instanceIds: string[]) {
  const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]') as HTMLInputElement;
  if (searchInput && instanceIds.length > 0) {
    const query = instanceIds.map(id => `id:${id}`).join(' or ');
    searchInput.value = query;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    const wrapper = searchInput.parentElement;
    if (wrapper) {
      wrapper.classList.remove('aegis-search-flash');
      void wrapper.offsetWidth; // Force reflow
      wrapper.classList.add('aegis-search-flash');
    }
  }
}
function buildSelectHtml(currentValue: string, recommendedList: string[], globalSet: Set<string>) {
  const cleanRecs = recommendedList.map(r => r.toLowerCase().trim()).filter(Boolean);
  const otherOptions = Array.from(globalSet)
    .filter(o => o && !cleanRecs.includes(o.toLowerCase().trim()))
    .sort((a, b) => a.localeCompare(b));

  let html = `<option value="">Any</option>`;

  if (recommendedList.length > 0) {
    html += `
      <optgroup label="★ Recommended Perks">
        ${recommendedList.map(r => `<option value="${r.replace(/"/g, '&quot;')}" ${currentValue === r ? 'selected' : ''}>★ ${r}</option>`).join('')}
      </optgroup>
    `;
  }

  if (otherOptions.length > 0) {
    html += `
      <optgroup label="All Possible Perks">
        ${otherOptions.map(o => `<option value="${o.replace(/"/g, '&quot;')}" ${currentValue === o ? 'selected' : ''}>${o}</option>`).join('')}
      </optgroup>
    `;
  }

  return html;
}

function formatShoppingBadgeHtml(
  rawGrade: string,
  options: {
    potentialGrade?: string;
    isOmniRoll?: boolean;
    isPerfect5of5?: boolean;
    upgradeAvailable?: boolean;
    sheetWeapon?: AegisSheetWeapon;
    isArmor?: boolean;
  } = {}
): string {
  if (!rawGrade) return '';
  const { potentialGrade, isOmniRoll, isPerfect5of5, upgradeAvailable, sheetWeapon, isArmor } = options;

  let activeGrade = rawGrade;
  let potGrade = potentialGrade;
  const hasHigherPotential = potGrade && potGrade !== activeGrade && getGradeValue(potGrade) > getGradeValue(activeGrade);

  let displayRollGrade = activeGrade;
  if (hasHigherPotential && aegisGradeDisplayMode === 'dual') {
    displayRollGrade = `${activeGrade}➔${potGrade}`;
  } else if (hasHigherPotential && aegisGradeDisplayMode === 'potential') {
    displayRollGrade = potGrade;
  }

  let finalGradeStr = displayRollGrade;
  if (aegisTwoTier && !isArmor && sheetWeapon && sheetWeapon.tier) {
    const archetypeTier = sheetWeapon.tier.trim();
    finalGradeStr = `${archetypeTier}${displayRollGrade}`;
  }

  const isDual = finalGradeStr.includes('➔');
  const isTwoTier = aegisTwoTier && !isArmor && !!(sheetWeapon && sheetWeapon.tier);

  let baseLetter = '';
  if (isDual) {
    const parts = finalGradeStr.split('➔');
    const potPart = parts[1] || parts[0];
    baseLetter = potPart.toLowerCase().trim().charAt(0);
  } else if (isTwoTier) {
    baseLetter = displayRollGrade.charAt(0).toLowerCase();
  } else {
    baseLetter = finalGradeStr ? finalGradeStr.charAt(0).toLowerCase() : '';
  }

  const styleKey = aegisBadgeStyle || 'classic';
  const classes = [
    'aegis-shopping-item-badge',
    `aegis-badge-${baseLetter}`,
    `aegis-style-${styleKey}`
  ];

  if (isTwoTier || isDual || isOmniRoll || isPerfect5of5) {
    classes.push('aegis-badge-wide');
  }
  if (isDual) {
    classes.push('aegis-badge-dual');
  }
  if (isOmniRoll) {
    classes.push('aegis-badge-omni');
  }
  if (isPerfect5of5 && !isDual) {
    classes.push('aegis-badge-perfect');
  }

  let text = finalGradeStr;
  if (isOmniRoll) {
    if (styleKey === 'classic') text = `✦ ${finalGradeStr}`;
  } else if (isPerfect5of5 && !isDual) {
    if (styleKey === 'classic') text = `★ ${finalGradeStr}`;
  }

  let arrowHtml = '';
  if (upgradeAvailable || hasHigherPotential) {
    arrowHtml = '<span class="aegis-badge-upgrade-arrow">▲</span>';
  }

  return `<span class="${classes.join(' ')}">${text}${arrowHtml}</span>`;
}

function getLiveEvaluatedCopyInfo(copy: PlayerOwnedItemInfo, sheetWFallback?: AegisSheetWeapon | null) {
  const data = weaponDataMap.get(copy.element);
  if (data && data.perksMap && data.activeHashes) {
    const perksMap = data.perksMap;
    const activeHashes = data.activeHashes;
    const sheetW = findAegisWeapon(copy.name, perksMap, activeHashes, undefined, copy.hash) || sheetWFallback;
    if (sheetW) {
      const score = scoreSheetWeapon(sheetW, perksMap, activeHashes);
      return {
        grade: score.result.grade || copy.grade,
        potentialGrade: score.potentialGrade,
        upgradeAvailable: !!score.result.upgradeAvailable,
        isOmniRoll: !!score.result.isOmniRoll,
        isPerfect5of5: !!score.result.isPerfect5of5,
        sheetWeapon: sheetW
      };
    }
  }
  return {
    grade: copy.grade,
    potentialGrade: copy.potentialGrade,
    upgradeAvailable: copy.upgradeAvailable,
    isOmniRoll: copy.isOmniRoll,
    isPerfect5of5: copy.isPerfect5of5 || copy.isPerfect,
    sheetWeapon: sheetWFallback
  };
}

let currentExplorerMatches: { weapon: AegisSheetWeapon; category: string }[] = [];
let renderedExplorerCount = 0;
const EXPLORER_CHUNK_SIZE = 40;

function renderExplorerRowHtml(m: { weapon: AegisSheetWeapon; category: string }): string {
  const w = m.weapon;
  const norm = normName(w.name);
  const isCompleted = !!completedWeapons[norm];
  const completedClass = isCompleted ? 'completed' : '';

  const tierLetter = w.tier ? w.tier.charAt(0).toLowerCase() : '';
  const tierClass = `aegis-tier-${tierLetter}`;
  const rankLabel = w.rank ? (w.rank === '1' ? t('bestInClass') : `#${w.rank}`) : '-';

  const baseName = norm.replace(/\s*\([^)]+\)\s*$/, '').trim();
  const weaponHash = nameToHash[norm] || nameToHash[baseName];

  const localizedName = getLocalizedWeaponName(w.name);
  const displayTitle = localizedName !== w.name ? `${localizedName} <span style="font-size: 11px; opacity: 0.65; font-weight: 400;">(${w.name})</span>` : w.name;

  let destinyReportBtnHtml = '';
  if (weaponHash) {
    destinyReportBtnHtml = `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHash}" target="_blank" rel="noopener noreferrer">Destiny.Report ↗</a>`;
  } else {
    destinyReportBtnHtml = `<button class="aegis-action-btn aegis-btn-disabled" title="Weapon ID not resolved. Ensure the weapon is in your wishlist or has been viewed/scanned on screen in DIM." disabled>Destiny.Report (Unknown ID)</button>`;
  }

  const isChasing = !!chaseList[norm];
  const chaseText = isChasing ? t('removeChase') : t('addChase');
  const chaseClass = isChasing ? 'aegis-btn-chase-active' : '';

  const localizedEnergy = getLocalizedElement(w.energy);
  const localizedFrame = getLocalizedFrame(w.frame);
  const localizedCat = getLocalizedCategory(m.category);

  return `
    <div class="aegis-explorer-row ${completedClass}" data-weapon-name="${w.name.replace(/"/g, '&quot;')}">
      <div class="aegis-explorer-row-header">
        <label class="aegis-checklist-toggle" style="display: flex; align-items: center; margin-right: 8px; cursor: pointer;" title="Mark as obtained/completed">
          <input type="checkbox" class="aegis-checklist-checkbox" ${isCompleted ? 'checked' : ''} style="margin: 0; cursor: pointer;" />
        </label>
        <span class="aegis-explorer-row-name">${displayTitle}</span>
        <div class="aegis-explorer-row-badges">
          <span class="aegis-explorer-row-badge ${tierClass}">${w.tier || 'F'}</span>
          <span class="aegis-explorer-row-rank">${rankLabel}</span>
        </div>
      </div>
      <div class="aegis-explorer-row-details">
        <span class="aegis-explorer-row-meta">${localizedEnergy} / ${localizedFrame}</span>
        <span class="aegis-explorer-row-cat">${localizedCat}</span>
        ${w.source ? `<div class="aegis-explorer-row-source" style="margin-top: 4px; font-size: 11px; color: #ffd700;"><span style="color: #aaa; font-weight: 500;">${t('source')}:</span> ${w.source}</div>` : ''}
      </div>
      ${w.notes ? `<div class="aegis-explorer-row-notes">${w.notes}</div>` : ''}
      <div class="aegis-explorer-row-actions">
        <button class="aegis-action-btn aegis-btn-highlight" data-action="filter-vault">${t('filterInVault')}</button>
        <button class="aegis-action-btn aegis-btn-chase ${chaseClass}" data-action="chase-weapon">${chaseText}</button>
        ${destinyReportBtnHtml}
      </div>
    </div>
  `;
}

function renderNextExplorerChunk(): boolean {
  const resultsContainer = document.querySelector('.aegis-explorer-results') as HTMLElement;
  if (!resultsContainer || renderedExplorerCount >= currentExplorerMatches.length) return false;

  const nextSlice = currentExplorerMatches.slice(renderedExplorerCount, renderedExplorerCount + EXPLORER_CHUNK_SIZE);
  if (nextSlice.length === 0) return false;

  let chunkHtml = '';
  for (const m of nextSlice) {
    chunkHtml += renderExplorerRowHtml(m);
  }

  const temp = document.createElement('div');
  temp.innerHTML = chunkHtml;
  while (temp.firstChild) {
    resultsContainer.appendChild(temp.firstChild);
  }
  renderedExplorerCount += nextSlice.length;
  return true;
}

function renderResults() {
  const resultsContainer = document.querySelector('.aegis-explorer-results') as HTMLElement;
  if (!resultsContainer) return;
  const savedScrollTop = resultsContainer.scrollTop;

  const db = aegisSheetDb;
  addDiagnosticLog(`renderResults called. activeTab: "${activeTab}". Has db: ${!!db}. Weapons count: ${db ? Object.keys(db.weapons || {}).length : 0}. Items in chaseList: ${JSON.stringify(Object.keys(chaseList))}`);

  const panel = document.querySelector('.aegis-explorer-panel') as HTMLElement | null;
  const searchGroup = panel?.querySelector('.aegis-explorer-search-group') as HTMLElement | null;
  if (searchGroup) {
    searchGroup.style.display = activeTab === 'chase' ? 'none' : 'flex';
  }
  if (panel) {
    panel.classList.toggle('tab-shopping', activeTab === 'shopping');
    panel.classList.toggle('tab-chase', activeTab === 'chase');
    panel.classList.toggle('tab-explorer', activeTab === 'explorer');
  }

  if (!db || !db.weapons) {
    resultsContainer.innerHTML = '<div class="aegis-explorer-empty">Loading database...</div>';
    return;
  }

  try {
    // 1. SHOPPING LIST AUDIT TAB RENDERER
    if (activeTab === 'shopping') {
      const activeShoppingDb = (aegisMode === 'pvp' ? aegisShoppingDbPvP : aegisShoppingDbPvE) || aegisShoppingDb;
      if (!activeShoppingDb || !activeShoppingDb.items || activeShoppingDb.items.length === 0) {
        const author = aegisMode === 'pvp' ? 'Finnald' : 'Aegis';
        resultsContainer.innerHTML = `
          <div class="aegis-explorer-empty" style="padding: 30px 15px; text-align: center; line-height: 1.5; color: #aaa;">
            Shopping list is loading or syncing from ${author}'s spreadsheet...<br/><br/>
            Check your internet connection or reload the extension.
          </div>
        `;
        return;
      }

      const allItems = activeShoppingDb.items;
      const activeSheetDb = (aegisMode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE) || db;
      const filterText = (document.querySelector('.aegis-explorer-search-input') as HTMLInputElement)?.value.toLowerCase().trim() || '';

      // Compute readiness statistics
      let readyCount = 0;
      let suboptimalCount = 0;
      let missingCount = 0;
      let highReady = 0, highTotal = 0;
      let medReady = 0, medTotal = 0;
      let lowReady = 0, lowTotal = 0;
      let nicheReady = 0, nicheTotal = 0;

      interface EvaluatedShoppingItem {
        item: AegisShoppingItem;
        status: 'ready' | 'suboptimal' | 'missing';
        bestGrade: string;
        bestAlternative?: { name: string; grade: string };
        ownedCount: number;
      }

      const evaluatedList: EvaluatedShoppingItem[] = [];

      for (const item of allItems) {
        const normItemName = normName(item.name);
        const ownedList = playerVaultInventory.get(normItemName) || [];
        
        let status: 'ready' | 'suboptimal' | 'missing' = 'missing';
        let bestGrade = '';
        let bestAlternative: { name: string; grade: string } | undefined;

        const isItemArmor = isShoppingItemArmor(item);

        if (ownedList.length > 0) {
          if (isItemArmor) {
            const targetArchetypes = item.column1.toLowerCase().split(/[\/\n\\]+/).map(a => a.trim()).filter(Boolean);
            let hasMatchingArchetype = false;

            for (const owned of ownedList) {
              if (owned.armorPerks && owned.armorPerks.length > 0) {
                for (const perk of owned.armorPerks) {
                  const pLow = perk.toLowerCase();
                  if (targetArchetypes.some(target => pLow.includes(target))) {
                    hasMatchingArchetype = true;
                    break;
                  }
                }
              }
              if (hasMatchingArchetype) break;
            }

            if (hasMatchingArchetype) {
              status = 'ready';
              bestGrade = '';
            } else if (targetArchetypes.length > 0 && targetArchetypes[0] !== 'n/a' && targetArchetypes[0] !== '-') {
              status = 'suboptimal';
              bestGrade = '';
            } else {
              status = 'ready';
              bestGrade = '';
            }
          } else {
            const sheetW = activeSheetDb.weapons[normItemName] || activeSheetDb.weapons[normName(item.name.replace(/\s*\([^)]+\)\s*$/, '').trim())];
            let highestVal = -1;
            let bestOwnedEval: ReturnType<typeof getLiveEvaluatedCopyInfo> | null = null;
            for (const owned of ownedList) {
              const liveEval = getLiveEvaluatedCopyInfo(owned, sheetW);
              const val = getGradeValue(liveEval.grade);
              if (val > highestVal) {
                highestVal = val;
                bestGrade = liveEval.grade;
                bestOwnedEval = liveEval;
              }
            }
            if (highestVal >= 85) {
              status = 'ready';
            } else {
              status = 'suboptimal';
            }

            if (bestOwnedEval) {
              let activeGrade = bestOwnedEval.grade;
              let potGrade = bestOwnedEval.potentialGrade;
              const hasHigher = potGrade && potGrade !== activeGrade && getGradeValue(potGrade) > getGradeValue(activeGrade);
              let displayRollGrade = activeGrade;
              if (hasHigher && aegisGradeDisplayMode === 'dual') {
                displayRollGrade = `${activeGrade}➔${potGrade}`;
              } else if (hasHigher && aegisGradeDisplayMode === 'potential') {
                displayRollGrade = potGrade;
              }

              const activeSheetW = bestOwnedEval.sheetWeapon || sheetW;
              if (aegisTwoTier && activeSheetW && activeSheetW.tier) {
                const archTier = activeSheetW.tier.trim();
                displayRollGrade = `${archTier}${displayRollGrade}`;
              }
              bestGrade = displayRollGrade;
            }
          }
        } else {
          if (item.alternatives && item.alternatives.length > 0) {
            let altHighestVal = -1;
            for (const alt of item.alternatives) {
              const normAlt = normName(alt);
              const altOwned = playerVaultInventory.get(normAlt) || [];
              const altSheetW = activeSheetDb.weapons[normAlt] || activeSheetDb.weapons[normName(alt.replace(/\s*\([^)]+\)\s*$/, '').trim())];
              if (altOwned.length > 0) {
                for (const o of altOwned) {
                  const lEval = getLiveEvaluatedCopyInfo(o, altSheetW);
                  const val = getGradeValue(lEval.grade);
                  if (val > altHighestVal) {
                    altHighestVal = val;
                    bestAlternative = { name: alt, grade: lEval.grade };
                  }
                }
              }
            }
          }
          status = 'missing';
        }

        if (item.priority === 'high') { highTotal++; if (status === 'ready') highReady++; }
        else if (item.priority === 'medium') { medTotal++; if (status === 'ready') medReady++; }
        else if (item.priority === 'low') { lowTotal++; if (status === 'ready') lowReady++; }
        else if (item.priority === 'niche') { nicheTotal++; if (status === 'ready') nicheReady++; }

        if (status === 'ready') readyCount++;
        else if (status === 'suboptimal') suboptimalCount++;
        else missingCount++;

        const isArmor = isShoppingItemArmor(item);
        const isExotic = isShoppingItemExotic(item);

        if (shoppingTypeFilter === 'weapon' && isArmor) continue;
        if (shoppingTypeFilter === 'armor' && !isArmor) continue;

        if (shoppingRarityFilter === 'legendary' && isExotic) continue;
        if (shoppingRarityFilter === 'exotic' && !isExotic) continue;

        if (shoppingPriorityFilter !== 'all' && item.priority !== shoppingPriorityFilter) continue;
        if (shoppingStatusFilter !== 'all' && status !== shoppingStatusFilter) continue;

        if (filterText) {
          const matchName = item.name.toLowerCase().includes(filterText);
          const matchRole = item.role.toLowerCase().includes(filterText);
          const matchSource = item.source.toLowerCase().includes(filterText);
          const matchPerks = item.column1.toLowerCase().includes(filterText) || item.column2.toLowerCase().includes(filterText);
          const matchAlts = item.alternatives.some(a => a.toLowerCase().includes(filterText));
          if (!matchName && !matchRole && !matchSource && !matchPerks && !matchAlts) continue;
        }

        evaluatedList.push({
          item,
          status,
          bestGrade,
          bestAlternative,
          ownedCount: ownedList.length
        });
      }

      const totalItemsCount = allItems.length;
      const readyPct = totalItemsCount > 0 ? Math.round((readyCount / totalItemsCount) * 100) : 0;

      let html = `
        <div class="aegis-shopping-audit-header">
          <div class="aegis-audit-title-row">
            <span class="aegis-audit-title">${t('shoppingCompletion')}:</span>
            <span class="aegis-audit-pct">${readyPct}% (${readyCount}/${totalItemsCount})</span>
          </div>
          <div class="aegis-audit-priority-pills">
            <span class="aegis-audit-pill pill-high" title="${t('priorityHigh')}">High: <strong>${highReady}/${highTotal}</strong></span>
            <span class="aegis-audit-pill pill-med" title="${t('priorityMedium')}">Med: <strong>${medReady}/${medTotal}</strong></span>
            <span class="aegis-audit-pill pill-low" title="${t('priorityLow')}">Rare: <strong>${lowReady}/${lowTotal}</strong></span>
            <span class="aegis-audit-pill pill-niche" title="${t('priorityNiche')}">Niche: <strong>${nicheReady}/${nicheTotal}</strong></span>
          </div>
        </div>
      `;

      if (evaluatedList.length === 0) {
        html += `
          <div class="aegis-explorer-empty" style="padding: 30px 15px; text-align: center; color: #aaa;">
            No items match the active Shopping List filters.
          </div>
        `;
        resultsContainer.innerHTML = html;
        return;
      }

      for (const entry of evaluatedList) {
        const { item, status, bestGrade, ownedCount } = entry;
        const isArmor = isShoppingItemArmor(item);
        const normItemName = normName(item.name);
        const isExpanded = expandedShoppingCards.has(normItemName);
        const ownedList = playerVaultInventory.get(normItemName) || [];

        const priKey = `priority${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}` as any;
        const priLabel = t(priKey) || (item.priority === 'low' ? 'Rare' : item.priority.toUpperCase());

        let statusBadgeHtml = '';
        if (status === 'ready') {
          statusBadgeHtml = isArmor || !bestGrade
            ? `<span class="aegis-status-pill status-ready">${t('statusReady')}</span>`
            : `<span class="aegis-status-pill status-ready">${t('statusReady')} (${bestGrade})</span>`;
        } else if (status === 'suboptimal') {
          statusBadgeHtml = isArmor || !bestGrade
            ? `<span class="aegis-status-pill status-suboptimal">${t('statusSuboptimal')}</span>`
            : `<span class="aegis-status-pill status-suboptimal">${t('statusSuboptimal')} (${bestGrade})</span>`;
        } else {
          statusBadgeHtml = `<span class="aegis-status-pill status-missing">${t('statusMissing')}</span>`;
        }

        const ownedBadgeHtml = ownedCount > 0
          ? `<span class="aegis-shopping-vault-count-tag">${ownedCount} in Vault</span>`
          : '';

        const validAlts = (item.alternatives || []).filter(a => {
          const u = a.toUpperCase().trim();
          return u && u !== 'N/A' && u !== '-' && u !== 'NA' && u !== 'NONE' && u !== 'N' && u !== 'A';
        });

        let altHtml = '';
        if (!isArmor) {
          altHtml = `
            <div class="aegis-shopping-copies-drawer">
              <div class="aegis-copies-drawer-title">${t('viableAlternatives').toUpperCase()} (${validAlts.length}):</div>
              ${validAlts.length === 0 ? `<div class="aegis-copy-empty" style="padding: 3px 6px;">No viable alternatives listed for this weapon.</div>` : `
                <div class="aegis-copies-list">
                  ${validAlts.map((altName, aIdx) => {
                    const normAlt = normName(altName);
                    const altOwnedList = playerVaultInventory.get(normAlt) || [];
                    const altSheetW = db.weapons[normAlt] || db.weapons[normName(altName.replace(/\s*\([^)]+\)\s*$/, '').trim())];
                    
                    let bestAltEval: ReturnType<typeof getLiveEvaluatedCopyInfo> | null = null;
                    if (altOwnedList.length > 0) {
                      let highest = -1;
                      for (const o of altOwnedList) {
                        const lEval = getLiveEvaluatedCopyInfo(o, altSheetW);
                        const v = getGradeValue(lEval.grade);
                        if (v > highest) {
                          highest = v;
                          bestAltEval = lEval;
                        }
                      }
                    }

                    const badgeHtml = bestAltEval
                      ? formatShoppingBadgeHtml(bestAltEval.grade, {
                          potentialGrade: bestAltEval.potentialGrade,
                          isOmniRoll: bestAltEval.isOmniRoll,
                          isPerfect5of5: bestAltEval.isPerfect5of5,
                          upgradeAvailable: bestAltEval.upgradeAvailable,
                          sheetWeapon: bestAltEval.sheetWeapon || altSheetW,
                          isArmor: false
                        })
                      : `<span class="aegis-status-pill status-missing" style="font-size: 8.5px; padding: 1px 4px;">${t('statusMissing')}</span>`;

                    return `
                      <div class="aegis-shopping-copy-row aegis-shopping-alt-row-item" data-alt-name="${altName.replace(/"/g, '&quot;')}" data-search-name="${altName.replace(/"/g, '&quot;')}">
                        <div class="aegis-copy-info">
                          <span class="aegis-copy-num">#${aIdx + 1}</span>
                          <span class="aegis-shopping-alt-name" style="font-weight: 700; color: #fff; margin-right: 4px;">${altName}</span>
                          ${badgeHtml}
                        </div>
                        <button type="button" class="aegis-btn-locate-copy aegis-btn-find-alt" data-search-name="${altName.replace(/"/g, '&quot;')}">${t('findInVault')}</button>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          `;
        }

        let perksSectionHtml = '';
        if (isArmor) {
          perksSectionHtml = `
            <div class="aegis-shopping-perks-section">
              <div class="aegis-shopping-perks-col-group">
                <span class="aegis-perks-label">TARGET ARCHETYPE:</span>
                <div class="aegis-shopping-chips-list">
                  ${item.column1.split(/[\/\n\\]+/).map(a => `<span class="aegis-shopping-perk-chip archetype-chip">${a.trim()}</span>`).join('')}
                </div>
              </div>
              ${item.column2 && item.column2 !== 'N/A' && item.column2 !== '-' ? `
                <div class="aegis-shopping-col-divider">+</div>
                <div class="aegis-shopping-perks-col-group">
                  <span class="aegis-perks-label">BONUS / STAT:</span>
                  <div class="aegis-shopping-chips-list">
                    ${item.column2.split(/[\/\n\\]+/).map(a => `<span class="aegis-shopping-perk-chip archetype-chip">${a.trim()}</span>`).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        } else {
          perksSectionHtml = `
            <div class="aegis-shopping-perks-section">
              <div class="aegis-shopping-perks-col-group">
                <span class="aegis-perks-label">${t('perk1').toUpperCase()}:</span>
                <div class="aegis-shopping-chips-list">
                  ${item.column1.split(/[\/\n\\]+/).map(p => renderCompactShoppingPerkChip(p, true)).join('')}
                </div>
              </div>
              ${item.column2 && item.column2 !== 'N/A' && item.column2 !== '-' ? `
                <div class="aegis-shopping-col-divider">+</div>
                <div class="aegis-shopping-perks-col-group">
                  <span class="aegis-perks-label">${t('perk2').toUpperCase()}:</span>
                  <div class="aegis-shopping-chips-list">
                    ${item.column2.split(/[\/\n\\]+/).map(p => renderCompactShoppingPerkChip(p, false)).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }

        let copiesDrawerHtml = `
          <div class="aegis-shopping-copies-drawer">
            <div class="aegis-copies-drawer-title">${t('ownedInVault').toUpperCase()} (${ownedList.length}):</div>
            ${ownedList.length === 0 ? `<div class="aegis-copy-empty" style="padding: 3px 6px;">${t('notInInventory')} (0 in Vault).</div>` : `
              <div class="aegis-copies-list">
                ${ownedList.map((copy, cIdx) => {
                  const sheetW = db.weapons[normItemName] || db.weapons[normName(item.name.replace(/\s*\([^)]+\)\s*$/, '').trim())];
                  const liveEval = getLiveEvaluatedCopyInfo(copy, sheetW);
                  const copyBadgeHtml = !isArmor && liveEval.grade
                    ? formatShoppingBadgeHtml(liveEval.grade, {
                        potentialGrade: liveEval.potentialGrade,
                        isOmniRoll: liveEval.isOmniRoll,
                        isPerfect5of5: liveEval.isPerfect5of5,
                        upgradeAvailable: liveEval.upgradeAvailable,
                        sheetWeapon: liveEval.sheetWeapon || sheetW,
                        isArmor: false
                      })
                    : '';
                  let perksHtml = '';

                  if (isArmor) {
                    const KNOWN_ARCHETYPES = ['powerhouse', 'specialist', 'gunner', 'skirmisher', 'brawler', 'paragon', 'tank', 'tactician'];
                    const targetArchetypes = item.column1.toLowerCase().split(/[\/\n\\]+/).map(a => a.trim()).filter(Boolean);
                    const matchedArchetypes = (copy.armorPerks || []).filter(p => {
                      const pLow = p.toLowerCase();
                      return targetArchetypes.some(t => t && t !== 'n/a' && t !== '-' && pLow.includes(t)) || KNOWN_ARCHETYPES.some(k => pLow.includes(k));
                    });
                    if (matchedArchetypes.length > 0) {
                      perksHtml = matchedArchetypes.map(p => {
                        return `<span class="aegis-shopping-copy-perk-chip archetype-chip"><span>${p}</span></span>`;
                      }).join('');
                    }
                  } else {
                    const data = weaponDataMap.get(copy.element);
                    let traitChips: { name: string; icon?: string }[] = [];

                    if (data?.sheetPerks) {
                      const sheetPerks = data.sheetPerks;
                      const allPerks = sheetPerks.all || [...sheetPerks.matched, ...sheetPerks.missing];
                      const activeTraits = allPerks.filter(p => (p.type === 'perk1' || p.type === 'perk2') && p.status === 'active');
                      if (activeTraits.length > 0) {
                        traitChips = activeTraits.map(p => ({ name: p.name, icon: p.icon }));
                      }
                    }

                    if (traitChips.length === 0 && copy.matchedPerks) {
                      const traits = copy.matchedPerks.filter(p => p.type === 'perk1' || p.type === 'perk2');
                      if (traits.length > 0) {
                        traitChips = traits.map(p => ({ name: p.name, icon: p.icon }));
                      }
                    }

                    if (traitChips.length > 0) {
                      perksHtml = traitChips.map(p => {
                        const icon = p.icon || getPerkIcon(p.name) || perkNameToIcon[normName(p.name)];
                        const iconHtml = icon ? `<img src="https://www.bungie.net${icon}" class="aegis-shopping-chip-icon" />` : '';
                        return `<span class="aegis-shopping-copy-perk-chip" title="${p.name}">${iconHtml}<span>${p.name}</span></span>`;
                      }).join('');
                    }
                  }

                  return `
                    <div class="aegis-shopping-copy-row" data-shopping-name="${item.name.replace(/"/g, '&quot;')}" data-copy-idx="${cIdx}">
                      <div class="aegis-copy-info">
                        <span class="aegis-copy-num">#${cIdx + 1}</span>
                        ${copyBadgeHtml}
                        ${perksHtml ? `<div class="aegis-copy-perks-container">${perksHtml}</div>` : ''}
                      </div>
                      <button type="button" class="aegis-btn-locate-copy" data-action="locate-copy" data-search-name="${item.name.replace(/"/g, '&quot;')}">${t('findInVault')}</button>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        `;

        let expandedContentHtml = '';
        if (isExpanded) {
          expandedContentHtml = `
            <div class="aegis-shopping-card-body">
              <div class="aegis-shopping-meta-row">
                <span><strong>${t('farmingSource')}:</strong> <span style="color: #ffd700;">${item.source}</span></span>
                ${item.role ? `<span><strong>${t('itemRole')}:</strong> <span style="color: #88c0d0;">${item.role}</span></span>` : ''}
              </div>
              ${perksSectionHtml}
              ${altHtml}
              ${copiesDrawerHtml}
              <div class="aegis-shopping-card-actions">
                <button type="button" class="aegis-action-btn aegis-btn-find-vault" data-search-name="${item.name.replace(/"/g, '&quot;')}">${t('findInVault')}</button>
                ${!isArmor ? (() => {
                  const baseNameForReport = normItemName.replace(/\s*\([^)]+\)\s*$/, '').trim();
                  const weaponHashForReport = nameToHash[normItemName] || nameToHash[baseNameForReport];
                  if (weaponHashForReport) {
                    return `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHashForReport}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">Destiny.Report ↗</a>`;
                  } else {
                    return `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/weapons?search=${encodeURIComponent(item.name)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">Destiny.Report ↗</a>`;
                  }
                })() : ''}
              </div>
            </div>
          `;
        }

        html += `
          <div class="aegis-shopping-card status-${status} priority-${item.priority} ${isExpanded ? 'expanded' : ''}" data-shopping-name="${item.name.replace(/"/g, '&quot;')}">
            <div class="aegis-shopping-card-header">
              <div class="aegis-shopping-title-group">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="aegis-shopping-chevron">${isExpanded ? '▼' : '▶'}</span>
                  <span class="aegis-shopping-item-name">${item.name}</span>
                  <span class="aegis-shopping-role-tag">${item.role}</span>
                </div>
              </div>
              <div class="aegis-shopping-status-group">
                ${ownedBadgeHtml}
                <span class="aegis-priority-pill aegis-pill-${item.priority}">${priLabel}</span>
                ${statusBadgeHtml}
              </div>
            </div>
            ${expandedContentHtml}
          </div>
        `;
      }

      resultsContainer.innerHTML = html;
      resultsContainer.scrollTop = savedScrollTop;

      // Bind Shopping List Card click listeners
      resultsContainer.querySelectorAll('.aegis-shopping-card').forEach(card => {
        const itemName = card.getAttribute('data-shopping-name');
        if (!itemName) return;
        const norm = normName(itemName);

        card.querySelector('.aegis-shopping-card-header')?.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.aegis-shopping-card-actions') || target.closest('button') || target.closest('a')) return;
          if (expandedShoppingCards.has(norm)) {
            expandedShoppingCards.delete(norm);
          } else {
            expandedShoppingCards.add(norm);
          }
          renderResults();
        });
      });

      // Bind Copy row hover listeners to trigger tooltip
      resultsContainer.querySelectorAll('.aegis-shopping-copy-row').forEach(row => {
        const itemName = row.getAttribute('data-shopping-name');
        const cIdxStr = row.getAttribute('data-copy-idx');
        if (!itemName || cIdxStr === null) return;
        const norm = normName(itemName);
        const cIdx = parseInt(cIdxStr, 10);
        const owned = playerVaultInventory.get(norm) || [];
        const copy = owned[cIdx];

        if (copy && copy.element) {
          row.addEventListener('mouseenter', () => {
            showTooltipForElement(copy.element, row as HTMLElement);
          });
          row.addEventListener('mouseleave', () => {
            hideTooltip();
          });
        }
      });

      // Bind Alternative row hover listeners to trigger tooltip
      resultsContainer.querySelectorAll('.aegis-shopping-alt-row-item').forEach(row => {
        const altName = row.getAttribute('data-alt-name');
        if (!altName) return;
        const norm = normName(altName);
        const owned = playerVaultInventory.get(norm) || [];
        const copy = owned.length > 0 ? owned[0] : null;

        row.addEventListener('mouseenter', () => {
          if (copy && copy.element) {
            showTooltipForElement(copy.element, row as HTMLElement);
          } else {
            const sheetW = db.weapons[norm] || db.weapons[normName(altName.replace(/\s*\([^)]+\)\s*$/, '').trim())];
            if (sheetW) {
              const mockResult: ScoringResult = {
                grade: sheetW.rank || sheetW.tier || '★ S',
                matchPercentage: 100,
                matchedPerks: [],
                missingPerks: [],
                notes: sheetW.notes || '',
                wishlistPerks: []
              };
              showTooltip(
                row as HTMLElement,
                mockResult,
                sheetW.name || altName,
                {},
                [],
                false,
                sheetW,
                undefined,
                false,
                undefined,
                perkNameToIcon,
                undefined,
                undefined,
                aegisMode as any,
                aegisPerkOrder,
                undefined,
                undefined,
                {
                  compactPerksMatrix: aegisCompactPerksMatrix,
                  inlineHeader: aegisInlineHeader,
                  autoMaxHeight: aegisAutoMaxHeight,
                  tooltipWidthMode: aegisTooltipWidthMode,
                  tooltipWidth: aegisTooltipWidth
                }
              );
            }
          }
        });
        row.addEventListener('mouseleave', () => {
          hideTooltip();
        });

        row.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;
          const targetName = row.getAttribute('data-search-name');
          if (targetName) triggerDimSearch(targetName);
        });
      });

      resultsContainer.querySelectorAll('[data-action="locate-copy"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetName = (btn as HTMLElement).getAttribute('data-search-name');
          if (targetName) triggerDimSearch(targetName);
        });
      });

      resultsContainer.querySelectorAll('.aegis-btn-find-vault, .aegis-btn-find-alt').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetName = (btn as HTMLElement).getAttribute('data-search-name');
          if (targetName) {
            triggerDimSearch(targetName);
          }
        });
      });

      resultsContainer.querySelectorAll('.aegis-btn-report').forEach(link => {
        link.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      });

      return;
    }

    // 2. CHASE LIST TAB RENDERER
    if (activeTab === 'chase') {
      updateProgressIndicator();
      let html = '';
      const items = Object.values(chaseList).sort((a, b) => a.name.localeCompare(b.name));
      const completedCount = items.filter(i => completedWeapons[normName(i.name)]).length;

      // Trigger background manifest preload if not loaded yet
      if (!manifestLoaded && !manifestLoadingPromise) {
        loadManifestWeapons().then(() => {
          const activeSearch = document.querySelector('.aegis-chase-search-input') as HTMLInputElement | null;
          if (activeSearch && activeSearch.value.trim().length >= 2) {
            activeSearch.dispatchEvent(new Event('input'));
          }
        });
      }

      // 1. Search & Add Bar Header (Full Width)
      html += `
        <div class="aegis-chase-header-bar">
          <div class="aegis-chase-search-wrapper">
            <input type="text" class="aegis-chase-search-input" placeholder="Search any Destiny 2 weapon to chase..." autocomplete="off" />
            <div class="aegis-chase-search-dropdown hidden"></div>
          </div>
          <div class="aegis-chase-stats-row">
            <span class="aegis-chase-count-badge">${items.length} Tracked</span>
            <span class="aegis-chase-count-badge count-completed">${completedCount} Completed</span>
          </div>
        </div>
      `;

      if (items.length === 0) {
        html += `
          <div class="aegis-explorer-empty" style="padding: 36px 20px; text-align: center; line-height: 1.6; color: #a0aec0;">
            <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 6px;">Your Roll Chase List is Empty</div>
            Use the search bar above to search across <strong>all Destiny 2 weapons</strong>, or browse the <strong>Database Explorer</strong> and click <strong>+ Chase</strong> to customize and track your personal god rolls!
          </div>
        `;
        resultsContainer.innerHTML = html;
        resultsContainer.scrollTop = savedScrollTop;
        bindChaseSearchEvents();
        return;
      }

      const pendingManifestRequests: string[] = [];

      for (const item of items) {
        try {
          const norm = normName(item.name);
          const w = db.weapons[norm];
          const manifestW = manifestWeaponsMap[norm] || (item.itemHash ? manifestWeaponsByHash[item.itemHash] : null);
          const possiblePerks = weaponPossiblePerksCache[norm];

          // If neither manifestW has perkColumns nor possiblePerks is loaded, request from DIM's live manifest
          const hasManifestPerks = (manifestW?.perkColumns && manifestW.perkColumns[0]?.length > 0) || (possiblePerks && possiblePerks.isFromManifest);
          const lastFailure = failedWeaponRequests.get(norm) || 0;
          const canRetry = Date.now() - lastFailure >= 60_000;
          if (!hasManifestPerks && !requestedWeapons.has(norm) && canRetry) {
            pendingManifestRequests.push(norm);
          }

          const iconUrl = manifestW?.icon || item.icon || '';
          const damageIconUrl = manifestW?.damageIcon || item.damageIcon || '';
          const damageType = manifestW?.damageType || item.damageType || w?.energy || '';
          const archetype = manifestW?.archetype || item.archetype || w?.frame || '';
          const rpm = manifestW?.rpm || '';
          const isCraftable = manifestW?.isCraftable || false;
          const sourceStr = item.source || manifestW?.sourceName || w?.source || 'Unknown Source';

          const barrels = w ? parseRecommendations(w.barrel) : [];
          const mags = w ? parseRecommendations(w.mag) : [];
          const perk1s = w ? parseRecommendations(w.perk1) : [];
          const perk2s = w ? parseRecommendations(w.perk2) : [];
          const origins = w ? parseRecommendations(w.origin) : [];

          // Col 3 & Col 4 perk pools from both manifest sources
          const col3Perks = (manifestW?.perkColumns?.[0] && manifestW.perkColumns[0].length > 0)
            ? manifestW.perkColumns[0]
            : (possiblePerks?.perk1s || []);
          const col4Perks = (manifestW?.perkColumns?.[1] && manifestW.perkColumns[1].length > 0)
            ? manifestW.perkColumns[1]
            : (possiblePerks?.perk2s || []);
          const allBarrels = (manifestW?.barrels && manifestW.barrels.length > 0)
            ? manifestW.barrels
            : (possiblePerks?.barrels || manifestW?.perks || []);
          const allMags = (manifestW?.magazines && manifestW.magazines.length > 0)
            ? manifestW.magazines
            : (possiblePerks?.mags || manifestW?.perks || []);
          const allOrigins = (manifestW?.origins && manifestW.origins.length > 0)
            ? manifestW.origins
            : (possiblePerks?.origins || []);

          // Column 3 perks set
          const perk1sSet = new Set([...col3Perks, ...perk1s, ...(item.perk1 ? [item.perk1] : [])]);
          const perk1Alt1Set = new Set([...col3Perks, ...perk1s, ...(item.perk1Alt1 ? [item.perk1Alt1] : [])]);
          const perk1Alt2Set = new Set([...col3Perks, ...perk1s, ...(item.perk1Alt2 ? [item.perk1Alt2] : [])]);

          // Column 4 perks set
          const perk2sSet = new Set([...col4Perks, ...perk2s, ...(item.perk2 ? [item.perk2] : [])]);
          const perk2Alt1Set = new Set([...col4Perks, ...perk2s, ...(item.perk2Alt1 ? [item.perk2Alt1] : [])]);
          const perk2Alt2Set = new Set([...col4Perks, ...perk2s, ...(item.perk2Alt2 ? [item.perk2Alt2] : [])]);

          // Barrels, Mags, Origins
          const barrelsSet = new Set([...barrels, ...allBarrels, ...(item.barrel ? [item.barrel] : [])]);
          const magsSet = new Set([...mags, ...allMags, ...(item.mag ? [item.mag] : [])]);
          const originsSet = new Set([...origins, ...allOrigins, ...(item.origin ? [item.origin] : [])]);

          // Scan owned matching weapons
          const owned = Array.from(ownedItemsMap.values()).filter(oi => normName(oi.name) === norm);
          const matches: string[] = [];

          for (const oi of owned) {
            let match = true;
            const failedSelections: string[] = [];

            const checkPerkMatch = (selectedPerk: string | undefined, label: string) => {
              if (!selectedPerk) return true;
              const pNorm = selectedPerk.toLowerCase().trim();
              const clean = cleanPerkName(selectedPerk);
              const targetHash = perkNameToHash[pNorm] ?? perkNameToHash[clean];
              if (targetHash !== undefined) {
                const hashMatch = oi.perkHashes.some(hash =>
                  hash === targetHash || enhancedToNormalMap[hash] === targetHash
                );
                if (hashMatch) return true;
              }
              const selectedMatchName = cleanPerkNameForMatch(selectedPerk);
              const nameMatch = oi.perkNames.some(ownedPerk =>
                isPerkMatch(ownedPerk, selectedPerk) ||
                isPerkMatch(cleanPerkNameForMatch(ownedPerk), selectedMatchName)
              );
              if (!nameMatch) failedSelections.push(`${label}: ${selectedPerk}`);
              return nameMatch;
            };

            if (!checkPerkMatch(item.barrel, 'Barrel')) match = false;
            if (!checkPerkMatch(item.mag, 'Magazine')) match = false;
            if (!checkPerkMatch(item.perk1, 'Perk 1')) match = false;
            if (item.perk1Alt1 && !checkPerkMatch(item.perk1Alt1, 'Perk 1 (Slot B)')) match = false;
            if (item.perk1Alt2 && !checkPerkMatch(item.perk1Alt2, 'Perk 1 (Slot C)')) match = false;
            if (!checkPerkMatch(item.perk2, 'Perk 2')) match = false;
            if (item.perk2Alt1 && !checkPerkMatch(item.perk2Alt1, 'Perk 2 (Slot B)')) match = false;
            if (item.perk2Alt2 && !checkPerkMatch(item.perk2Alt2, 'Perk 2 (Slot C)')) match = false;
            if (item.origin && !checkPerkMatch(item.origin, 'Origin')) match = false;

            if (match) {
              matches.push(oi.instanceId);
            }
          }

          let statusHtml = '';
          let highlightBtnHtml = '';
          if (owned.length === 0) {
            statusHtml = `<span class="aegis-chase-status aegis-status-none">${t('notInInventory')}</span>`;
          } else if (matches.length > 0) {
            statusHtml = `<span class="aegis-chase-status aegis-status-match">${t('obtainedMatching', { count: matches.length })}</span>`;
            highlightBtnHtml = `<button class="aegis-action-btn aegis-btn-highlight" data-action="highlight-matching" data-ids="${matches.join(',')}">${t('highlightInVault')}</button>`;
          } else {
            statusHtml = `<span class="aegis-chase-status aegis-status-have-weapon">${t('haveWeaponWrongPerks')}</span>`;
          }

          const baseNameForReport = norm.replace(/\s*\([^)]+\)\s*$/, '').trim();
          const weaponHashForReport = manifestW?.hash || nameToHash[norm] || nameToHash[baseNameForReport] || item.itemHash;
          let destinyReportBtnHtml = '';
          if (weaponHashForReport) {
            destinyReportBtnHtml = `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHashForReport}" target="_blank" rel="noopener noreferrer">Destiny.Report ↗</a>`;
          }

          const isExpanded = expandedChaseWeapons.has(norm);
          const isCompleted = !!completedWeapons[norm];

          html += `
            <div class="aegis-chase-row ${isExpanded ? 'expanded' : ''} ${isCompleted ? 'completed' : ''}" data-weapon-name="${item.name.replace(/"/g, '&quot;')}">
              <div class="aegis-chase-row-header">
                <div class="aegis-chase-header-left">
                  <span class="aegis-chase-chevron">▶</span>
                  <label class="aegis-checklist-toggle" title="Mark as obtained/completed">
                    <input type="checkbox" class="aegis-chase-completed-checkbox" ${isCompleted ? 'checked' : ''} />
                  </label>
                  ${iconUrl ? `<img class="aegis-chase-weapon-icon" src="${iconUrl}" alt="${item.name}" loading="lazy" />` : ''}
                  <div class="aegis-chase-title-group">
                    <div class="aegis-chase-title-row">
                      <span class="aegis-chase-name">${item.name}</span>
                      ${damageIconUrl ? `<img class="aegis-chase-element-icon" src="${damageIconUrl}" title="${damageType}" />` : ''}
                      ${archetype ? `<span class="aegis-chase-pill pill-archetype">${archetype}</span>` : ''}
                      ${rpm ? `<span class="aegis-chase-pill pill-rpm">${rpm} RPM</span>` : ''}
                      ${isCraftable ? `<span class="aegis-chase-pill pill-craftable">Craftable</span>` : ''}
                    </div>
                    <div class="aegis-chase-meta">
                      Source: ${sourceStr}
                    </div>
                  </div>
                </div>
                <div class="aegis-chase-header-actions">
                  <button class="aegis-chase-delete" data-action="delete-chase" title="Remove from Chase List">&times;</button>
                </div>
              </div>
              <div class="aegis-chase-selectors">
                <div class="aegis-chase-select-group">
                  <label>Barrel / Sight</label>
                  <select class="aegis-chase-select" data-type="barrel">
                    ${buildSelectHtml(item.barrel, barrels, barrelsSet)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Magazine / Battery</label>
                  <select class="aegis-chase-select" data-type="mag">
                    ${buildSelectHtml(item.mag, mags, magsSet)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Col 3 - Primary)</label>
                  <select class="aegis-chase-select" data-type="perk1">
                    ${buildSelectHtml(item.perk1, perk1s, perk1sSet)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Col 4 - Primary)</label>
                  <select class="aegis-chase-select" data-type="perk2">
                    ${buildSelectHtml(item.perk2, perk2s, perk2sSet)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Col 3 - Alt 1)</label>
                  <select class="aegis-chase-select" data-type="perk1Alt1">
                    ${buildSelectHtml(item.perk1Alt1 || '', perk1s, perk1Alt1Set)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Col 4 - Alt 1)</label>
                  <select class="aegis-chase-select" data-type="perk2Alt1">
                    ${buildSelectHtml(item.perk2Alt1 || '', perk2s, perk2Alt1Set)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Col 3 - Alt 2)</label>
                  <select class="aegis-chase-select" data-type="perk1Alt2">
                    ${buildSelectHtml(item.perk1Alt2 || '', perk1s, perk1Alt2Set)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Col 4 - Alt 2)</label>
                  <select class="aegis-chase-select" data-type="perk2Alt2">
                    ${buildSelectHtml(item.perk2Alt2 || '', perk2s, perk2Alt2Set)}
                  </select>
                </div>

                <div class="aegis-chase-select-group span-2">
                  <label>Origin Trait</label>
                  <select class="aegis-chase-select" data-type="origin">
                    ${buildSelectHtml(item.origin || '', origins, originsSet)}
                  </select>
                </div>
              </div>
              <div class="aegis-chase-status-row">
                ${statusHtml}
                <div class="aegis-chase-actions">
                  ${highlightBtnHtml}
                  ${destinyReportBtnHtml}
                </div>
              </div>
            </div>
          `;
        } catch (e: any) {
          addDiagnosticLog(`Error processing chase item "${item?.name}": ${e.message}`);
        }
      }

      if (pendingManifestRequests.length > 0) {
        const registryEl = document.getElementById('aegis-global-perk-registry');
        if (registryEl) {
          const requestNames = [...new Set(pendingManifestRequests)];
          requestNames.forEach(name => requestedWeapons.add(name));
          registryEl.setAttribute('data-request-weapon-perks', JSON.stringify(requestNames));
        }
      }

      resultsContainer.innerHTML = html;
      resultsContainer.scrollTop = savedScrollTop;

      bindChaseSearchEvents();
      bindChaseItemEvents();
      return;
    }

function bindChaseSearchEvents() {
  const searchInput = document.querySelector('.aegis-chase-search-input') as HTMLInputElement | null;
  const dropdown = document.querySelector('.aegis-chase-search-dropdown') as HTMLElement | null;
  if (!searchInput || !dropdown) return;

  if (currentChaseSearchQuery) {
    searchInput.value = currentChaseSearchQuery;
  }

  const performSearch = () => {
    const q = searchInput.value.toLowerCase().trim();
    currentChaseSearchQuery = searchInput.value;
    if (!q || q.length < 2) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }

    let matchedWeapons: {
      name: string;
      hash?: number;
      icon?: string;
      damageType?: string;
      damageIcon?: string;
      archetype?: string;
      typeName?: string;
      source?: string;
      isCraftable?: boolean;
    }[] = [];

    if (manifestWeaponList.length > 0) {
      const seen = new Set<string>();
      matchedWeapons = manifestWeaponList
        .filter(w => {
          if (!w.name) return false;
          const n = w.name.toLowerCase();
          const matches = n.includes(q) || (w.archetype && w.archetype.toLowerCase().includes(q)) || (w.typeName && w.typeName.toLowerCase().includes(q));
          if (!matches) return false;
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        })
        .slice(0, 20)
        .map(w => ({
          name: w.name,
          hash: w.hash,
          icon: w.icon,
          damageType: w.damageType,
          damageIcon: w.damageIcon,
          archetype: w.archetype,
          typeName: w.typeName,
          source: w.sourceName || undefined,
          isCraftable: w.isCraftable,
        }));
    } else {
      const activeSheetDb = (aegisMode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE) || aegisSheetDb;
      if (activeSheetDb?.weapons) {
        matchedWeapons = Object.values(activeSheetDb.weapons)
          .filter(w => w.name.toLowerCase().includes(q))
          .slice(0, 20)
          .map(w => ({
            name: w.name,
            archetype: w.frame,
            damageType: w.energy,
            source: w.source,
          }));
      }
    }

    if (matchedWeapons.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'aegis-chase-search-empty';
      emptyEl.textContent = `No matching weapons found for "${searchInput.value.trim()}"`;
      dropdown.replaceChildren(emptyEl);
      dropdown.classList.remove('hidden');
      return;
    }

    const itemsHtml = matchedWeapons.map(w => {
      const isAlreadyTracked = !!chaseList[normName(w.name)];
      const escapedName = w.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `
        <div class="aegis-chase-search-item ${isAlreadyTracked ? 'already-tracked' : ''}" data-weapon-name="${escapedName}">
          ${w.icon ? `<img src="${w.icon}" class="aegis-search-item-thumb" />` : ''}
          <div class="aegis-search-item-text">
            <div class="aegis-search-item-title">
              <span>${escapedName}</span>
              ${w.damageIcon ? `<img src="${w.damageIcon}" class="aegis-search-item-elem" />` : ''}
              ${w.isCraftable ? `<span class="aegis-search-craftable-badge">Craftable</span>` : ''}
            </div>
            <div class="aegis-search-item-subtitle">
              ${w.damageType || ''} ${w.archetype || w.typeName || ''} ${w.source ? `• ${w.source}` : ''}
            </div>
          </div>
          <button class="aegis-search-add-btn" type="button" data-weapon-name="${escapedName}">
            ${isAlreadyTracked ? '✓ In List' : '+ Add Roll'}
          </button>
        </div>
      `;
    }).join('');

    safeSetInnerHTML(dropdown, itemsHtml);
    dropdown.classList.remove('hidden');
  };

  searchInput.addEventListener('input', performSearch);
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 2) performSearch();
  });

  // Prevent mousedown on dropdown from blurring the search input
  dropdown.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  // Direct delegation for clicks anywhere on item or add button
  dropdown.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const itemEl = target.closest('.aegis-chase-search-item') as HTMLElement | null;
    if (!itemEl) return;
    e.stopPropagation();

    const wName = itemEl.getAttribute('data-weapon-name');
    if (!wName) return;
    const norm = normName(wName);
    const manifestW = manifestWeaponsMap[norm];
    const activeSheetDb = (aegisMode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE) || aegisSheetDb;
    const sheetW = activeSheetDb?.weapons?.[norm] || aegisSheetDbPvE?.weapons?.[norm] || aegisSheetDbPvP?.weapons?.[norm];

    const barrels = sheetW ? parseRecommendations(sheetW.barrel) : (manifestW?.barrels || []);
    const mags = sheetW ? parseRecommendations(sheetW.mag) : (manifestW?.magazines || []);
    const perk1s = sheetW ? parseRecommendations(sheetW.perk1) : (manifestW?.perkColumns?.[0] || []);
    const perk2s = sheetW ? parseRecommendations(sheetW.perk2) : (manifestW?.perkColumns?.[1] || []);
    const origins = sheetW ? parseRecommendations(sheetW.origin) : (manifestW?.origins || []);

    chaseList[norm] = {
      name: wName,
      barrel: barrels[0] || (manifestW?.barrels?.[0] || ''),
      mag: mags[0] || (manifestW?.magazines?.[0] || ''),
      perk1: perk1s[0] || (manifestW?.perkColumns?.[0]?.[0] || ''),
      perk1Alt1: perk1s[1] || '',
      perk2: perk2s[0] || (manifestW?.perkColumns?.[1]?.[0] || ''),
      perk2Alt1: perk2s[1] || '',
      origin: origins[0] || (manifestW?.origins?.[0] || ''),
      itemHash: manifestW?.hash,
      icon: manifestW?.icon,
      damageType: manifestW?.damageType || sheetW?.energy,
      damageIcon: manifestW?.damageIcon,
      archetype: manifestW?.archetype || sheetW?.frame,
      typeName: manifestW?.typeName,
      source: manifestW?.sourceName || sheetW?.source,
    };

    chrome.storage.local.set({ aegisChaseList: chaseList });
    expandedChaseWeapons.add(norm);
    currentChaseSearchQuery = '';
    dropdown.classList.add('hidden');
    searchInput.value = '';
    renderResults();
  });

  const onDocClick = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node) && e.target !== searchInput) {
      dropdown.classList.add('hidden');
      document.removeEventListener('click', onDocClick);
    }
  };
  document.addEventListener('click', onDocClick);
}

function bindChaseItemEvents() {
  const chaseRows = document.querySelectorAll('.aegis-chase-row');
  chaseRows.forEach(row => {
    const name = row.getAttribute('data-weapon-name');
    if (!name) return;
    const norm = normName(name);

    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.aegis-chase-select') || target.closest('[data-action="delete-chase"]') || target.closest('[data-action="highlight-matching"]') || target.closest('.aegis-checklist-toggle')) {
        return;
      }
      const currentlyExpanded = row.classList.toggle('expanded');
      if (currentlyExpanded) {
        expandedChaseWeapons.add(norm);
      } else {
        expandedChaseWeapons.delete(norm);
      }
    });

    const checkbox = row.querySelector('.aegis-chase-completed-checkbox') as HTMLInputElement;
    if (checkbox) {
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          completedWeapons[norm] = true;
          row.classList.add('completed');
        } else {
          delete completedWeapons[norm];
          row.classList.remove('completed');
        }
        chrome.storage.local.set({ aegisCompletedWeapons: completedWeapons });
        updateProgressIndicator();
        renderResults();
      });
    }

    const deleteBtn = row.querySelector('[data-action="delete-chase"]');
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      delete chaseList[norm];
      chrome.storage.local.set({ aegisChaseList: chaseList });
      renderResults();
    });

    const highlightBtn = row.querySelector('[data-action="highlight-matching"]');
    highlightBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const idsAttr = highlightBtn.getAttribute('data-ids') || '';
      const ids = idsAttr.split(',').filter(Boolean);
      if (ids.length > 0) {
        triggerDimSearchForIds(ids);
      }
    });

    const selects = row.querySelectorAll('.aegis-chase-select');
    selects.forEach(select => {
      select.addEventListener('change', () => {
        const type = select.getAttribute('data-type') as 'barrel' | 'mag' | 'perk1' | 'perk1Alt1' | 'perk1Alt2' | 'perk2' | 'perk2Alt1' | 'perk2Alt2' | 'origin';
        const val = (select as HTMLSelectElement).value;
        if (chaseList[norm] && type) {
          chaseList[norm][type] = val;
          chrome.storage.local.set({ aegisChaseList: chaseList });
          renderResults();
        }
      });
    });
  });
}

    // 2. EXPLORER DATABASE TAB RENDERER
    updateProgressIndicator();

    const activeDb = (aegisMode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE) || db;
    const searchInput = document.querySelector('.aegis-explorer-search-input') as HTMLInputElement;
    const catInput = document.querySelector('.aegis-explorer-category-input') as HTMLInputElement;
    const frameInput = document.querySelector('.aegis-explorer-frame-input') as HTMLInputElement;
    const elementInput = document.querySelector('.aegis-explorer-element-input') as HTMLInputElement;
    const ammoInput = document.querySelector('.aegis-explorer-ammo-input') as HTMLInputElement;
    const sourceInput = document.querySelector('.aegis-explorer-source-input') as HTMLInputElement;
    const hideCompletedCheckbox = document.querySelector('.aegis-explorer-hide-completed') as HTMLInputElement | null;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedCat = catInput ? catInput.value.toLowerCase().trim() : '';
    const selectedFrame = frameInput ? frameInput.value.toLowerCase().trim() : '';
    const selectedElement = elementInput ? elementInput.value.toLowerCase().trim() : '';
    const selectedAmmo = ammoInput ? ammoInput.value.toLowerCase().trim() : '';
    const selectedSource = sourceInput ? sourceInput.value.toLowerCase().trim() : '';
    const hideCompleted = hideCompletedCheckbox ? hideCompletedCheckbox.checked : false;

    const matches: { weapon: AegisSheetWeapon; category: string }[] = [];

    if (activeDb?.categories) {
      for (const [cat, list] of Object.entries(activeDb.categories)) {
      if (selectedCat && !cat.toLowerCase().includes(selectedCat)) continue;
      const weaponAmmo = AMMO_TYPE_MAP[cat] || 'Other';
      if (selectedAmmo && !weaponAmmo.toLowerCase().includes(selectedAmmo)) continue;

      for (const w of list) {
        const normName = w.name.toLowerCase().trim();
        if (hideCompleted && completedWeapons[normName]) continue;
        if (selectedFrame && !w.frame.toLowerCase().includes(selectedFrame)) continue;
        if (selectedElement && !w.energy.toLowerCase().includes(selectedElement)) continue;
        if (selectedSource && (!w.source || !w.source.toLowerCase().includes(selectedSource))) continue;
        if (query) {
          const localizedName = getLocalizedWeaponName(w.name);
          const nameMatch = w.name.toLowerCase().includes(query) || localizedName.toLowerCase().includes(query);
          const notesMatch = w.notes.toLowerCase().includes(query);
          const frameMatch = w.frame.toLowerCase().includes(query);
          const sourceMatch = w.source ? w.source.toLowerCase().includes(query) : false;
          const perksMatch = (w.perk1 + ' ' + w.perk2).toLowerCase().includes(query);
          if (!nameMatch && !notesMatch && !frameMatch && !sourceMatch && !perksMatch) continue;
        }
        matches.push({ weapon: w, category: cat });
      }
    }
  }

    matches.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      const rA = parseInt(a.weapon.rank, 10);
      const rB = parseInt(b.weapon.rank, 10);
      return (isNaN(rA) ? 999 : rA) - (isNaN(rB) ? 999 : rB);
    });

    if (matches.length === 0) {
      currentExplorerMatches = [];
      renderedExplorerCount = 0;
      resultsContainer.innerHTML = `<div class="aegis-explorer-empty">${t('noMatchingWeapons')}</div>`;
      return;
    }

    currentExplorerMatches = matches;
    renderedExplorerCount = 0;
    resultsContainer.innerHTML = '';
    renderNextExplorerChunk();
    resultsContainer.scrollTop = savedScrollTop;
  } catch (e: any) {
    addDiagnosticLog(`Error in renderResults: ${e.message}\n${e.stack}`);
    const resultsContainer = document.querySelector('.aegis-explorer-results') as HTMLElement;
    if (resultsContainer) {
      resultsContainer.innerHTML = `<div class="aegis-explorer-empty">Error rendering: ${e.message}</div>`;
    }
  }
}

function triggerDimSearch(weaponName: string) {
  const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]') as HTMLInputElement;
  if (searchInput) {
    searchInput.value = `name:"${weaponName}"`;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    const wrapper = searchInput.parentElement;
    if (wrapper) {
      wrapper.classList.remove('aegis-search-flash');
      void wrapper.offsetWidth; // Force layout recalculation
      wrapper.classList.add('aegis-search-flash');
    }
  }
}

function getExplorerTitle(): string {
  if (aegisMode === 'pvp') return t('explorerTitlePvp') || 'Finnald Database Explorer';
  if (aegisMode === 'both') return t('explorerTitleDual') || 'Aegis & Finnald Database Explorer';
  return t('explorerTitle') || 'Aegis Database Explorer';
}

function updateExplorerTitles() {
  const titleEl = document.querySelector('.aegis-explorer-title');
  if (titleEl) {
    titleEl.textContent = getExplorerTitle();
  }
  const tabEl = document.querySelector('.aegis-explorer-tab[data-tab="explorer"]');
  if (tabEl) {
    tabEl.textContent = getExplorerTitle();
  }
  const fabEl = document.querySelector('.aegis-fab') as HTMLElement | null;
  if (fabEl) {
    const author = aegisMode === 'pvp' ? 'Finnald' : (aegisMode === 'both' ? 'Aegis & Finnald' : 'Aegis');
    fabEl.title = `Open ${author} Database Explorer`;
  }
}

function initAegisExplorer() {
  if (!document.body || document.querySelector('.aegis-fab')) return;

  const author = aegisMode === 'pvp' ? 'Finnald' : (aegisMode === 'both' ? 'Aegis & Finnald' : 'Aegis');
  const fab = document.createElement('div');
  fab.className = 'aegis-fab';
  fab.title = `Open ${author} Database Explorer`;
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffd700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  `;

  const panel = document.createElement('div');
  panel.className = 'aegis-explorer-panel';
  panel.innerHTML = `
    <div class="aegis-explorer-header">
      <span class="aegis-explorer-title">${getExplorerTitle()}</span>
      <button class="aegis-explorer-close" title="Close Explorer">&times;</button>
    </div>
    <div class="aegis-explorer-tabs">
      <button class="aegis-explorer-tab active" data-tab="explorer">${getExplorerTitle()}</button>
      <button class="aegis-explorer-tab" data-tab="shopping">${t('shoppingList')}</button>
      <button class="aegis-explorer-tab" data-tab="chase">${t('chaseTitle')}</button>
    </div>
    <div class="aegis-explorer-search-group">
      <input type="text" class="aegis-explorer-search-input" placeholder="${t('searchPlaceholder')}" />
      <div class="aegis-shopping-filter-bar" style="display: none;">
        <div class="aegis-shopping-filter-group type-group">
          <button class="aegis-filter-chip active" data-shopping-type="all">All Items</button>
          <button class="aegis-filter-chip" data-shopping-type="weapon">Weapons</button>
          <button class="aegis-filter-chip" data-shopping-type="armor">Armor</button>
        </div>
        <div class="aegis-shopping-filter-group rarity-group">
          <button class="aegis-filter-chip active" data-shopping-rarity="all">All Rarities</button>
          <button class="aegis-filter-chip" data-shopping-rarity="legendary">Legendary</button>
          <button class="aegis-filter-chip" data-shopping-rarity="exotic">Exotic</button>
        </div>
        <div class="aegis-shopping-filter-group priority-group">
          <button class="aegis-filter-chip active" data-shopping-priority="all">All Priorities</button>
          <button class="aegis-filter-chip chip-high" data-shopping-priority="high">High</button>
          <button class="aegis-filter-chip chip-med" data-shopping-priority="medium">Medium</button>
          <button class="aegis-filter-chip chip-low" data-shopping-priority="low">Rare</button>
          <button class="aegis-filter-chip chip-niche" data-shopping-priority="niche">Niche</button>
        </div>
        <div class="aegis-shopping-filter-group status-group">
          <button class="aegis-filter-chip active" data-shopping-status="all">All Statuses</button>
          <button class="aegis-filter-chip chip-ready" data-shopping-status="ready">Ready</button>
          <button class="aegis-filter-chip chip-suboptimal" data-shopping-status="suboptimal">Suboptimal</button>
          <button class="aegis-filter-chip chip-missing" data-shopping-status="missing">Not Owned</button>
        </div>
      </div>
      <div class="aegis-explorer-selects">
        <div class="aegis-combobox-wrapper" data-combobox-id="category">
          <input type="text" class="aegis-combobox-input aegis-explorer-category-input" placeholder="${t('categoryPlaceholder')}" />
          <span class="aegis-combobox-arrow">▾</span>
          <div class="aegis-combobox-menu hidden">
            <div class="aegis-combobox-options"></div>
          </div>
        </div>

        <div class="aegis-combobox-wrapper" data-combobox-id="frame">
          <input type="text" class="aegis-combobox-input aegis-explorer-frame-input" placeholder="${t('framePlaceholder')}" />
          <span class="aegis-combobox-arrow">▾</span>
          <div class="aegis-combobox-menu hidden">
            <div class="aegis-combobox-options"></div>
          </div>
        </div>
      </div>
      <div class="aegis-explorer-selects">
        <div class="aegis-combobox-wrapper" data-combobox-id="element">
          <input type="text" class="aegis-combobox-input aegis-explorer-element-input" placeholder="${t('elementPlaceholder')}" />
          <span class="aegis-combobox-arrow">▾</span>
          <div class="aegis-combobox-menu hidden">
            <div class="aegis-combobox-options"></div>
          </div>
        </div>

        <div class="aegis-combobox-wrapper" data-combobox-id="ammo">
          <input type="text" class="aegis-combobox-input aegis-explorer-ammo-input" placeholder="${t('ammoPlaceholder')}" />
          <span class="aegis-combobox-arrow">▾</span>
          <div class="aegis-combobox-menu hidden">
            <div class="aegis-combobox-options"></div>
          </div>
        </div>
      </div>
      <div class="aegis-explorer-selects">
        <div class="aegis-combobox-wrapper" data-combobox-id="source">
          <input type="text" class="aegis-combobox-input aegis-explorer-source-input" placeholder="${t('sourcePlaceholder')}" />
          <span class="aegis-combobox-arrow">▾</span>
          <div class="aegis-combobox-menu hidden">
            <div class="aegis-combobox-options"></div>
          </div>
        </div>
      </div>
      <div class="aegis-explorer-sub-controls">
        <label class="aegis-explorer-checkbox-label">
          <input type="checkbox" class="aegis-explorer-hide-completed" />
          ${t('hideCheckedOff')}
        </label>
        <div class="aegis-explorer-progress-container">
          <span class="aegis-explorer-progress-text">Completed: 0/0 (0%)</span>
          <div class="aegis-explorer-progress-bg">
            <div class="aegis-explorer-progress-bar"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="aegis-explorer-results">
      <div class="aegis-explorer-empty">${t('loadingDatabase')}</div>
    </div>
    <details class="aegis-diagnostic-logs" style="border-top: 1px solid #333; margin-top: auto; font-size: 10px; font-family: monospace; color: #aaa; background: #161a22; padding: 4px 8px; flex-shrink: 0; display: flex; flex-direction: column;">
      <summary style="cursor: pointer; padding: 4px 0; color: #ffd700; font-weight: bold; user-select: none;">Aegis Diagnostic Logs</summary>
      <div class="aegis-diagnostic-logs-content" style="max-height: 120px; overflow-y: auto; white-space: pre-wrap; margin-top: 4px; padding-bottom: 8px; font-size: 9px; line-height: 1.3;"></div>
    </details>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const diagContent = panel.querySelector('.aegis-diagnostic-logs-content');
  if (diagContent) {
    diagContent.textContent = diagnosticLogs.join('\n') + (diagnosticLogs.length > 0 ? '\n' : '');
  }

  const closeBtn = panel.querySelector('.aegis-explorer-close');
  const searchInput = panel.querySelector('.aegis-explorer-search-input');
  const hideCompletedCheckbox = panel.querySelector('.aegis-explorer-hide-completed');

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      populateFilters();
      populateSourceFilter();
      populateComboboxMenu('element');
      populateComboboxMenu('ammo');
      renderResults();
    }
  });

  closeBtn?.addEventListener('click', () => panel.classList.remove('open'));
  searchInput?.addEventListener('input', renderResults);

  // Setup Shopping List Filter chips
  panel.querySelectorAll('[data-shopping-type]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.querySelectorAll('[data-shopping-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      shoppingTypeFilter = (btn.getAttribute('data-shopping-type') || 'all') as any;
      renderResults();
    });
  });

  panel.querySelectorAll('[data-shopping-rarity]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.querySelectorAll('[data-shopping-rarity]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      shoppingRarityFilter = (btn.getAttribute('data-shopping-rarity') || 'all') as any;
      renderResults();
    });
  });

  panel.querySelectorAll('[data-shopping-priority]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.querySelectorAll('[data-shopping-priority]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      shoppingPriorityFilter = (btn.getAttribute('data-shopping-priority') || 'all') as any;
      renderResults();
    });
  });

  panel.querySelectorAll('[data-shopping-status]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.querySelectorAll('[data-shopping-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      shoppingStatusFilter = (btn.getAttribute('data-shopping-status') || 'all') as any;
      renderResults();
    });
  });

  // Setup Combobox event listeners for dropdown popups
  ['category', 'frame', 'element', 'ammo', 'source'].forEach(id => {
    const wrapper = panel.querySelector(`.aegis-combobox-wrapper[data-combobox-id="${id}"]`) as HTMLElement;
    if (!wrapper) return;
    const input = wrapper.querySelector('.aegis-combobox-input') as HTMLInputElement;
    const menu = wrapper.querySelector('.aegis-combobox-menu') as HTMLElement;

    const openMenu = () => {
      panel.querySelectorAll('.aegis-combobox-menu').forEach(m => {
        if (m !== menu) m.classList.add('hidden');
      });
      panel.querySelectorAll('.aegis-combobox-wrapper').forEach(w => {
        if (w !== wrapper) w.classList.remove('active');
      });

      populateComboboxMenu(id);
      wrapper.classList.add('active');
      menu.classList.remove('hidden');
    };

    input?.addEventListener('focus', openMenu);
    input?.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu();
    });

    input?.addEventListener('input', () => {
      populateComboboxMenu(id);
      if (id === 'category') populateFramesFilter(input.value);
      if (id === 'ammo') populateFilters();
      renderResults();
    });
  });

  // Global click listener to dismiss open combobox menus
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.aegis-combobox-wrapper')) {
      document.querySelectorAll('.aegis-combobox-menu').forEach(m => m.classList.add('hidden'));
      document.querySelectorAll('.aegis-combobox-wrapper').forEach(w => w.classList.remove('active'));
    }
  });

  // Tab switching setup
  const tabs = panel.querySelectorAll('.aegis-explorer-tab');
  const searchGroup = panel.querySelector('.aegis-explorer-search-group') as HTMLElement;
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab') || 'explorer';

      panel.classList.toggle('tab-shopping', activeTab === 'shopping');
      panel.classList.toggle('tab-chase', activeTab === 'chase');
      panel.classList.toggle('tab-explorer', activeTab === 'explorer');

      if (activeTab === 'chase') {
        if (searchGroup) searchGroup.style.display = 'none';
      } else {
        if (searchGroup) searchGroup.style.display = 'flex';
      }
      renderResults();
    });
  });

  hideCompletedCheckbox?.addEventListener('change', () => {
    renderResults();
  });

  // Attach unified infinite scroll and event delegation on resultsContainer
  const resultsContainer = panel.querySelector('.aegis-explorer-results') as HTMLElement | null;
  if (resultsContainer) {
    // Infinite scroll listener for progressive chunk loading
    resultsContainer.addEventListener('scroll', () => {
      if (activeTab !== 'explorer') return;
      if (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - 350) {
        renderNextExplorerChunk();
      }
    }, { passive: true });

    // Single unified click delegation listener for all explorer rows
    resultsContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Filter in Vault button action
      const filterBtn = target.closest('[data-action="filter-vault"]');
      if (filterBtn) {
        e.stopPropagation();
        const row = filterBtn.closest('.aegis-explorer-row');
        const name = row?.getAttribute('data-weapon-name');
        if (name) triggerDimSearch(normName(name));
        return;
      }

      // Chase weapon button action
      const chaseBtn = target.closest('[data-action="chase-weapon"]') as HTMLButtonElement | null;
      if (chaseBtn) {
        e.stopPropagation();
        const row = chaseBtn.closest('.aegis-explorer-row');
        const name = row?.getAttribute('data-weapon-name');
        if (name) {
          const norm = normName(name);
          const db = aegisSheetDb;
          const w = db?.weapons[norm];
          if (chaseList[norm]) {
            delete chaseList[norm];
            chaseBtn.classList.remove('aegis-btn-chase-active');
            chaseBtn.textContent = '+ Chase';
          } else if (w) {
            const perk1s = parseRecommendations(w.perk1);
            const perk2s = parseRecommendations(w.perk2);
            const manifestW = manifestWeaponsMap[norm];

            chaseList[norm] = {
              name: w.name,
              barrel: '',
              mag: '',
              perk1: perk1s[0] || (manifestW?.perkColumns?.[0]?.[0] || ''),
              perk1Alt1: '',
              perk1Alt2: '',
              perk2: perk2s[0] || (manifestW?.perkColumns?.[1]?.[0] || ''),
              perk2Alt1: '',
              perk2Alt2: '',
              origin: '',
              itemHash: manifestW?.hash,
              icon: manifestW?.icon,
              damageType: manifestW?.damageType || w.energy,
              damageIcon: manifestW?.damageIcon,
              archetype: manifestW?.archetype || w.frame,
              typeName: manifestW?.typeName,
              source: manifestW?.sourceName || w.source,
            };
            chaseBtn.classList.add('aegis-btn-chase-active');
            chaseBtn.textContent = 'Remove Chase';
          }
          chrome.storage.local.set({ aegisChaseList: chaseList });
          if (activeTab === 'chase') {
            renderResults();
          }
        }
        return;
      }

      // Destiny.Report link action
      if (target.closest('.aegis-btn-report')) {
        e.stopPropagation();
        return;
      }

      // Row expand / collapse accordion
      const row = target.closest('.aegis-explorer-row') as HTMLElement | null;
      if (row) {
        if (target.closest('.aegis-explorer-row-actions') || target.closest('.aegis-checklist-toggle')) {
          return;
        }
        const currentExpanded = resultsContainer.querySelector('.aegis-explorer-row.expanded');
        if (currentExpanded && currentExpanded !== row) {
          currentExpanded.classList.remove('expanded');
        }
        row.classList.toggle('expanded');
      }
    });

    // Single unified change delegation listener for Checklist checkboxes
    resultsContainer.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.matches('.aegis-checklist-checkbox')) {
        const row = target.closest('.aegis-explorer-row');
        const name = row?.getAttribute('data-weapon-name');
        if (name) {
          const norm = normName(name);
          if (target.checked) {
            completedWeapons[norm] = true;
            row?.classList.add('completed');
          } else {
            delete completedWeapons[norm];
            row?.classList.remove('completed');
          }
          chrome.storage.local.set({ aegisCompletedWeapons: completedWeapons });
          updateProgressIndicator();
          const hideCheckbox = document.querySelector('.aegis-explorer-hide-completed') as HTMLInputElement | null;
          if (hideCheckbox?.checked) {
            renderResults();
          }
        }
      }
    });
  }
}

function showWelcomeModal() {
  if (document.querySelector('.aegis-welcome-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'aegis-welcome-backdrop';

  backdrop.innerHTML = `
    <div class="aegis-welcome-modal">
      <div class="aegis-welcome-header">
        <span class="aegis-welcome-title">Welcome to DIM Aegis Overlay</span>
        <button class="aegis-welcome-close" title="Dismiss Tutorial">&times;</button>
      </div>
      
      <div class="aegis-welcome-slides">
        <!-- Slide 1: Welcome & What's New in v1.8.1 -->
        <div class="aegis-welcome-slide active" data-slide="0">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Getting Started & What's New in v1.8.1</span>
            <p class="tooltip-desc" style="font-size: 12.5px; line-height: 1.5; margin-top: 6px; margin-bottom: 10px;">
              This extension enhances Destiny Item Manager (DIM) by displaying meta spreadsheet weapon rankings, perk accuracy ratings, and custom armor set configurations directly on your items.
            </p>

            <div style="border: 1px solid rgba(255, 215, 0, 0.3); background: rgba(255, 215, 0, 0.05); padding: 10px 12px; border-radius: 8px; margin-bottom: 10px;">
              <div style="font-size: 10px; font-weight: 800; color: #ffd700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                <span>What's New in Release v1.8.1</span>
              </div>
              <ul style="font-size: 11px; line-height: 1.45; color: #e5e9f0; margin: 0; padding-left: 16px;">
                <li><strong>Aegis Shopping List & Live Vault Readiness:</strong> Real-time inventory audit classifying weapons into Ready, Suboptimal, or Missing with expandable cards, vault copies drawers, and viable alternatives with hover tooltips.</li>
                <li><strong>Multi-Language Localization:</strong> Translation support across 6 languages (EN, ES, KO, JA, ZH-Hans, ZH-Hant) with auto DIM language detection <em>(WIP & mostly machine-translated for now)</em>.</li>
                <li><strong>Interactive Badge Customization Suite:</strong> Interactive 4-corner positioner, visual styles (Original, Slim Pill, Top Notch), text scaling (70%–130%), and smooth peek-on-hover fading.</li>
                <li><strong>Deep Tooltip Customization:</strong> Custom width slider (260px–450px), compact 2-column recommended perk matrix, and strict spreadsheet perk rank ordering.</li>
              </ul>
            </div>
            
            <div class="tooltip-note" style="border: 1px solid rgba(231, 76, 60, 0.4); background: rgba(231, 76, 60, 0.08); padding: 10px 12px; border-radius: 8px; font-size: 11px; color: #ff9f9f; line-height: 1.45;">
              <strong>DISCLAIMER:</strong> Sourced from Aegis' Endgame PvE spreadsheet. <u><strong>As of 1.7.0</strong></u> , a PVP spreadsheet was added made by Finnald that can be toggeled in the extension settings.
            </div>
          </div>
        </div>

        <!-- Slide 2: Scoring & Grades Guide -->
        <div class="aegis-welcome-slide" data-slide="1">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Scoring & Grades Guide</span>
            <span class="tooltip-section-header" style="margin-top: 6px; font-size: 9.5px; color: #ffd700;">1. Standard Grading (Match Accuracy)</span>
            
            <div class="tooltip-grid" style="margin-top: 6px; row-gap: 5px; column-gap: 10px;">
              <span class="grade-pill grade-s-pill">S+</span><span>Traits 1 & 2 + Mag + Barrel + Origin</span>
              <span class="grade-pill grade-s-pill">S</span><span>Traits 1 & 2 + Magazine matched</span>
              <span class="grade-pill grade-a-pill">A+</span><span>Traits 1 & 2 + Barrel matched</span>
              <span class="grade-pill grade-a-pill">A</span><span>Traits 1 & 2 both matched</span>
              <span class="grade-pill grade-b-pill">B+</span><span>1 Trait active + 1 selectable + Mag/Barrel</span>
              <span class="grade-pill grade-b-pill">B</span><span>1 Trait active + 1 selectable Trait</span>
              <span class="grade-pill grade-c-pill">C</span><span>1 Trait matched + Magazine or Barrel</span>
              <span class="grade-pill grade-d-pill">D</span><span>Only 1 Trait matched</span>
              <span class="grade-pill grade-f-pill">F</span><span>Underperforming (no Traits matched)</span>
            </div>
            <span class="tooltip-note" style="display: block; margin-top: 4px; margin-bottom: 8px;">*Main Traits 1 & 2 must match to score A or higher.</span>
            
            <div class="tooltip-divider" style="margin: 8px 0;"></div>
            
            <p class="tooltip-desc" style="margin-bottom: 6px; font-size: 10.5px;"><strong>Perk Details Previews:</strong> Hovering weapons in DIM displays scoring overlays:</p>
            <div style="display: flex; justify-content: center; margin-top: 4px;">
              <img src="${chrome.runtime.getURL('aegis_recommended_perks.png')}" style="width: 500px; height: 220px; object-fit: cover; object-position: top; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #12121a;" alt="Recommended Perks Overlay" />
            </div>
          </div>
        </div>

        <!-- Slide 3: 2-Tier System & Dual Grades -->
        <div class="aegis-welcome-slide" data-slide="2">
          <div class="tooltip-section">
            <span class="tooltip-section-header">2. Advanced Overlay Modes & Dual Grades</span>
            <p class="tooltip-desc">Combines weapon archetype tier with roll quality & upgrade potential:</p>
            
            <div class="two-tier-demo-wrapper" style="margin-top: 8px; margin-bottom: 8px; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 6px; padding: 12px; display: flex; align-items: center; gap: 16px;">
              <img src="${chrome.runtime.getURL('two-tier-demo.png')}" class="two-tier-demo-img" style="width: 72px; height: auto; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.1);" alt="2-tier grade badge demo" />
              <div class="two-tier-demo-text" style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                <div class="tooltip-formula" style="margin: 0; padding: 4px 8px; font-size: 10.5px; background: #08080c; border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; color: #ffb300; text-align: center; font-weight: 700;">[Archetype Tier] [Roll Grade]</div>
                <span class="tooltip-note" style="font-size: 10px;">Example: <b>BS+</b> means archetype is <b>B-Tier</b>, but your roll is a perfect <b>S+</b>.</span>
              </div>
            </div>
            
            <p class="tooltip-desc" style="font-size: 11px; line-height: 1.45;">
              - <strong>Dual Grades (<span style="color: #ffd700;">F ➔ S+</span>):</strong> Shows equipped rank alongside its upgrade potential if you select available perks!<br/>
              - <strong>Spreadsheet Modes:</strong> Sourced from <strong>Aegis (PvE)</strong> or <strong>Finnald (PvP)</strong>.
            </p>
            
            <div class="tooltip-divider" style="margin: 6px 0;"></div>
            
            <div class="tooltip-note" style="border: 1px solid rgba(255, 215, 0, 0.25); background: rgba(255, 215, 0, 0.04); padding: 8px; border-radius: 6px; font-size: 10.5px; line-height: 1.4; color: #ffd700;">
              <strong>How to Toggle:</strong> Click the <strong>Aegis extension icon</strong> in your browser's toolbar (top right) to open settings and customize modes!
            </div>
          </div>
        </div>

        <!-- Slide 4: Database Explorer & Chase List -->
        <div class="aegis-welcome-slide" data-slide="3">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Database Explorer & Chase List</span>
            <p class="tooltip-desc">Easily browse recommendations and build your dream loadouts:</p>
            <div style="display: flex; gap: 14px; justify-content: center; margin-top: 6px; margin-bottom: 8px;">
              <img src="${chrome.runtime.getURL('database_explorer_tab.png')}" style="width: 200px; height: auto; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #12121a;" alt="Database Explorer" />
              <img src="${chrome.runtime.getURL('chase_list_tab.png')}" style="width: 200px; height: auto; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #12121a;" alt="Chase List" />
            </div>
            <p class="tooltip-desc"><strong>Database Explorer:</strong> Click the floating magnifying glass on the bottom right of DIM to search weapons, elements, and frames.</p>
            <p class="tooltip-desc" style="margin-top: 4px;"><strong>My Chase List:</strong> Add weapons to your Chase List, choose your target rolls, and filter/highlight them in your vault with a single click.</p>
          </div>
        </div>

        <!-- Slide 5: Vault Search Filtering -->
        <div class="aegis-welcome-slide" data-slide="4">
          <div class="tooltip-section">
            <span class="tooltip-section-header">3. Vault Search Filtering</span>
            <p class="tooltip-desc">Type these filters directly into the DIM search bar:</p>
            
            <div class="search-filter-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 6px; font-size: 11px;">
              <div class="filter-group" style="display: flex; flex-direction: column; gap: 6px;">
                <div class="filter-group-title" style="font-weight: 700; color: #ffb300; text-transform: uppercase; font-size: 9.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2px;">Weapons</div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:w:b</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Filters by weapon tier (e.g., B-Tier archetype)</span>
                </div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:p:s+</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Filters by perk roll grade (e.g., S+ roll quality)</span>
                </div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:bs+</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Filters by exact 2-tier combo (B archetype, S+ roll)</span>
                </div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:god</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Highlights all S and S+ perk rolls</span>
                </div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:upgrade</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Highlights weapons with unselected better perk choices</span>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <div class="filter-group" style="display: flex; flex-direction: column; gap: 6px;">
                  <div class="filter-group-title" style="font-weight: 700; color: #ffb300; text-transform: uppercase; font-size: 9.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2px;">Armor (Set Bonuses)</div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:a:2p:s</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filters armor by 2pc set bonus grade (e.g., S-Tier)</span>
                  </div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:a:4p:a</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filters armor by 4pc set bonus grade (e.g., A-Tier)</span>
                  </div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:a:s/a</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filters armor with exact combined 2pc S / 4pc A</span>
                  </div>
                </div>
                <div class="filter-group" style="display: flex; flex-direction: column; gap: 6px;">
                  <div class="filter-group-title" style="font-weight: 700; color: #ffb300; text-transform: uppercase; font-size: 9.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2px;">Operators (Universal)</div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:p:&gt;=b</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filter perks B or better (works with w:, 2p:, 4p:)</span>
                  </div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:w:&gt;a</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filter weapons strictly higher than A-Tier</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="tooltip-divider" style="margin: 8px 0;"></div>
            <p class="tooltip-note"><strong>Pro-Tip:</strong> Want to use your own wishlist? You can sync and toggle custom DIM wishlists in the settings popup anytime.</p>
          </div>
        </div>

        <!-- Slide 6: Support the Project -->
        <div class="aegis-welcome-slide" data-slide="5">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Support the Project</span>
            <p class="tooltip-desc" style="font-size: 12.5px; line-height: 1.5; margin-top: 6px; margin-bottom: 12px;">This extension is free and open-source, maintained to help fellow Guardians build their perfect vaults.</p>
            <p class="tooltip-desc" style="margin-bottom: 20px;">If you find the tool useful, please consider supporting development costs or Chrome Web Store hosting.</p>
            
            <div style="display: flex; justify-content: center; margin-bottom: 20px;">
              <a href="https://ko-fi.com/dilligafm8" target="_blank" rel="noopener noreferrer" class="aegis-welcome-kofi-btn">
                Support on Ko-fi
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="aegis-welcome-footer">
        <label class="aegis-welcome-dismiss-checkbox">
          <input type="checkbox" id="aegis-welcome-dont-show" />
          Do not show this again
        </label>
        
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="aegis-welcome-dots">
            <span class="aegis-welcome-dot active" data-index="0"></span>
            <span class="aegis-welcome-dot" data-index="1"></span>
            <span class="aegis-welcome-dot" data-index="2"></span>
            <span class="aegis-welcome-dot" data-index="3"></span>
            <span class="aegis-welcome-dot" data-index="4"></span>
            <span class="aegis-welcome-dot" data-index="5"></span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="aegis-welcome-back-btn" style="display: none;">Back</button>
            <button class="aegis-welcome-next-btn">Next</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  let currentSlide = 0;
  const totalSlides = 6;
  const slides = backdrop.querySelectorAll('.aegis-welcome-slide');
  const dots = backdrop.querySelectorAll('.aegis-welcome-dot');
  const nextBtn = backdrop.querySelector('.aegis-welcome-next-btn') as HTMLButtonElement;
  const backBtn = backdrop.querySelector('.aegis-welcome-back-btn') as HTMLButtonElement;
  const closeBtn = backdrop.querySelector('.aegis-welcome-close');
  const dontShowCheckbox = backdrop.querySelector('#aegis-welcome-dont-show') as HTMLInputElement;

  function updateSlide(index: number) {
    currentSlide = index;
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');

    backBtn.style.display = currentSlide === 0 ? 'none' : 'block';

    if (currentSlide === totalSlides - 1) {
      nextBtn.textContent = 'Get Started';
    } else {
      nextBtn.textContent = 'Next';
    }
  }

  nextBtn.addEventListener('click', () => {
    if (currentSlide < totalSlides - 1) {
      updateSlide(currentSlide + 1);
    } else {
      dismissModal();
    }
  });

  backBtn.addEventListener('click', () => {
    if (currentSlide > 0) {
      updateSlide(currentSlide - 1);
    }
  });

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const index = parseInt(dot.getAttribute('data-index') || '0', 10);
      updateSlide(index);
    });
  });

  function dismissModal() {
    if (dontShowCheckbox.checked) {
      chrome.storage.local.set({ aegisWelcomeDismissed: true });
    }
    backdrop.remove();
  }

  closeBtn?.addEventListener('click', dismissModal);
}

/**
 * Single-slide Winnower welcome modal describing what the extension does on
 * Winnower. Image-free, so winnower.garden needs no web_accessible_resources.
 */
function showWinnowerWelcomeModal() {
  if (document.querySelector('.aegis-welcome-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'aegis-welcome-backdrop';

  backdrop.innerHTML = `
    <div class="aegis-welcome-modal">
      <div class="aegis-welcome-header">
        <span class="aegis-welcome-title">Aegis Overlay on Winnower</span>
        <button class="aegis-welcome-close" title="Dismiss">&times;</button>
      </div>

      <div class="aegis-welcome-slides">
        <div class="aegis-welcome-slide active" data-slide="0">
          <div class="tooltip-section">
            <span class="tooltip-section-header">DIM AEGIS OVERLAY NOW WORKS ON WINNOWER</span>
            <p class="tooltip-desc" style="font-size: 12.5px; line-height: 1.5; margin-top: 6px; margin-bottom: 10px;">
              When using this extension on Winnower, you'll see:
            </p>
            <ul style="font-size: 11.5px; line-height: 1.6; color: #e5e9f0; margin: 0 0 10px; padding-left: 16px;">
              <li><strong>Grade badges</strong> under each weapon name and before each armor name, using your badge-mode setting (e.g. 2-Tier grading).</li>
              <li><strong>Hover tooltips</strong> on the weapon name: analysis notes, recommended masterwork, and the full matched / selectable / missing perk checklist.</li>
              <li><strong>Click a badge or weapon name</strong> to pin the tooltip for reading; click away, press Escape, or scroll to dismiss.</li>
            </ul>
            <p class="tooltip-desc" style="font-size: 11px; line-height: 1.5; margin-bottom: 10px;">
              This extension and Winnower won't always agree on the quality of a roll. The badges grade each roll against recommended perks from a spreadsheet; Winnower's own ratings also weigh what else is in your vault.
            </p>
            <div class="tooltip-note" style="border: 1px solid rgba(255, 215, 0, 0.25); background: rgba(255, 215, 0, 0.04); padding: 8px; border-radius: 6px; font-size: 10.5px; line-height: 1.4; color: #ffd700;">
              <strong>Settings:</strong> click the Aegis extension icon in your browser's toolbar to switch spreadsheet mode, badge style, and databases. The same settings apply on both sites.
            </div>
          </div>
        </div>
      </div>

      <div class="aegis-welcome-footer">
        <label class="aegis-welcome-dismiss-checkbox">
          <input type="checkbox" id="aegis-welcome-dont-show" />
          Do not show this again
        </label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="aegis-welcome-next-btn">Get Started</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const nextBtn = backdrop.querySelector('.aegis-welcome-next-btn') as HTMLButtonElement;
  const closeBtn = backdrop.querySelector('.aegis-welcome-close');
  const dontShowCheckbox = backdrop.querySelector('#aegis-welcome-dont-show') as HTMLInputElement;

  function dismissModal() {
    if (dontShowCheckbox.checked) {
      chrome.storage.local.set({ aegisWelcomeDismissed: true });
    }
    backdrop.remove();
  }

  nextBtn.addEventListener('click', dismissModal);
  closeBtn?.addEventListener('click', dismissModal);
}

chrome.storage.local.get(['wishlistData', 'enhancedToNormal', 'scoringSource', 'lightggData', 'aegisSheetDb', 'aegisSheetDbPvE', 'aegisSheetDbPvP', 'aegisShoppingDb', 'aegisShoppingDbPvE', 'aegisShoppingDbPvP', 'perkRegistry', 'aegisLayoutSide', 'aegisPerkOrder', 'aegisDbMode', 'aegisMode', 'aegisTwoTier', 'aegisBadgePosition', 'aegisBadgeStyle', 'aegisBadgeScale', 'aegisFadeHover', 'aegisGradeDisplayMode', 'aegisHoverEnabled', 'aegisCompactPerksMatrix', 'aegisInlineHeader', 'aegisPopupSummaryMode', 'aegisAutoMaxHeight', 'aegisTooltipWidthMode', 'aegisTooltipWidth', 'aegisArmorSource', 'aegisCompletedWeapons', 'aegisChaseList', 'aegisWelcomeDismissed', 'aegisLanguage'], (res) => {
  initLanguage(res.aegisLanguage);
  wishlistDb = res.wishlistData || {};
  enhancedToNormalMap = res.enhancedToNormal || {};
  completedWeapons = res.aegisCompletedWeapons || {};
  chaseList = res.aegisChaseList || {};
  scoringSource = res.scoringSource || 'aegis';
  aegisLayoutSide = res.aegisLayoutSide || 'side';
  aegisPerkOrder = res.aegisPerkOrder || 'sheet';
  aegisDbMode = res.aegisDbMode || 'both';
  aegisMode = res.aegisMode || 'pve';
  aegisTwoTier = res.aegisTwoTier || false;
  aegisBadgePosition = res.aegisBadgePosition || 'bottom-left';
  aegisBadgeStyle = (res.aegisBadgeStyle === 'pill' || res.aegisBadgeStyle === 'notch') ? res.aegisBadgeStyle : 'classic';
  aegisBadgeScale = typeof res.aegisBadgeScale === 'number' ? res.aegisBadgeScale : 100;
  document.documentElement.style.setProperty('--aegis-badge-scale', (aegisBadgeScale / 100).toString());
  aegisFadeHover = res.aegisFadeHover === true;
  aegisGradeDisplayMode = res.aegisGradeDisplayMode || 'equipped';
  aegisHoverEnabled = res.aegisHoverEnabled !== false;
  aegisCompactPerksMatrix = res.aegisCompactPerksMatrix === true;
  aegisInlineHeader = res.aegisInlineHeader !== false;
  aegisPopupSummaryMode = res.aegisPopupSummaryMode || 'full';
  aegisAutoMaxHeight = res.aegisAutoMaxHeight !== false;
  aegisTooltipWidthMode = res.aegisTooltipWidthMode || 'fixed';
  aegisTooltipWidth = typeof res.aegisTooltipWidth === 'number' ? res.aegisTooltipWidth : 280;
  applyTooltipWidthStyles();
  aegisArmorSource = res.aegisArmorSource || 'lowco';
  lightggDb = res.lightggData || {};
  aegisSheetDb = res.aegisSheetDb || null;
  aegisSheetDbPvE = res.aegisSheetDbPvE || null;
  aegisSheetDbPvP = res.aegisSheetDbPvP || null;
  aegisShoppingDb = res.aegisShoppingDb || null;
  aegisShoppingDbPvE = res.aegisShoppingDbPvE || null;
  aegisShoppingDbPvP = res.aegisShoppingDbPvP || null;
  if (clearLegacyDefaultChaseFilters()) {
    chrome.storage.local.set({ aegisChaseList: chaseList });
  }
  updateNameToHashFromWishlist();
  updatePerkNameToIcon(res.perkRegistry || {});
  updatePerkNameToHash(res.perkRegistry || {});
  reprocessAllElements();
  void refreshEvaluationLocale(false);
  if (!IS_WINNOWER_HOST) {
    initAegisExplorer(); // DIM-only: Winnower has its own weapon browser
  }

  if (!res.aegisWelcomeDismissed) {
    if (IS_WINNOWER_HOST) {
      showWinnowerWelcomeModal();
    } else {
      showWelcomeModal();
    }
  }
});

// Watch for changes in storage (e.g. manual sync from settings popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    let changed = false;
    let evaluationLocaleRefreshNeeded = false;
    let forceEvaluationLocaleRefresh = false;
    if (changes.aegisLanguage) {
      initLanguage(changes.aegisLanguage.newValue);
      const existingPanel = document.querySelector('.aegis-explorer-panel');
      const existingFab = document.querySelector('.aegis-fab');
      if (existingPanel) existingPanel.remove();
      if (existingFab) existingFab.remove();
      if (!IS_WINNOWER_HOST) {
        initAegisExplorer();
      }
      const existingWidget = document.querySelector('.aegis-search-widget');
      if (existingWidget) existingWidget.remove();
      setupSearchWidget();
      evaluationLocaleRefreshNeeded = true;
      changed = true;
    }
    if (changes.wishlistData) {
      wishlistDb = changes.wishlistData.newValue || {};
      updateNameToHashFromWishlist();
      changed = true;
    }
    if (changes.enhancedToNormal) {
      enhancedToNormalMap = changes.enhancedToNormal.newValue || {};
      changed = true;
    }
    if (changes.scoringSource) {
      scoringSource = changes.scoringSource.newValue || 'aegis';
      changed = true;
    }
    if (changes.aegisLayoutSide) {
      aegisLayoutSide = changes.aegisLayoutSide.newValue || 'side';
      changed = true;
    }
    if (changes.aegisPerkOrder) {
      aegisPerkOrder = changes.aegisPerkOrder.newValue || 'sheet';
      changed = true;
    }
    if (changes.aegisDbMode) {
      aegisDbMode = changes.aegisDbMode.newValue || 'both';
      changed = true;
    }
    if (changes.aegisShoppingDb) {
      aegisShoppingDb = changes.aegisShoppingDb.newValue || null;
      changed = true;
    }
    if (changes.aegisShoppingDbPvE) {
      aegisShoppingDbPvE = changes.aegisShoppingDbPvE.newValue || null;
      changed = true;
    }
    if (changes.aegisShoppingDbPvP) {
      aegisShoppingDbPvP = changes.aegisShoppingDbPvP.newValue || null;
      changed = true;
    }
    if (changes.aegisSheetDbPvE) {
      aegisSheetDbPvE = changes.aegisSheetDbPvE.newValue || null;
      superiorsCache.clear();
      evaluationLocaleRefreshNeeded = true;
      forceEvaluationLocaleRefresh = true;
      changed = true;
    }
    if (changes.aegisSheetDbPvP) {
      aegisSheetDbPvP = changes.aegisSheetDbPvP.newValue || null;
      superiorsCache.clear();
      evaluationLocaleRefreshNeeded = true;
      forceEvaluationLocaleRefresh = true;
      changed = true;
    }
    if (changes.aegisMode) {
      aegisMode = changes.aegisMode.newValue || 'pve';
      const activeShopping = aegisMode === 'pvp'
        ? (aegisShoppingDbPvP || aegisShoppingDbPvE)
        : (aegisShoppingDbPvE || aegisShoppingDbPvP);
      if (activeShopping) {
        aegisShoppingDb = activeShopping;
      }
      const activeDb = aegisMode === 'pvp'
        ? (aegisSheetDbPvP || aegisSheetDbPvE)
        : (aegisSheetDbPvE || aegisSheetDbPvP);
      if (activeDb && aegisMode !== 'both') {
        aegisSheetDb = activeDb;
      }
      if (aegisMode === 'both') {
        aegisTooltipWidthMode = 'auto';
      } else if (aegisMode === 'pve' || aegisMode === 'pvp') {
        aegisTooltipWidthMode = 'fixed';
      }
      applyTooltipWidthStyles();
      updateExplorerTitles();
      changed = true;
    }
    if (changes.aegisTwoTier) {
      aegisTwoTier = changes.aegisTwoTier.newValue || false;
      changed = true;
    }
    if (changes.aegisBadgePosition) {
      aegisBadgePosition = changes.aegisBadgePosition.newValue || 'bottom-left';
      changed = true;
    }
    if (changes.aegisBadgeStyle) {
      const val = changes.aegisBadgeStyle.newValue;
      aegisBadgeStyle = (val === 'pill' || val === 'notch') ? val : 'classic';
      changed = true;
    }
    if (changes.aegisBadgeScale) {
      aegisBadgeScale = typeof changes.aegisBadgeScale.newValue === 'number' ? changes.aegisBadgeScale.newValue : 100;
      document.documentElement.style.setProperty('--aegis-badge-scale', (aegisBadgeScale / 100).toString());
      changed = true;
    }
    if (changes.aegisFadeHover) {
      aegisFadeHover = changes.aegisFadeHover.newValue === true;
      changed = true;
    }
    if (changes.aegisGradeDisplayMode) {
      aegisGradeDisplayMode = changes.aegisGradeDisplayMode.newValue || 'equipped';
      changed = true;
    }
    if (changes.aegisCompactPerksMatrix) {
      aegisCompactPerksMatrix = changes.aegisCompactPerksMatrix.newValue === true;
    }
    if (changes.aegisInlineHeader) {
      aegisInlineHeader = changes.aegisInlineHeader.newValue !== false;
    }
    if (changes.aegisPopupSummaryMode) {
      aegisPopupSummaryMode = changes.aegisPopupSummaryMode.newValue || 'full';
      changed = true;
    }
    if (changes.aegisAutoMaxHeight) {
      aegisAutoMaxHeight = changes.aegisAutoMaxHeight.newValue !== false;
    }
    if (changes.aegisTooltipWidthMode) {
      aegisTooltipWidthMode = changes.aegisTooltipWidthMode.newValue || 'fixed';
      applyTooltipWidthStyles();
    }
    if (changes.aegisTooltipWidth) {
      aegisTooltipWidth = typeof changes.aegisTooltipWidth.newValue === 'number' ? changes.aegisTooltipWidth.newValue : 280;
      applyTooltipWidthStyles();
    }
    if (changes.aegisHoverEnabled) {
      aegisHoverEnabled = changes.aegisHoverEnabled.newValue !== false;
      if (!aegisHoverEnabled) {
        if (tooltipShowTimer) {
          clearTimeout(tooltipShowTimer);
          tooltipShowTimer = null;
        }
        hoveredElement = null;
        hideTooltip();
      }
    }
    if (changes.aegisArmorSource) {
      aegisArmorSource = changes.aegisArmorSource.newValue || 'lowco';
      changed = true;
    }
    if (changes.lightggData) {
      lightggDb = changes.lightggData.newValue || {};
      changed = true;
    }
    if (changes.aegisSheetDb) {
      aegisSheetDb = changes.aegisSheetDb.newValue || null;
      superiorsCache.clear();
      if (clearLegacyDefaultChaseFilters()) {
        chrome.storage.local.set({ aegisChaseList: chaseList });
      }
      evaluationLocaleRefreshNeeded = true;
      forceEvaluationLocaleRefresh = true;
      changed = true;
    }
    if (changes.perkRegistry) {
      updatePerkNameToIcon(changes.perkRegistry.newValue || {});
      updatePerkNameToHash(changes.perkRegistry.newValue || {});
      // NOTE: do NOT set changed=true here. The perk registry updates
      // constantly while scanning, and reprocessing all elements on every
      // registry write creates an expensive rescore feedback loop.
      // Registry changes only affect perk names/icons, not grades.
    }
    if (changes.aegisCompletedWeapons) {
      completedWeapons = changes.aegisCompletedWeapons.newValue || {};
      renderResults();
    }
    if (changes.aegisChaseList) {
      chaseList = changes.aegisChaseList.newValue || {};
      renderResults();
    }
    if (changed) {
      reprocessAllElements();
    }
    if (evaluationLocaleRefreshNeeded) {
      void refreshEvaluationLocale(forceEvaluationLocaleRefresh).then(() => renderResults());
    }
  }
});


// Track page scrolling so we can suppress tooltip builds while tiles are
// flying past under the cursor. Building the full tooltip (DOMParser HTML
// parse + forced layout for positioning) on every tile that passes under the
// mouse during a scroll is a major source of scroll jank, especially in Firefox.
let lastScrollTime = 0;
let scrollClassTimer: ReturnType<typeof setTimeout> | null = null;
document.addEventListener(
  'scroll',
  () => {
    lastScrollTime = Date.now();
    // Winnower's virtualized rows can unmount mid-scroll without firing
    // mouseleave, which would leave the tooltip dangling.
    if (IS_WINNOWER_HOST) {
      if (tooltipShowTimer) {
        clearTimeout(tooltipShowTimer);
        tooltipShowTimer = null;
      }
      unpinTooltip();
      hideTooltip();
    }
    // Flag the document as "scrolling" so CSS can suppress hover transforms
    // on tiles passing under the cursor (each scale triggers a tile repaint)
    if (document.body && !document.body.classList.contains('aegis-scrolling')) {
      document.body.classList.add('aegis-scrolling');
    }
    if (scrollClassTimer) clearTimeout(scrollClassTimer);
    scrollClassTimer = setTimeout(() => {
      scrollClassTimer = null;
      document.body?.classList.remove('aegis-scrolling');
    }, 150);
  },
  { capture: true, passive: true }
);

let tooltipShowTimer: ReturnType<typeof setTimeout> | null = null;
const TOOLTIP_HOVER_DELAY_MS = 100;
const TOOLTIP_SCROLL_SUPPRESS_MS = 150;

/**
 * Build and show the tooltip for an annotated element, positioned at `anchor`.
 * Returns false when the element has no displayable grade.
 */
function showTooltipForElement(dataEl: HTMLElement, anchor: HTMLElement): boolean {
  const data = weaponDataMap.get(dataEl);
  if (!data || !data.result || !data.result.grade) return false;

  showTooltip(
    anchor,
    data.result,
    data.name,
    data.perksMap,
    data.activeHashes,
    scoringSource === 'lightgg',
    data.sheetWeapon,
    data.bestAlternative,
    data.isBestInClass,
    data.sheetPerks,
    perkNameToIcon,
    data.sheetArmor,
    data.equippedMasterwork,
    aegisMode as any,
    aegisPerkOrder,
    data.shoppingItem,
    data.shoppingAlt,
    {
      compactPerksMatrix: aegisCompactPerksMatrix,
      inlineHeader: aegisInlineHeader,
      autoMaxHeight: aegisAutoMaxHeight,
      tooltipWidthMode: aegisTooltipWidthMode,
      tooltipWidth: aegisTooltipWidth,
      dualInfo: aegisMode === 'both' ? {
        sheetWeaponPvE: data.sheetWeaponPvE,
        sheetWeaponPvP: data.sheetWeaponPvP,
        sheetPerksPvE: data.sheetPerksPvE,
        sheetPerksPvP: data.sheetPerksPvP,
        pveResult: data.pveResult,
        pvpResult: data.pvpResult,
        bestAlternativePvE: data.bestAlternativePvE,
        bestAlternativePvP: data.bestAlternativePvP,
        isBestInClassPvE: data.isBestInClassPvE,
        isBestInClassPvP: data.isBestInClassPvP,
        shoppingItemPvE: data.shoppingItemPvE,
        shoppingAltPvE: data.shoppingAltPvE,
        shoppingItemPvP: data.shoppingItemPvP,
        shoppingAltPvP: data.shoppingAltPvP,
      } : undefined
    }
  );
  return true;
}

// Pinned tooltip (Winnower): clicking the grade badge or the weapon name
// keeps the tooltip open so it can be moused into and read; click-away,
// Escape, or scroll dismisses. Pinning tracks the ROW so both triggers
// cooperate: the badge toggles, the name cell (re)pins.
let pinnedRow: HTMLElement | null = null;

function pinTooltipFor(trigger: HTMLElement) {
  const dataEl = trigger.closest('[data-aegis-item-hash]') as HTMLElement | null;
  if (!dataEl) return;
  const anchor = (trigger.closest('td') as HTMLElement | null) ?? dataEl;
  if (!showTooltipForElement(dataEl, anchor)) {
    unpinTooltip();
    return;
  }
  // The base tooltip has pointer-events:none (it is a hover ghost on DIM);
  // a pinned tooltip must accept the pointer so it can be read, scrolled,
  // and recognized by the click-away check.
  document.getElementById('aegis-tooltip')?.classList.add('aegis-tooltip-pinned');
  if (!pinnedRow) {
    document.addEventListener('pointerdown', handlePinDismissClick, true);
    document.addEventListener('keydown', handlePinDismissKey, true);
  }
  pinnedRow = dataEl;
}

function unpinTooltip() {
  if (!pinnedRow) return;
  pinnedRow = null;
  document.getElementById('aegis-tooltip')?.classList.remove('aegis-tooltip-pinned');
  document.removeEventListener('pointerdown', handlePinDismissClick, true);
  document.removeEventListener('keydown', handlePinDismissKey, true);
  hideTooltip();
}

function handlePinDismissClick(e: Event) {
  const target = e.target as HTMLElement;
  // Clicks on the tooltip, a badge, or a graded name cell are pin
  // interactions owned by their own listeners, never dismissal.
  if (target.closest('#aegis-tooltip, .aegis-badge, [data-aegis-listeners]')) return;
  unpinTooltip();
}

// Capture-phase so it fires despite Winnower's name-cell click handler
// (which stops propagation to do its copy-item-id action; both actions run).
function handleCellPinClick(e: Event) {
  if ((e.target as HTMLElement).closest('.aegis-badge')) return;
  pinTooltipFor(e.currentTarget as HTMLElement);
}

// Winnower rows can unmount without mouseleave for reasons other than
// scrolling (filter input, mode toggles), stranding a visible tooltip.
// Checked once per frame when nodes are removed while a tooltip is live.
let anchorCheckScheduled = false;

function scheduleTooltipAnchorCheck() {
  if (anchorCheckScheduled) return;
  anchorCheckScheduled = true;
  requestAnimationFrame(() => {
    anchorCheckScheduled = false;
    if (pinnedRow && !pinnedRow.isConnected) {
      unpinTooltip();
    }
    if (hoveredElement && !hoveredElement.isConnected) {
      if (tooltipShowTimer) {
        clearTimeout(tooltipShowTimer);
        tooltipShowTimer = null;
      }
      hoveredElement = null;
      if (!pinnedRow) hideTooltip();
    }
  });
}

function handlePinDismissKey(e: KeyboardEvent) {
  if (e.key === 'Escape') unpinTooltip();
}

function handleMouseEnter(e: MouseEvent) {
  if (!aegisHoverEnabled) return;
  if (pinnedRow) return;

  const el = e.currentTarget as HTMLElement;
  // On Winnower listeners live on the name cell; the _aegis* data lives on the
  // annotated row. `el` stays the positioning anchor.
  const dataEl = el.hasAttribute('data-aegis-item-hash')
    ? el
    : ((el.closest('[data-aegis-item-hash]') as HTMLElement | null) ?? el);
  hoveredElement = el;

  // Ignore hover hits that happen mid-scroll (tile just passed under cursor)
  if (Date.now() - lastScrollTime < TOOLTIP_SCROLL_SUPPRESS_MS) return;

  setupRegistryObserver();

  // Hover intent: only build the tooltip if the pointer actually settles
  if (tooltipShowTimer) {
    clearTimeout(tooltipShowTimer);
    tooltipShowTimer = null;
  }
  tooltipShowTimer = setTimeout(() => {
    tooltipShowTimer = null;
    if (hoveredElement !== el) return;
    showTooltipForElement(dataEl, el);
  }, TOOLTIP_HOVER_DELAY_MS);
}

/**
 * Handles hiding the tooltip when the mouse leaves a weapon tile.
 */
function handleMouseLeave() {
  if (tooltipShowTimer) {
    clearTimeout(tooltipShowTimer);
    tooltipShowTimer = null;
  }
  hoveredElement = null;
  if (pinnedRow) return;
  hideTooltip();
}

/**
 * Extracts the primary grade letter from a display grade string (handles single tier, 2-tier, and exotics).
 */
export function getGradeLetterFromDisplay(gradeStr: string): string {
  if (!gradeStr || gradeStr === '—') return 'none';
  if (gradeStr.includes('➔')) {
    const parts = gradeStr.split('➔');
    const potPart = parts[1] || parts[0];
    const clean = potPart.replace(/[^a-z]/gi, '');
    if (!clean) return 'none';
    return (clean.length >= 2 ? clean.charAt(1) : clean.charAt(0)).toLowerCase();
  }
  const clean = gradeStr.replace(/[^a-z]/gi, '');
  if (!clean) return 'none';
  if (clean.length >= 2) {
    return clean.charAt(1).toLowerCase();
  }
  return clean.charAt(0).toLowerCase();
}

/**
 * Injects a detailed grade summary block into the DIM item popup header.
 */
function injectPopupSummary(
  popupContainer: HTMLElement,
  result: ScoringResult,
  scoringSource: string,
  sheetWeapon?: AegisSheetWeapon,
  sheetPerks?: SheetPerksGroup,
  sheetArmor?: AegisArmorSet | null,
  equippedMasterwork?: string,
  dualInfo?: DualSheetInfo
) {
  const titleEl = (popupContainer.querySelector('h1, h2, [class*="title" i], [class*="header" i], [class*="name" i]')
    || popupContainer.parentElement?.querySelector('h1, h2, [class*="title" i], [class*="header" i], [class*="name" i]')
    || popupContainer.firstElementChild) as HTMLElement | null;

  if (titleEl && !titleEl.hasAttribute('data-aegis-title-listener')) {
    titleEl.setAttribute('data-aegis-title-listener', 'true');
    titleEl.addEventListener('click', () => {
      hideTooltip();
      document.querySelectorAll('.aegis-side-panel').forEach((el) => el.remove());
      document.querySelectorAll('.aegis-popup-details-card').forEach((el) => el.remove());
    });
  }

  // Cancel any pending details card injection timeouts
  if (activeDetailsTimeout) {
    clearTimeout(activeDetailsTimeout);
    activeDetailsTimeout = null;
  }

  // Clean up any previously injected details card
  popupContainer.querySelectorAll('[data-aegis-details="true"]').forEach((el) => el.remove());

  popupContainer.querySelectorAll('.aegis-title-badge').forEach((el) => el.remove());

  let summaryEl = popupContainer.querySelector('.aegis-popup-summary') as HTMLDivElement | null;
  if (!result.grade || aegisPopupSummaryMode === 'hidden' || aegisPopupSummaryMode === 'badge') {
    if (summaryEl) {
      summaryEl.remove();
      summaryEl = null;
    }
    if (!result.grade) return;
  }

  if (aegisPopupSummaryMode === 'full' && titleEl) {
    if (!summaryEl) {
      summaryEl = document.createElement('div');
      summaryEl.className = 'aegis-popup-summary';
      titleEl.insertAdjacentElement('afterend', summaryEl);
    }
  }

  if (sheetArmor) {
    const val2 = getGradeValue(sheetArmor.piece2Rating);
    const val4 = getGradeValue(sheetArmor.piece4Rating);
    const betterRating = val2 >= val4 ? sheetArmor.piece2Rating : sheetArmor.piece4Rating;
    let baseGradeLetter = betterRating.toLowerCase().trim();
    if (baseGradeLetter.endsWith('+') || baseGradeLetter.endsWith('-')) {
      baseGradeLetter = baseGradeLetter.slice(0, -1);
    }
    const gradeClass = `aegis-badge-${baseGradeLetter}`;
    const wideClass = 'aegis-popup-grade-badge-wide';

    if (aegisPopupSummaryMode === 'badge') {
      if (titleEl) {
        const titleBadge = document.createElement('span');
        titleBadge.className = `aegis-title-badge ${gradeClass}`;
        titleBadge.textContent = result.grade;
        titleEl.appendChild(titleBadge);
      }
    } else if (summaryEl) {
      safeSetInnerHTML(
        summaryEl,
        `
        <div class="aegis-popup-summary-content">
          <div class="aegis-popup-row">
            <span class="aegis-popup-grade-badge ${gradeClass} ${wideClass}">${result.grade}</span>
            <span class="aegis-popup-label">Armor Set Bonus Ratings</span>
          </div>
        </div>
      `
      );
    }

    // Inject armor detail card as a side panel next to DIM details modal
    const insertArmorCard = () => {
      if (!popupContainer.isConnected) return;
      if (popupContainer.querySelector('[data-aegis-details="true"]')) return;

      const insertTarget = popupContainer.querySelector(
        '[class*="sockets" i], [class*="Sockets" i], [class*="item-details" i], [class*="ItemDetails" i], [class*="main-content" i], [class*="body" i], [class*="content" i]'
      ) || summaryEl || titleEl;

      if (insertTarget) {
        const detailsCard = document.createElement('div');
        detailsCard.className = 'aegis-popup-details-card';
        detailsCard.setAttribute('data-aegis-details', 'true');

        const stopDismiss = (e: Event) => {
          e.stopPropagation();
        };
        detailsCard.addEventListener('pointerdown', stopDismiss);
        detailsCard.addEventListener('mousedown', stopDismiss);
        detailsCard.addEventListener('mouseup', stopDismiss);
        detailsCard.addEventListener('click', stopDismiss);
        detailsCard.addEventListener('touchstart', stopDismiss);
        detailsCard.addEventListener('touchend', stopDismiss);

        safeSetInnerHTML(
          detailsCard,
          `
          <div class="aegis-details-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span>${t('lowcoArmorBonus')}</span>
            ${sheetArmor.source ? `<span class="aegis-details-source-badge" style="font-size: 10px; font-weight: 500; color: #ffd700; background: rgba(255, 215, 0, 0.08); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.2); font-family: sans-serif; letter-spacing: 0.1px;">${t('source')}: ${sheetArmor.source}</span>` : ''}
          </div>
          
          <div class="aegis-details-body" style="margin-bottom: 0;">
            <div style="background: rgba(0, 0, 0, 0.25); border-left: 3px solid #1abc9c; border-radius: 0 6px 6px 0; padding: 7px 10px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 11px; font-weight: 700; color: #fff;">2-Piece Bonus: <strong style="color: #1abc9c;">${sheetArmor.piece2Name}</strong></span>
                <span class="aegis-popup-grade-badge aegis-badge-${sheetArmor.piece2Rating.toLowerCase().replace(/[^a-z0-9]/g, '')}" style="font-size: 10px; padding: 2px 6px; border-radius: 4px;">${sheetArmor.piece2Rating}</span>
              </div>
              <div style="font-size: 11px; line-height: 1.5; color: #d8dee9;">${formatFormattedNotes(sheetArmor.piece2Desc)}</div>
              ${sheetArmor.piece2Numbers ? `
                <div style="margin-top: 5px; font-size: 10.5px; color: #88c0d0; background: rgba(136, 192, 208, 0.08); padding: 5px 8px; border-radius: 4px; line-height: 1.45; border: 1px solid rgba(136, 192, 208, 0.15);">
                  <strong style="color: #88c0d0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px; display: block; margin-bottom: 2px;">In-Depth Stats:</strong>
                  ${formatFormattedNotes(sheetArmor.piece2Numbers)}
                </div>
              ` : ''}
            </div>

            <div style="background: rgba(0, 0, 0, 0.25); border-left: 3px solid #b48ead; border-radius: 0 6px 6px 0; padding: 7px 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 11px; font-weight: 700; color: #fff;">4-Piece Bonus: <strong style="color: #b48ead;">${sheetArmor.piece4Name}</strong></span>
                <span class="aegis-popup-grade-badge aegis-badge-${sheetArmor.piece4Rating.toLowerCase().replace(/[^a-z0-9]/g, '')}" style="font-size: 10px; padding: 2px 6px; border-radius: 4px;">${sheetArmor.piece4Rating}</span>
              </div>
              <div style="font-size: 11px; line-height: 1.5; color: #d8dee9;">${formatFormattedNotes(sheetArmor.piece4Desc)}</div>
              ${sheetArmor.piece4Numbers ? `
                <div style="margin-top: 5px; font-size: 10.5px; color: #88c0d0; background: rgba(136, 192, 208, 0.08); padding: 5px 8px; border-radius: 4px; line-height: 1.45; border: 1px solid rgba(136, 192, 208, 0.15);">
                  <strong style="color: #88c0d0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px; display: block; margin-bottom: 2px;">In-Depth Stats:</strong>
                  ${formatFormattedNotes(sheetArmor.piece4Numbers)}
                </div>
              ` : ''}
            </div>
          </div>

          <div class="aegis-popup-meta-divider" style="margin-top: 10px;"></div>

          <div class="aegis-popup-meta-content">
            <div class="aegis-popup-row" style="gap: 8px;">
              <span class="aegis-popup-meta-badge aegis-tier-source" style="background: linear-gradient(135deg, #1abc9c, #16a085) !important;">${sheetArmor.sourceType}</span>
              <span class="aegis-popup-meta-rank" style="color: #ccc;">Source: ${sheetArmor.source}</span>
            </div>
          </div>
        `
        );

        const attachArmorCard = () => {
          if (!popupContainer.isConnected) return;
          const isSheet = popupContainer.matches('[class*="Sheet"], [class*="sheet"]');
          const rect = popupContainer.getBoundingClientRect();
          const spaceLeft = rect.left;
          const spaceRight = window.innerWidth - rect.right;

          const panelWidth = (aegisTooltipWidthMode === 'fixed' && aegisTooltipWidth) ? aegisTooltipWidth : 320;
          const panelMargin = panelWidth + 12;
          const requiredSpace = panelWidth + 10;
          const availableHeight = Math.max(200, window.innerHeight - rect.top - 16);

          if (aegisLayoutSide === 'side' && window.innerWidth >= 1000 && (isSheet || spaceLeft >= requiredSpace || spaceRight >= requiredSpace)) {
            detailsCard.classList.add('aegis-side-panel');
            popupContainer.appendChild(detailsCard);

            detailsCard.style.setProperty('position', 'absolute', 'important');
            detailsCard.style.setProperty('top', '0px', 'important');
            detailsCard.style.setProperty('width', `${panelWidth}px`, 'important');
            detailsCard.style.setProperty('max-height', `${availableHeight}px`, 'important');
            detailsCard.style.setProperty('overflow-y', 'auto', 'important');
            detailsCard.style.setProperty('overflow-x', 'hidden', 'important');
            detailsCard.style.setProperty('z-index', '1000', 'important');
            detailsCard.style.setProperty('pointer-events', 'auto', 'important');
            detailsCard.style.setProperty('user-select', 'text', 'important');

            if (isSheet || (spaceLeft >= spaceRight && spaceLeft >= requiredSpace)) {
              detailsCard.style.setProperty('left', `-${panelMargin}px`, 'important');
              detailsCard.style.setProperty('right', 'auto', 'important');
            } else if (spaceRight >= requiredSpace) {
              detailsCard.style.setProperty('left', 'auto', 'important');
              detailsCard.style.setProperty('right', `-${panelMargin}px`, 'important');
            } else {
              detailsCard.classList.remove('aegis-side-panel');
              detailsCard.style.removeProperty('position');
              detailsCard.style.removeProperty('top');
              detailsCard.style.removeProperty('left');
              detailsCard.style.removeProperty('right');
              detailsCard.style.removeProperty('max-height');
              detailsCard.style.removeProperty('overflow-y');
              detailsCard.style.removeProperty('overflow-x');
              insertTarget.after(detailsCard);
            }
          } else {
            detailsCard.classList.remove('aegis-side-panel');
            detailsCard.style.removeProperty('position');
            detailsCard.style.removeProperty('top');
            detailsCard.style.removeProperty('left');
            detailsCard.style.removeProperty('right');
            detailsCard.style.removeProperty('max-height');
            detailsCard.style.removeProperty('overflow-y');
            detailsCard.style.removeProperty('overflow-x');
            insertTarget.after(detailsCard);
          }
        };

        attachArmorCard();
        setTimeout(attachArmorCard, 100);
        setTimeout(attachArmorCard, 250);
      }
    };

    insertArmorCard();
    setTimeout(insertArmorCard, 100);
    setTimeout(insertArmorCard, 250);
    return;
  }

  const isLightGG = scoringSource === 'lightgg';

  let notesHtml = '';
  let showNotes = result.notes;
  if (sheetWeapon && showNotes === sheetWeapon.notes) {
    showNotes = '';
  }
  if (result.wishlistNotes) {
    showNotes = result.wishlistNotes;
  }

  if (showNotes) {
    const titleLabel = isLightGG && !result.wishlistNotes ? 'Information' : 'Wishlist Notes';
    notesHtml = `<div class="aegis-popup-notes-text"><strong>${titleLabel}:</strong> ${showNotes}</div>`;
  }

  let upgradeAdviceHtml = '';
  if (result.upgradeAdvice) {
    upgradeAdviceHtml = `
      <div class="aegis-popup-upgrade-banner">
        ${result.upgradeAdvice}
      </div>
    `;
  }

  const gradeStr = result.grade || '';
  const isSplit = gradeStr.includes('|');
  const baseGradeLetter = result.grade.charAt(0).toLowerCase();
  const gradeClass = `aegis-grade-${baseGradeLetter}`;

  if (aegisPopupSummaryMode === 'badge') {
    const titleBadge = document.createElement('span');
    titleBadge.className = 'aegis-title-badge';
    if (dualInfo && isSplit) {
      const [pveStr, pvpStr] = gradeStr.split('|').map(s => s.trim());
      const pveLetter = getGradeLetterFromDisplay(pveStr);
      const pvpLetter = getGradeLetterFromDisplay(pvpStr);
      titleBadge.classList.add('aegis-badge-split');
      safeSetInnerHTML(
        titleBadge,
        `<span class="aegis-split-half aegis-split-left aegis-badge-${pveLetter}">${pveStr}</span><span class="aegis-split-half aegis-split-right aegis-badge-${pvpLetter}">${pvpStr}</span>`
      );
    } else {
      const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
      const popupBaseGradeLetter = isTwoTier 
        ? gradeStr.substring(1).charAt(0).toLowerCase() 
        : baseGradeLetter;
      titleBadge.classList.add(`aegis-badge-${popupBaseGradeLetter}`);
      titleBadge.textContent = result.grade;
    }
    if (titleEl) {
      titleEl.appendChild(titleBadge);
    }
  } else if (summaryEl) {
    if (dualInfo && isSplit) {
      const [pveStr, pvpStr] = gradeStr.split('|').map(s => s.trim());
      const pveLetter = getGradeLetterFromDisplay(pveStr);
      const pvpLetter = getGradeLetterFromDisplay(pvpStr);
      const splitBadgeHtml = `<span class="aegis-popup-grade-badge aegis-badge-split"><span class="aegis-split-half aegis-split-left aegis-badge-${pveLetter}">${pveStr}</span><span class="aegis-split-half aegis-split-right aegis-badge-${pvpLetter}">${pvpStr}</span></span>`;

      safeSetInnerHTML(
        summaryEl,
        `
        <div class="aegis-popup-summary-content">
          <div class="aegis-popup-row" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${splitBadgeHtml}
              <span class="aegis-popup-label">${t('modeBoth')}</span>
            </div>
          </div>
          ${upgradeAdviceHtml}
          ${notesHtml}
        </div>
      `
      );
    } else {
      const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
      const popupBaseGradeLetter = isTwoTier 
        ? gradeStr.substring(1).charAt(0).toLowerCase() 
        : baseGradeLetter;
      const wideClass = isTwoTier ? 'aegis-popup-grade-badge-wide' : '';

      const matchLabel = isLightGG
        ? 'Light.gg Roll Appraisal'
        : `Wishlist Match: <strong class="${gradeClass}">${result.matchPercentage}%</strong>`;

      let sheetMetaHtml = '';
      if (sheetWeapon) {
        const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
        const tierClass = `aegis-tier-${tierLetter}`;
        const rankLabel = sheetWeapon.rank ? `Rank #${sheetWeapon.rank} in Category` : '';

        sheetMetaHtml = `
          <div class="aegis-popup-meta-divider"></div>
          <div class="aegis-popup-meta-content">
            <div class="aegis-popup-row">
              <span class="aegis-popup-meta-badge ${tierClass}">${t('weaponTier', { tier: sheetWeapon.tier })}</span>
              ${rankLabel ? `<span class="aegis-popup-meta-rank">${t('rankInCategory', { rank: sheetWeapon.rank })}</span>` : ''}
            </div>
            ${sheetWeapon.notes ? `<div class="aegis-popup-notes-text aegis-meta-notes"><strong>${t('aegisMeta')}:</strong> ${sheetWeapon.notes}</div>` : ''}
          </div>
        `;
      }

      safeSetInnerHTML(
        summaryEl,
        `
        <div class="aegis-popup-summary-content">
          <div class="aegis-popup-row">
            <span class="aegis-popup-grade-badge aegis-badge-${popupBaseGradeLetter} ${wideClass}">${result.grade}</span>
            <span class="aegis-popup-label">${matchLabel}</span>
          </div>
          ${upgradeAdviceHtml}
          ${notesHtml}
        </div>
        ${sheetMetaHtml}
      `
      );
    }
  }

  // Helper function to render a weapon details section (perks, MW, superiors, analysis)
  const renderWeaponDetailsContent = (sheetW: AegisSheetWeapon, sPerks?: SheetPerksGroup, mode?: 'pve' | 'pvp') => {
    const db = mode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE;
    const categoryTab = findWeaponCategory(sheetW.name, undefined, db);
    const superiors = findSuperiors(categoryTab, sheetW.energy, sheetW.frame, db);

    const renderCategoryRow = (item: { label: string; type: 'barrel' | 'mag' | 'perk1' | 'perk2' | 'origin'; rawVal?: string }) => {
      if (!item.rawVal) return '';
      let chipsHtml = '';
      if (sPerks) {
        let perksToRender: TooltipPerk[] = [];
        if (aegisPerkOrder === 'owned' || !sPerks.all) {
          const matched = sPerks.matched.filter(p => p.type === item.type);
          const missing = sPerks.missing.filter(p => p.type === item.type);
          perksToRender = [...matched, ...missing];
        } else {
          perksToRender = sPerks.all.filter(p => p.type === item.type);
        }

        for (const perk of perksToRender) {
          const isMissing = perk.status === 'missing' || !perk.matched;
          const statusClass = isMissing ? 'aegis-chip-missing' : (perk.status === 'active' ? 'aegis-chip-active' : 'aegis-chip-selectable');
          const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : '';
          const statusLabel = isMissing ? ` (${t('missing')})` : (perk.status === 'active' ? '' : ` (${t('selectable')})`);
          chipsHtml += `
            <span class="aegis-perk-chip ${statusClass}" title="${perk.name}${statusLabel}">
              ${iconHtml}
              <span class="aegis-chip-name">${perk.name}</span>
            </span>
          `;
        }
      }

      if (!chipsHtml) {
        const rawVal = item.rawVal;
        const cleanVal = rawVal.split(/[\/\n]/).map(s => s.trim()).filter(Boolean).join(' / ');
        if (!cleanVal) return '';
        chipsHtml = `<span class="aegis-details-value-text">${cleanVal}</span>`;
      }

      return `
        <div class="aegis-details-row aegis-perk-row">
          <span class="aegis-details-label">${item.label}</span>
          <div class="aegis-details-value aegis-details-chips-container">
            ${chipsHtml}
          </div>
        </div>
      `;
    };

    let perksRowsHtml = '';
    if (aegisCompactPerksMatrix) {
      const leftRows = [
        renderCategoryRow({ label: t('barrel'), type: 'barrel', rawVal: sheetW.barrel }),
        renderCategoryRow({ label: t('magazine'), type: 'mag', rawVal: sheetW.mag })
      ].filter(Boolean).join('');

      const rightRows = [
        renderCategoryRow({ label: t('perk1'), type: 'perk1', rawVal: sheetW.perk1 }),
        renderCategoryRow({ label: t('perk2'), type: 'perk2', rawVal: sheetW.perk2 }),
        renderCategoryRow({ label: t('origin'), type: 'origin', rawVal: sheetW.origin })
      ].filter(Boolean).join('');

      if (leftRows || rightRows) {
        perksRowsHtml = `
          <div class="aegis-perks-matrix-2col">
            <div class="aegis-perks-matrix-col col-left">${leftRows}</div>
            <div class="aegis-perks-matrix-col col-right">${rightRows}</div>
          </div>
        `;
      }
    } else {
      perksRowsHtml = [
        renderCategoryRow({ label: t('barrel'), type: 'barrel', rawVal: sheetW.barrel }),
        renderCategoryRow({ label: t('magazine'), type: 'mag', rawVal: sheetW.mag }),
        renderCategoryRow({ label: t('perk1'), type: 'perk1', rawVal: sheetW.perk1 }),
        renderCategoryRow({ label: t('perk2'), type: 'perk2', rawVal: sheetW.perk2 }),
        renderCategoryRow({ label: t('origin'), type: 'origin', rawVal: sheetW.origin })
      ].filter(Boolean).join('');
    }

    // Extract recommended Masterworks
    const recMWs: string[] = [];
    let rawMW = sheetW.mw ? sheetW.mw.trim() : null;
    if (rawMW && rawMW !== '-') {
      const parts = rawMW.split(/[\/\n\\]/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) recMWs.push(trimmed);
      }
    }
    if (recMWs.length === 0) {
      const notesText = getOriginalEvaluationText(sheetW, 'notes')
        + ' '
        + getOriginalEvaluationText(sheetW, 'description');
      const foundMW = extractRecommendedMasterwork(notesText);
      if (foundMW) {
        const parts = foundMW.split(/[\/\n\\]/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed) recMWs.push(trimmed);
        }
      }
    }

    let mwHtml = '';
    if (recMWs.length > 0) {
      let mwChipsHtml = '';
      const eqMW = (equippedMasterwork || '').toLowerCase();

      for (const mw of recMWs) {
        const mwLower = mw.toLowerCase();
        const isMatch = eqMW && (
          mwLower === eqMW ||
          eqMW.startsWith(mwLower) ||
          mwLower.startsWith(eqMW)
        );

        let chipStyle = [
          'border-radius: 4px !important',
          'font-size: 10px !important',
          'font-weight: 800 !important',
          'padding: 3px 7px !important',
          'display: inline-flex !important',
          'align-items: center !important',
          'gap: 4px !important',
          'transition: all 0.2s ease !important',
        ];

        let icon = '☆';
        let title = t('aegisRecommendsMw', { mw });

        if (isMatch) {
          chipStyle.push(
            'background: linear-gradient(135deg, rgba(255, 215, 0, 0.35), rgba(255, 140, 0, 0.25)) !important',
            'border: 1.5px solid #ffd700 !important',
            'color: #ffffff !important',
            'text-shadow: 0 0 6px rgba(255, 215, 0, 0.8) !important',
            'box-shadow: 0 0 10px rgba(255, 191, 0, 0.65), inset 0 0 4px rgba(255, 255, 255, 0.2) !important'
          );
          icon = '✓';
          title = t('mwEquipped');
        } else {
          chipStyle.push(
            'background: rgba(255, 191, 0, 0.05) !important',
            'border: 1px dashed rgba(255, 191, 0, 0.4) !important',
            'color: rgba(235, 203, 139, 0.65) !important',
            'box-shadow: none !important'
          );
        }

        mwChipsHtml += `
          <span class="aegis-perk-chip" style="${chipStyle.join('; ')}" title="${title}">
            <span style="font-size: 11px !important; line-height: 1 !important; ${isMatch ? 'color: #ffe57f !important;' : ''}">${icon}</span>
            ${mw}
          </span>
        `;
      }

      mwHtml = `
        <div class="aegis-details-row aegis-perk-row">
          <span class="aegis-details-label">MW</span>
          <div class="aegis-details-value aegis-details-chips-container" style="display: flex !important; flex-wrap: wrap !important; gap: 4px !important;">
            ${mwChipsHtml}
          </div>
        </div>
      `;
    }

    // Check if superiors exist and format them
    let superiorsHtml = '';
    if (superiors.byEnergy || superiors.byFrame || superiors.byBoth) {
      const uniqueSups = new Map<string, { weapon: any; labels: string[] }>();
      const addUniqueSup = (label: string, supW: any) => {
        if (!supW) return;
        const key = supW.name.toLowerCase();
        if (uniqueSups.has(key)) {
          uniqueSups.get(key)!.labels.push(label);
        } else {
          uniqueSups.set(key, { weapon: supW, labels: [label] });
        }
      };

      if (sheetW.energy) addUniqueSup(sheetW.energy, superiors.byEnergy);
      if (sheetW.frame) addUniqueSup(sheetW.frame, superiors.byFrame);
      if (sheetW.energy && sheetW.frame) {
        addUniqueSup(`${sheetW.energy} ${sheetW.frame}`, superiors.byBoth);
      }

      let supRowsHtml = '';
      for (const item of uniqueSups.values()) {
        const isSelf = item.weapon.name.toLowerCase() === sheetW.name.toLowerCase();
        const selfClass = isSelf ? 'aegis-sup-self' : '';
        const labelsStr = item.labels.join(' / ');
        const localizedLabelsStr = getLocalizedArchetypeLabel(labelsStr);
        const localizedWeaponName = getLocalizedWeaponName(item.weapon.name);
        
        const tierLetter = item.weapon.tier ? item.weapon.tier.charAt(0).toLowerCase() : '';
        const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${item.weapon.tier}</span>`;
        const rankHtml = item.weapon.rank ? `<span class="aegis-sup-rank-num">#${item.weapon.rank}</span>` : '';
        const currentLabel = isSelf ? `<span class="aegis-current-badge">(${t('currentBadge')})</span>` : '';

        supRowsHtml += `
          <div class="aegis-details-row aegis-sup-row ${isSelf ? 'aegis-sup-row-self' : ''}">
            <span class="aegis-details-label aegis-sup-type-label" title="${localizedLabelsStr}">${localizedLabelsStr}</span>
            <span class="aegis-sup-name ${selfClass}">${localizedWeaponName}${currentLabel}</span>
            <div class="aegis-sup-rank-group">
              ${tierBadgeHtml}
              ${rankHtml}
            </div>
          </div>
        `;
      }

      const currentWeaponKey = sheetW.name.toLowerCase();
      if (!uniqueSups.has(currentWeaponKey)) {
        const tierLetter = sheetW.tier ? sheetW.tier.charAt(0).toLowerCase() : '';
        const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${sheetW.tier}</span>`;
        const rankHtml = sheetW.rank ? `<span class="aegis-sup-rank-num">#${sheetW.rank}</span>` : '';
        const localizedWeaponName = getLocalizedWeaponName(sheetW.name);

        supRowsHtml += `
          <div class="aegis-details-row aegis-sup-row aegis-sup-row-self">
            <span class="aegis-details-label aegis-sup-type-label" title="${t('currentWeapon')}">${t('currentWeapon')}</span>
            <span class="aegis-sup-name aegis-sup-self">${localizedWeaponName}<span class="aegis-current-badge">(${t('currentBadge')})</span></span>
            <div class="aegis-sup-rank-group">
              ${tierBadgeHtml}
              ${rankHtml}
            </div>
          </div>
        `;
      }

      if (supRowsHtml) {
        superiorsHtml = `
          <div class="aegis-details-divider"></div>
          <div class="aegis-details-header" style="margin-top: 8px;">${t('bestInCategory', { category: getLocalizedCategory(categoryTab) || t('category') })}</div>
          <div class="aegis-details-body">
            ${supRowsHtml}
          </div>
        `;
      }
    }

    let exoticViabilityHtml = '';
    if (sheetW.exoticViability || sheetW.notes || sheetW.description) {
      const matrixHtml = sheetW.exoticViability ? renderViabilityMatrix(sheetW.exoticViability, mode === 'pvp' ? 'pvp' : 'pve') : '';
      const tagsBadge = sheetW.exoticViability?.tags 
        ? `<span style="font-size: 10px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.2);">${sheetW.exoticViability.tags.toUpperCase()}</span>` 
        : '';
      const tierBadgeLetter = sheetW.tier ? sheetW.tier.charAt(0).toLowerCase() : '';
      const showTierInside = !hasDualData && sheetW.tier;
      const tierBadgeHtml = showTierInside 
        ? `<span class="aegis-mini-tier-badge aegis-badge-${tierBadgeLetter}" style="font-size: 11px; padding: 2px 8px; font-weight: 800;">${sheetW.tier} Tier</span>` 
        : '';

      let analysisBlock = '';
      if (sheetW.notes) {
        analysisBlock = `
          <div style="margin-top: 6px; background: rgba(0, 0, 0, 0.25); border-left: 3px solid #ebcb8b; border-radius: 0 6px 6px 0; padding: 6px 9px;">
            <div style="font-size: 9.5px; font-weight: 700; color: #ebcb8b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;">${t('strategicAnalysis')}</div>
            <div style="font-size: 11px; line-height: 1.55; color: #d8dee9;">${formatFormattedNotes(sheetW.notes)}</div>
          </div>
        `;
      }

      let mechanicsBlock = '';
      if (sheetW.description) {
        mechanicsBlock = `
          <div style="margin-top: 6px; background: rgba(0, 0, 0, 0.25); border-left: 3px solid #88c0d0; border-radius: 0 6px 6px 0; padding: 6px 9px;">
            <div style="font-size: 9.5px; font-weight: 700; color: #88c0d0; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;">${t('exoticMechanics')}</div>
            <div style="font-size: 11px; line-height: 1.55; color: #d8dee9;">${formatFormattedNotes(sheetW.description)}</div>
          </div>
        `;
      }

      const topRow = (tierBadgeHtml || tagsBadge) ? `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
          ${tierBadgeHtml}
          ${tagsBadge}
        </div>
      ` : '';

      exoticViabilityHtml = `
        ${topRow}
        ${matrixHtml}
        ${analysisBlock}
        ${mechanicsBlock}
      `;
    }

    return `
      <div class="aegis-details-body aegis-perks-body" style="margin-bottom: ${superiorsHtml ? '8px' : '0'};">
        ${exoticViabilityHtml}
        ${perksRowsHtml}
        ${mwHtml}
      </div>
      ${superiorsHtml}
    `;
  };

  // If we have sheet data, inject detailed overview card
  const hasDualData = dualInfo && (dualInfo.sheetWeaponPvE || dualInfo.sheetWeaponPvP);
  const hasSingleData = sheetWeapon;

  if (hasDualData || hasSingleData) {
    const perksBtn = popupContainer.querySelector('button[title*="perks" i], button[title*="Perks" i]');
    const perksSection = perksBtn?.parentElement;
    const sockets = popupContainer.querySelector('[class*="sockets" i], [class*="Sockets" i], [class*="item-sockets" i], [class*="ItemSockets" i], [class*="ItemDetails" i], [class*="item-details" i], [class*="body" i], [class*="content" i]');
    const insertTarget = perksSection || sockets || summaryEl || popupContainer;

    if (insertTarget) {
      const detailsCard = document.createElement('div');
      detailsCard.className = 'aegis-popup-details-card';
      detailsCard.setAttribute('data-aegis-details', 'true');

      const stopDismiss = (e: Event) => {
        e.stopPropagation();
      };
      detailsCard.addEventListener('pointerdown', stopDismiss);
      detailsCard.addEventListener('mousedown', stopDismiss);
      detailsCard.addEventListener('mouseup', stopDismiss);
      detailsCard.addEventListener('click', stopDismiss);
      detailsCard.addEventListener('touchstart', stopDismiss);
      detailsCard.addEventListener('touchend', stopDismiss);

      if (hasDualData) {
        const { 
          sheetWeaponPvE, 
          sheetWeaponPvP, 
          sheetPerksPvE, 
          sheetPerksPvP, 
          shoppingItemPvE, 
          shoppingAltPvE, 
          shoppingItemPvP, 
          shoppingAltPvP 
        } = dualInfo!;

        const pveBanner = renderShoppingBannerHtml(shoppingItemPvE, shoppingAltPvE, 'Aegis');
        const pvpBanner = renderShoppingBannerHtml(shoppingItemPvP, shoppingAltPvP, 'Finnald');
        
        let pveColHtml = '';
        let pvpColHtml = '';

        if (sheetWeaponPvE) {
          const tierLetter = sheetWeaponPvE.tier ? sheetWeaponPvE.tier.charAt(0).toLowerCase() : '';
          pveColHtml = `
            <div class="aegis-popup-dual-col aegis-col-pve">
              <div class="aegis-popup-col-header">
                <span class="aegis-popup-col-title">${t('modePve')}</span>
                ${sheetWeaponPvE.tier ? `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${sheetWeaponPvE.tier} Tier</span>` : ''}
              </div>
              ${pveBanner}
              ${renderWeaponDetailsContent(sheetWeaponPvE, sheetPerksPvE || undefined, 'pve')}
            </div>
          `;
        }

        if (sheetWeaponPvP) {
          const tierLetter = sheetWeaponPvP.tier ? sheetWeaponPvP.tier.charAt(0).toLowerCase() : '';
          pvpColHtml = `
            <div class="aegis-popup-dual-col aegis-col-pvp">
              <div class="aegis-popup-col-header">
                <span class="aegis-popup-col-title">${t('modePvp')}</span>
                ${sheetWeaponPvP.tier ? `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${sheetWeaponPvP.tier} Tier</span>` : ''}
              </div>
              ${pvpBanner}
              ${renderWeaponDetailsContent(sheetWeaponPvP, sheetPerksPvP || undefined, 'pvp')}
            </div>
          `;
        }

        safeSetInnerHTML(
          detailsCard,
          `
          <div class="aegis-details-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span>${t('modeBoth')} Recommendations</span>
            ${(sheetWeaponPvE?.source || sheetWeaponPvP?.source) ? `<span class="aegis-details-source-badge" style="font-size: 10px; font-weight: 500; color: #ffd700; background: rgba(255, 215, 0, 0.08); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.2); font-family: sans-serif; letter-spacing: 0.1px;">${t('source')}: ${sheetWeaponPvE?.source || sheetWeaponPvP?.source}</span>` : ''}
          </div>
          <div class="aegis-popup-dual-grid">
            ${pveColHtml}
            ${pvpColHtml}
          </div>
        `
        );
      } else if (sheetWeapon) {
        const cardHeaderTitle = sheetWeapon.exoticViability 
          ? (aegisMode === 'pvp' ? t('finnaldExoticAnalysis') : t('aegisExoticAnalysis')) 
          : (aegisMode === 'pvp' ? t('finnaldRecommendedPerks') : t('aegisRecommendedPerks'));

        safeSetInnerHTML(
          detailsCard,
          `
          <div class="aegis-details-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span>${cardHeaderTitle}</span>
            ${sheetWeapon.source ? `<span class="aegis-details-source-badge" style="font-size: 10px; font-weight: 500; color: #ffd700; background: rgba(255, 215, 0, 0.08); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.2); font-family: sans-serif; letter-spacing: 0.1px;">${t('source')}: ${sheetWeapon.source}</span>` : ''}
          </div>
          ${renderWeaponDetailsContent(sheetWeapon, sheetPerks, aegisMode === 'pvp' ? 'pvp' : 'pve')}
        `
        );
      }

      const attachDetailsCard = () => {
        if (!popupContainer.isConnected) return;
        const rect = popupContainer.getBoundingClientRect();
        const spaceLeft = rect.left;
        const spaceRight = window.innerWidth - rect.right;

        const panelWidth = hasDualData ? 560 : ((aegisTooltipWidthMode === 'fixed' && aegisTooltipWidth) ? aegisTooltipWidth : 320);
        const panelMargin = panelWidth + 12;
        const requiredSpace = panelWidth + 10;
        const availableHeight = Math.max(200, window.innerHeight - rect.top - 16);

        if (aegisLayoutSide === 'side' && window.innerWidth >= 1000 && (spaceLeft >= requiredSpace || spaceRight >= requiredSpace)) {
          detailsCard.classList.add('aegis-side-panel');
          popupContainer.appendChild(detailsCard);

          detailsCard.style.setProperty('position', 'absolute', 'important');
          detailsCard.style.setProperty('top', '0px', 'important');
          detailsCard.style.setProperty('width', `${panelWidth}px`, 'important');
          detailsCard.style.setProperty('min-width', `${panelWidth}px`, 'important');
          detailsCard.style.setProperty('max-height', `${availableHeight}px`, 'important');
          detailsCard.style.setProperty('overflow-y', 'auto', 'important');
          detailsCard.style.setProperty('overflow-x', 'hidden', 'important');
          detailsCard.style.setProperty('z-index', '1000', 'important');
          detailsCard.style.setProperty('pointer-events', 'auto', 'important');
          detailsCard.style.setProperty('user-select', 'text', 'important');
          detailsCard.style.setProperty('--aegis-side-panel-width', `${panelWidth}px`);

          if (spaceLeft >= spaceRight && spaceLeft >= requiredSpace) {
            detailsCard.style.setProperty('left', `-${panelMargin}px`, 'important');
            detailsCard.style.setProperty('right', 'auto', 'important');
          } else if (spaceRight >= requiredSpace) {
            detailsCard.style.setProperty('left', 'auto', 'important');
            detailsCard.style.setProperty('right', `-${panelMargin}px`, 'important');
          } else {
            detailsCard.classList.remove('aegis-side-panel');
            detailsCard.style.removeProperty('position');
            detailsCard.style.removeProperty('top');
            detailsCard.style.removeProperty('left');
            detailsCard.style.removeProperty('right');
            detailsCard.style.removeProperty('max-height');
            detailsCard.style.removeProperty('overflow-y');
            detailsCard.style.removeProperty('overflow-x');
            if (insertTarget.parentElement) {
              insertTarget.after(detailsCard);
            } else {
              popupContainer.appendChild(detailsCard);
            }
          }
        } else {
          detailsCard.classList.remove('aegis-side-panel');
          detailsCard.style.removeProperty('position');
          detailsCard.style.removeProperty('top');
          detailsCard.style.removeProperty('left');
          detailsCard.style.removeProperty('right');
          detailsCard.style.removeProperty('max-height');
          detailsCard.style.removeProperty('overflow-y');
          detailsCard.style.removeProperty('overflow-x');
          if (insertTarget.parentElement) {
            insertTarget.after(detailsCard);
          } else {
            popupContainer.appendChild(detailsCard);
          }
        }
      };

      attachDetailsCard();
      activeDetailsTimeout = setTimeout(attachDetailsCard, 150);
    }
  }
}

/**
 * Injects or updates the Aegis rank badge overlay inside a weapon tile.
 */
function injectBadge(el: HTMLElement, result: ScoringResult) {
  // Never inject badges inside popup toolbars, tag controls, or stat rows.
  // DIM-only: on Winnower an ancestor class containing "sheet" would false-positive.
  if (!IS_WINNOWER_HOST &&
      el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup') &&
      !el.matches('[id^="item-"], [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"], [class*="item-tile"], .item-tile, .item')) {
    removeBadge(el);
    return;
  }

  // Deduplicate: Find root item container to ensure EXACTLY 1 badge per item tile in DIM Stable and Beta
  const itemContainer = (el.closest('[data-aegis-item-hash]') as HTMLElement) || el;
  let badgeTarget: HTMLElement | null;

  if (IS_WINNOWER_HOST) {
    // Without a slot there is no badge, and never the absolute-overlay
    // fallback (a <div> child of a React-managed <tr> is invalid table DOM).
    badgeTarget = itemContainer.querySelector<HTMLElement>('[data-aegis-badge-slot]');
    if (!badgeTarget) {
      removeBadge(el);
      return;
    }
  } else {
    badgeTarget = itemContainer.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"]') as HTMLElement | null;
    if (!badgeTarget) {
      badgeTarget = itemContainer;
    }
    // Ensure the badge target is relatively positioned so the absolute badge is anchored to it
    badgeTarget.style.setProperty('position', 'relative', 'important');
  }

  // S-tier gold glow is DIM-only; Winnower styles its chip in its own CSS.
  if (!IS_WINNOWER_HOST) {
    badgeTarget.classList.toggle('aegis-gold-glow', result.grade?.startsWith('S') ?? false);
  }

  // Purge any duplicate badges within itemContainer and reuse the primary badge
  const existingBadges = Array.from(itemContainer.querySelectorAll('.aegis-badge'));
  let badge: HTMLDivElement;

  if (existingBadges.length > 0) {
    badge = existingBadges[0] as HTMLDivElement;
    for (let i = 1; i < existingBadges.length; i++) {
      existingBadges[i].remove();
    }
  } else {
    badge = document.createElement('div');
    badge.className = 'aegis-badge';
    badgeTarget.appendChild(badge);
  }

  // Remove existing grade classes
  badge.className = 'aegis-badge';

  // Set grade class and text (normalizing S+ / A- etc. to the first letter class)
  const gradeStr = result.grade || '';
  const isSplit = gradeStr.includes('|');
  const isDual = !isSplit && gradeStr.includes('➔');
  const isArmor = !isSplit && gradeStr.includes('/');
  const isTwoTier = !isSplit && !isArmor && (gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-')));

  let baseLetter = '';
  if (isSplit) {
    const parts = gradeStr.split('|').map(s => s.trim());
    const valPvE = getGradeValue(parts[0]);
    const valPvP = getGradeValue(parts[1]);
    const betterRating = valPvE >= valPvP ? parts[0] : parts[1];
    baseLetter = betterRating.replace(/[^a-z]/gi, '').charAt(0).toLowerCase() || 'n';
  } else if (isArmor) {
    const parts = gradeStr.split('/');
    const val2 = getGradeValue(parts[0]);
    const val4 = getGradeValue(parts[1]);
    const betterRating = val2 >= val4 ? parts[0] : parts[1];
    baseLetter = betterRating.toLowerCase().trim();
    if (baseLetter.endsWith('+') || baseLetter.endsWith('-')) {
      baseLetter = baseLetter.slice(0, -1);
    }
  } else if (isDual) {
    const parts = gradeStr.split('➔');
    const potPart = parts[1] || parts[0];
    baseLetter = potPart.toLowerCase().trim().charAt(0);
  } else {
    // If it's a 2-tier grade (e.g. BS+ or SF), base color class on the actual roll matching grade (the last letter/symbol part)
    baseLetter = isTwoTier 
      ? gradeStr.substring(1).charAt(0).toLowerCase() 
      : (gradeStr ? gradeStr.charAt(0).toLowerCase() : '');
  }

  badge.classList.add(`aegis-badge-${baseLetter}`);
  
  // Position class
  const posKey = (aegisBadgePosition || 'bottom-left').replace('bottom-left', 'bl').replace('top-left', 'tl').replace('top-right', 'tr').replace('bottom-right', 'br');
  badge.classList.add(`aegis-pos-${posKey}`);

  // Style class
  const styleKey = aegisBadgeStyle || 'classic';
  badge.classList.add(`aegis-style-${styleKey}`);

  // Fade on hover
  if (aegisFadeHover) {
    badge.classList.add('aegis-hover-fade');
  }

  if (!isSplit && (isTwoTier || isArmor || isDual || result.isOmniRoll || result.isPerfect5of5)) {
    badge.classList.add('aegis-badge-wide');
  }
  if (isSplit) {
    badge.classList.add('aegis-badge-split');
    const [pveStr, pvpStr] = gradeStr.split('|').map(s => s.trim());
    const pveLetter = getGradeLetterFromDisplay(pveStr);
    const pvpLetter = getGradeLetterFromDisplay(pvpStr);
    const isPveTrans = pveStr.includes('➔') || pveStr.includes('→');
    const isPvpTrans = pvpStr.includes('➔') || pvpStr.includes('→');
    
    badge.innerHTML = `
      <div class="aegis-split-inner">
        <span class="aegis-split-half aegis-split-left aegis-badge-${pveLetter}${isPveTrans ? ' aegis-split-transition' : ''}">${pveStr}</span>
        <span class="aegis-split-half aegis-split-right aegis-badge-${pvpLetter}${isPvpTrans ? ' aegis-split-transition' : ''}">${pvpStr}</span>
      </div>
    `;
  } else if (isDual) {
    badge.classList.add('aegis-badge-dual');
  }
  if (!isSplit) {
    if (result.isOmniRoll) {
      badge.classList.add('aegis-badge-omni');
      if (aegisBadgeStyle === 'classic') {
        badge.textContent = `✦ ${gradeStr}`;
      } else {
        badge.textContent = gradeStr;
      }
    } else if (result.isPerfect5of5 && !isDual && !isArmor) {
      badge.classList.add('aegis-badge-perfect');
      if (aegisBadgeStyle === 'classic') {
        badge.textContent = `★ ${gradeStr}`;
      } else {
        badge.textContent = gradeStr;
      }
    } else {
      badge.textContent = gradeStr;
    }
  }

  if (result.upgradeAvailable) {
    const upgradeArrow = document.createElement('span');
    upgradeArrow.className = 'aegis-badge-upgrade-arrow';
    upgradeArrow.textContent = '▲';
    badge.appendChild(upgradeArrow);
  }

  // Winnower: click the badge to pin its tooltip (hover-only tooltips can't
  // be moused into for reading long notes or the perk checklist).
  if (IS_WINNOWER_HOST && !winnowerPinBoundBadges.has(badge)) {
    winnowerPinBoundBadges.add(badge);
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pinnedRow && pinnedRow === badge.closest('[data-aegis-item-hash]')) {
        unpinTooltip();
      } else {
        pinTooltipFor(badge);
      }
    });
  }
}

/**
 * Removes the Aegis badge overlay from a weapon tile if it exists.
 */
function removeBadge(el: HTMLElement) {
  const itemContainer = (el.closest('[data-aegis-item-hash]') as HTMLElement) || el;
  itemContainer.classList.remove('aegis-gold-glow');
  const badgeTarget = itemContainer.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"]');
  if (badgeTarget) {
    badgeTarget.classList.remove('aegis-gold-glow');
  }
  itemContainer.querySelectorAll('.aegis-badge').forEach((b) => b.remove());
}

/**
 * Evaluates a single weapon tile element, calculates its grade, and applies overlay UI.
 */
function processElement(el: HTMLElement) {
  // If an ancestor is also annotated, this is a nested child element.
  // Skip it — the parent element handles badge injection for this item.
  // Do NOT call removeBadge here: the badge was injected INTO this element
  // by the parent's injectBadge() call, and removing it would destroy it.
  const parentWrapper = el.parentElement?.closest('[data-aegis-item-hash]');
  if (parentWrapper) {
    if (el.hasAttribute('data-aegis-listeners')) {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeAttribute('data-aegis-listeners');
    }
    return;
  }


  const itemHashStr = el.getAttribute('data-aegis-item-hash');
  const weaponName = el.getAttribute('data-aegis-item-name') || 'Unknown Weapon';
  const perkHashesStr = el.getAttribute('data-aegis-perk-hashes');
  const perksDataStr = el.getAttribute('data-aegis-perks-data');
  // Equipped masterwork stat (e.g. "Range", "Handling") — written by main-world-content.ts
  const equippedMasterwork = (el.getAttribute('data-aegis-masterwork') || '').trim().toLowerCase();

  if (itemHashStr && weaponName && weaponName !== 'Unknown Weapon') {
    const hash = parseInt(itemHashStr, 10);
    if (!isNaN(hash)) {
      const normName = weaponName.toLowerCase().trim();
      nameToHash[normName] = hash;
      const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
      nameToHash[baseName] = hash;
    }
  }

  const itemType = el.getAttribute('data-aegis-item-type') || 'weapon';

  if (itemType === 'armor') {
    if (!itemHashStr) return;
    try {
      const sheetArmor = findAegisArmorSet(weaponName);
      let result: ScoringResult;

      if (sheetArmor) {
        result = {
          grade: `${sheetArmor.piece2Rating}/${sheetArmor.piece4Rating}`,
          matchPercentage: 100,
          matchedPerks: [],
          missingPerks: [],
          notes: `2-Piece: ${sheetArmor.piece2Name} - ${sheetArmor.piece2Desc}\n4-Piece: ${sheetArmor.piece4Name} - ${sheetArmor.piece4Desc}`,
          wishlistPerks: [],
          wishlistNotes: `Source: ${sheetArmor.source} (${sheetArmor.sourceType})`,
        };
      } else {
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }

      const normAName = normName(weaponName);
      const armorSetName = sheetArmor ? normName(sheetArmor.setName) : '';
      const setShopping = armorSetName ? resolveShoppingItem(aegisShoppingDb, null, armorSetName) : null;
      const { item: shoppingItem, alt: shoppingAlt } = (setShopping && setShopping.item)
        ? setShopping
        : resolveShoppingItem(aegisShoppingDb, null, normAName);

      weaponDataMap.set(el, {
        result,
        name: weaponName,
        perksMap: {},
        sheetArmor: sheetArmor || null,
        shoppingItem,
        shoppingAlt,
      });

      if (sheetArmor) {
        const rating2Val = getGradeValue(sheetArmor.piece2Rating);
        const rating4Val = getGradeValue(sheetArmor.piece4Rating);
        const bestRating = rating2Val >= rating4Val ? sheetArmor.piece2Rating : sheetArmor.piece4Rating;

        let armorPerks: string[] = [];
        const armorPerksStr = el.getAttribute('data-aegis-armor-perks');
        if (armorPerksStr) {
          try { armorPerks = JSON.parse(armorPerksStr); } catch (e) {}
        }

        let armorStats: Record<string, number> | undefined;
        const armorStatsStr = el.getAttribute('data-aegis-armor-stats');
        if (armorStatsStr) {
          try { armorStats = JSON.parse(armorStatsStr); } catch (e) {}
        }

        const rawInstanceId = el.getAttribute('data-aegis-instance-id') || el.getAttribute('data-aegis-item-id') || undefined;
        const itemInfo: PlayerOwnedItemInfo = {
          name: weaponName,
          grade: bestRating,
          element: el,
          isPerfect: false,
          hash: 0,
          armorPerks,
          armorStats,
          instanceId: rawInstanceId,
        };

        const existing = playerVaultInventory.get(normAName) || [];
        const idx = existing.findIndex(item => (rawInstanceId && item.instanceId === rawInstanceId) || item.element === el);
        if (idx >= 0) existing[idx] = itemInfo;
        else existing.push(itemInfo);
        playerVaultInventory.set(normAName, existing);

        if (armorSetName && armorSetName !== normAName) {
          const existingSet = playerVaultInventory.get(armorSetName) || [];
          const sIdx = existingSet.findIndex(item => (rawInstanceId && item.instanceId === rawInstanceId) || item.element === el);
          if (sIdx >= 0) existingSet[sIdx] = itemInfo;
          else existingSet.push(itemInfo);
          playerVaultInventory.set(armorSetName, existingSet);
        }
      }

      if (result.grade) {
        const isPopup = !IS_WINNOWER_HOST && el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');

        if (!isPopup) {
          injectBadge(el, result);
        }

        // DIM-only, as in the weapon path: Winnower has no item popups.
        if (!IS_WINNOWER_HOST) {
          const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
          if (popupContainer) {
            injectPopupSummary(popupContainer as HTMLElement, result, scoringSource, undefined, undefined, sheetArmor);
          }
        }

        const hoverTarget = IS_WINNOWER_HOST ? (winnowerNameCell(el) ?? el) : el;
        if (!isPopup && !hoverTarget.hasAttribute('data-aegis-listeners')) {
          hoverTarget.addEventListener('mouseenter', handleMouseEnter);
          hoverTarget.addEventListener('mouseleave', handleMouseLeave);
          if (IS_WINNOWER_HOST) {
            hoverTarget.addEventListener('click', handleCellPinClick, true);
          }
          hoverTarget.setAttribute('data-aegis-listeners', 'true');
        }
      } else {
        removeBadge(el);
        if (!IS_WINNOWER_HOST) {
          const popupContainer = el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
          if (popupContainer) {
            const summary = popupContainer.querySelector('.aegis-popup-summary');
            if (summary) summary.remove();
          }
        }
        if (el.hasAttribute('data-aegis-listeners')) {
          el.removeEventListener('mouseenter', handleMouseEnter);
          el.removeEventListener('mouseleave', handleMouseLeave);
          el.removeAttribute('data-aegis-listeners');
        }
      }
    } catch (err) {
      console.error('Error processing armor element in content script:', err);
    }
    return;
  }

  if (!itemHashStr || !perkHashesStr) {
    return;
  }

  try {
    const itemHash = parseInt(itemHashStr, 10);
    const perkHashes = perkHashesStr
      .split(',')
      .map((h) => parseInt(h.trim(), 10))
      .filter((h) => !isNaN(h));

    const instanceId = el.getAttribute('data-aegis-instance-id');

    let perksMap: Record<number, { name: string; icon: string }> = {};
    if (perksDataStr) {
      try { perksMap = JSON.parse(perksDataStr); } catch (e) { /* ignore */ }
      for (const p of Object.values(perksMap)) {
        if (p && p.name && p.icon) {
          const cleanName = cleanPerkName(p.name);
          perkNameToIcon[cleanName] = p.icon;
          perkNameToIcon[p.name.toLowerCase().trim()] = p.icon;
        }
      }
    }

    // Build perkNames from the perksDataMap (all hashes → names) for name-based matching fallback
    const perkNames = Object.values(perksMap)
      .map(p => p?.name?.toLowerCase().trim())
      .filter(Boolean) as string[];

    if (instanceId && weaponName && weaponName !== 'Unknown Weapon') {
      ownedItemsMap.set(instanceId, {
        instanceId,
        name: weaponName,
        hash: itemHash,
        perkHashes,
        perkNames,
      });
    }

    // Read the categorized possible perks written by the main world script (perk1s/perk2s separated by column)
    const possiblePerksAttr = el.getAttribute('data-aegis-weapon-possible-perks');
    if (possiblePerksAttr && weaponName && weaponName !== 'Unknown Weapon') {
      try {
        const possible = JSON.parse(possiblePerksAttr);
        const norm = weaponName.toLowerCase().trim();
        // Only update if we got real perk data (non-empty perk columns)
        if (possible && (possible.perk1s?.length > 0 || possible.perk2s?.length > 0 || possible.barrels?.length > 0)) {
          const existing = weaponPossiblePerksCache[norm];
          if (!existing || !existing.isFromManifest) {
            weaponPossiblePerksCache[norm] = possible;
          }
        }
      } catch (e) { /* ignore */ }
    }

    const activePerksDataStr = el.getAttribute('data-aegis-active-perk-hashes');
    let activeHashes: number[] = [];
    if (activePerksDataStr) {
      activeHashes = activePerksDataStr.split(',').map(Number).filter(h => !isNaN(h) && h > 0);
    }

    let result: ScoringResult;
    let sheetPerks = undefined;
    // A Winnower row's textContent is the whole row (verdict prose, perk
    // lists), so the variant-disambiguation text is scoped to the name cell.
    const elText = IS_WINNOWER_HOST ? winnowerNameCell(el)?.textContent || '' : el.textContent || '';
    const sheetWeapon = findAegisWeapon(weaponName, perksMap, activeHashes, elText, itemHash);
    let bestAlternative = undefined;
    let isBestInClass = false;

    let sheetWeaponPvE: AegisSheetWeapon | null = null;
    let sheetWeaponPvP: AegisSheetWeapon | null = null;
    let sheetPerksPvE: SheetPerksGroup | undefined = undefined;
    let sheetPerksPvP: SheetPerksGroup | undefined = undefined;
    let pveResult: ScoringResult | null = null;
    let pvpResult: ScoringResult | null = null;
    let bestAlternativePvE: string | undefined = undefined;
    let isBestInClassPvE = false;
    let bestAlternativePvP: string | undefined = undefined;
    let isBestInClassPvP = false;

    if (scoringSource === 'lightgg') {
      const rawInstanceId = el.getAttribute('data-aegis-instance-id') || el.id.replace('item-', '');
      const instanceId = rawInstanceId.replace(/^[^0-9]+/, '');
      const grade = lightggDb[instanceId];
      if (grade) {
        let aegisResult: ScoringResult;
        const useSheet = sheetWeapon && aegisDbMode !== 'wishlist';
        const useWishlist = aegisDbMode !== 'spreadsheet';

        let wishlistResult: ScoringResult | null = null;
        if (useWishlist && wishlistDb && wishlistDb[itemHash]) {
          wishlistResult = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
        }

        if (useSheet) {
          const sheetScore = scoreSheetWeapon(sheetWeapon!, perksMap, activeHashes);
          aegisResult = sheetScore.result;
          sheetPerks = sheetScore.sheetPerks;
          aegisResult.upgradeAdvice = sheetScore.upgradeAdvice;
          aegisResult.potentialGrade = sheetScore.potentialGrade;
          if (wishlistResult && wishlistResult.grade) {
            aegisResult.wishlistNotes = wishlistResult.notes;
          }
        } else if (useWishlist && wishlistResult) {
          aegisResult = wishlistResult;
        } else {
          aegisResult = {
            grade: null,
            matchPercentage: 0,
            matchedPerks: [],
            missingPerks: [],
            notes: '',
            wishlistPerks: [],
          };
        }
        result = {
          grade: grade as any,
          matchPercentage: aegisResult.grade ? aegisResult.matchPercentage : 100,
          matchedPerks: aegisResult.matchedPerks,
          missingPerks: aegisResult.missingPerks,
          notes: aegisResult.notes || 'Community popularity rating from Light.gg Roll Appraiser.',
          wishlistPerks: aegisResult.wishlistPerks,
          upgradeAdvice: aegisResult.upgradeAdvice,
          potentialGrade: aegisResult.potentialGrade,
          wishlistNotes: aegisResult.wishlistNotes,
        };
      } else {
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }
    } else if (aegisMode === 'both') {
      sheetWeaponPvE = findAegisWeapon(weaponName, perksMap, activeHashes, elText, itemHash, aegisSheetDbPvE);
      sheetWeaponPvP = findAegisWeapon(weaponName, perksMap, activeHashes, elText, itemHash, aegisSheetDbPvP);

      let pveGradeRaw = '';
      if (sheetWeaponPvE) {
        const scorePvE = scoreSheetWeapon(sheetWeaponPvE, perksMap, activeHashes);
        pveResult = scorePvE.result;
        sheetPerksPvE = scorePvE.sheetPerks;
        pveResult.potentialGrade = scorePvE.potentialGrade;
        pveResult.upgradeAdvice = scorePvE.upgradeAdvice;

        const isExoticPvE = sheetWeaponPvE.exoticViability || sheetWeaponPvE.source === 'Exotic';
        if (isExoticPvE && sheetWeaponPvE.tier) {
          pveGradeRaw = sheetWeaponPvE.tier.trim();
        } else {
          const activeGradePvE = pveResult.grade || '';
          const potentialGradePvE = pveResult.potentialGrade || '';
          const hasHigherPvE = !!(potentialGradePvE && potentialGradePvE !== activeGradePvE && getGradeValue(potentialGradePvE) > getGradeValue(activeGradePvE));

          if (hasHigherPvE) {
            pveResult.upgradeAvailable = true;
          }

          let displayRollGradePvE = activeGradePvE;
          if (hasHigherPvE && aegisGradeDisplayMode === 'dual') {
            displayRollGradePvE = `${activeGradePvE}➔${potentialGradePvE}`;
          } else if (hasHigherPvE && aegisGradeDisplayMode === 'potential') {
            displayRollGradePvE = potentialGradePvE;
          }

          if (aegisTwoTier && sheetWeaponPvE.tier && displayRollGradePvE) {
            pveGradeRaw = `${sheetWeaponPvE.tier.trim()}${displayRollGradePvE}`;
          } else {
            pveGradeRaw = displayRollGradePvE;
          }
        }

        const catPvE = findWeaponCategory(weaponName, itemHash, aegisSheetDbPvE);
        const superiorsPvE = findSuperiors(catPvE, sheetWeaponPvE.energy, sheetWeaponPvE.frame, aegisSheetDbPvE);
        const bestWPvE = superiorsPvE.byBoth || superiorsPvE.byFrame || superiorsPvE.byEnergy;
        if (bestWPvE) {
          if (bestWPvE.name.toLowerCase() === sheetWeaponPvE.name.toLowerCase()) {
            isBestInClassPvE = true;
          } else {
            bestAlternativePvE = `${bestWPvE.name} (${bestWPvE.tier} #${bestWPvE.rank})`;
          }
        }
      }

      let pvpGradeRaw = '';
      if (sheetWeaponPvP) {
        const scorePvP = scoreSheetWeapon(sheetWeaponPvP, perksMap, activeHashes);
        pvpResult = scorePvP.result;
        sheetPerksPvP = scorePvP.sheetPerks;
        pvpResult.potentialGrade = scorePvP.potentialGrade;
        pvpResult.upgradeAdvice = scorePvP.upgradeAdvice;

        const isExoticPvP = sheetWeaponPvP.exoticViability || sheetWeaponPvP.source === 'Exotic';
        if (isExoticPvP && sheetWeaponPvP.tier) {
          pvpGradeRaw = sheetWeaponPvP.tier.trim();
        } else {
          const activeGradePvP = pvpResult.grade || '';
          const potentialGradePvP = pvpResult.potentialGrade || '';
          const hasHigherPvP = !!(potentialGradePvP && potentialGradePvP !== activeGradePvP && getGradeValue(potentialGradePvP) > getGradeValue(activeGradePvP));

          if (hasHigherPvP) {
            pvpResult.upgradeAvailable = true;
          }

          let displayRollGradePvP = activeGradePvP;
          if (hasHigherPvP && aegisGradeDisplayMode === 'dual') {
            displayRollGradePvP = `${activeGradePvP}➔${potentialGradePvP}`;
          } else if (hasHigherPvP && aegisGradeDisplayMode === 'potential') {
            displayRollGradePvP = potentialGradePvP;
          }

          if (aegisTwoTier && sheetWeaponPvP.tier && displayRollGradePvP) {
            pvpGradeRaw = `${sheetWeaponPvP.tier.trim()}${displayRollGradePvP}`;
          } else {
            pvpGradeRaw = displayRollGradePvP;
          }
        }

        const catPvP = findWeaponCategory(weaponName, itemHash, aegisSheetDbPvP);
        const superiorsPvP = findSuperiors(catPvP, sheetWeaponPvP.energy, sheetWeaponPvP.frame, aegisSheetDbPvP);
        const bestWPvP = superiorsPvP.byBoth || superiorsPvP.byFrame || superiorsPvP.byEnergy;
        if (bestWPvP) {
          if (bestWPvP.name.toLowerCase() === sheetWeaponPvP.name.toLowerCase()) {
            isBestInClassPvP = true;
          } else {
            bestAlternativePvP = `${bestWPvP.name} (${bestWPvP.tier} #${bestWPvP.rank})`;
          }
        }
      }

      if (pveGradeRaw || pvpGradeRaw) {
        const pveDisplay = pveGradeRaw || '—';
        const pvpDisplay = pvpGradeRaw || '—';
        result = {
          grade: `${pveDisplay} | ${pvpDisplay}`,
          matchPercentage: Math.max(pveResult?.matchPercentage || 0, pvpResult?.matchPercentage || 0),
          matchedPerks: [...(pveResult?.matchedPerks || []), ...(pvpResult?.matchedPerks || [])],
          missingPerks: [],
          notes: pveResult?.notes || pvpResult?.notes || '',
          wishlistPerks: [],
          pveGrade: pveDisplay,
          pvpGrade: pvpDisplay,
          upgradeAvailable: !!(pveResult?.upgradeAvailable || pvpResult?.upgradeAvailable),
          isPerfect5of5: !!(pveResult?.isPerfect5of5 && pvpResult?.isPerfect5of5),
          isOmniRoll: !!(pveResult?.isOmniRoll || pvpResult?.isOmniRoll),
        };
      } else {
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }
    } else {
      const useSheet = sheetWeapon && aegisDbMode !== 'wishlist';
      const useWishlist = aegisDbMode !== 'spreadsheet';

      let wishlistResult: ScoringResult | null = null;
      if (useWishlist && wishlistDb && wishlistDb[itemHash]) {
        wishlistResult = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
      }

      if (useSheet) {
        const sheetScore = scoreSheetWeapon(sheetWeapon!, perksMap, activeHashes);
        result = sheetScore.result;
        sheetPerks = sheetScore.sheetPerks;
        result.upgradeAdvice = sheetScore.upgradeAdvice;
        result.potentialGrade = sheetScore.potentialGrade;
        if (wishlistResult && wishlistResult.grade) {
          result.wishlistNotes = wishlistResult.notes;
        }
      } else if (useWishlist && wishlistResult) {
        result = wishlistResult;
      } else {
        // Spreadsheet only mode but weapon is not in the spreadsheet
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }
    }

    const hasSheetData = sheetWeapon && aegisDbMode !== 'wishlist';
    if (hasSheetData) {
      const categoryTab = findWeaponCategory(weaponName, itemHash);
      const superiors = findSuperiors(categoryTab, sheetWeapon!.energy, sheetWeapon!.frame);
      const bestW = superiors.byBoth || superiors.byFrame || superiors.byEnergy;
      if (bestW) {
        if (bestW.name.toLowerCase() === sheetWeapon!.name.toLowerCase()) {
          isBestInClass = true;
        } else {
          bestAlternative = `${bestW.name} (${bestW.tier} #${bestW.rank})`;
        }
      }
    }

    const normWName = normName(weaponName);
    const { item: shoppingItem, alt: shoppingAlt } = resolveShoppingItem(aegisShoppingDb, null, normWName);
    const { item: shoppingItemPvE, alt: shoppingAltPvE } = resolveShoppingItem(aegisShoppingDbPvE, aegisShoppingDb, normWName);
    const { item: shoppingItemPvP, alt: shoppingAltPvP } = resolveShoppingItem(aegisShoppingDbPvP, null, normWName);

    const dualInfo: DualSheetInfo | undefined = aegisMode === 'both' ? {
      sheetWeaponPvE,
      sheetWeaponPvP,
      sheetPerksPvE,
      sheetPerksPvP,
      pveResult,
      pvpResult,
      bestAlternativePvE,
      bestAlternativePvP,
      isBestInClassPvE,
      isBestInClassPvP,
      shoppingItemPvE,
      shoppingAltPvE,
      shoppingItemPvP,
      shoppingAltPvP,
    } : undefined;

    // Store evaluation payload in GC-safe, strongly typed WeakMap
    weaponDataMap.set(el, {
      result,
      name: weaponName,
      perksMap,
      activeHashes,
      sheetWeapon: hasSheetData ? sheetWeapon : null,
      bestAlternative,
      isBestInClass,
      sheetPerks: hasSheetData ? sheetPerks : null,
      equippedMasterwork: equippedMasterwork || null,
      shoppingItem,
      shoppingAlt,
      dualInfo,
      shoppingItemPvE,
      shoppingAltPvE,
      shoppingItemPvP,
      shoppingAltPvP,
      sheetWeaponPvE,
      sheetWeaponPvP,
      sheetPerksPvE,
      sheetPerksPvP,
      pveResult,
      pvpResult,
      bestAlternativePvE,
      bestAlternativePvP,
      isBestInClassPvE,
      isBestInClassPvP,
    });

    // Index into playerVaultInventory for Shopping List Audit
    if (result.grade) {
      const lookupKey = normWName;
      const existing = playerVaultInventory.get(lookupKey) || [];
      const instanceId = el.getAttribute('data-aegis-instance-id') || el.getAttribute('data-aegis-item-id') || undefined;
      const idx = existing.findIndex(item => (instanceId && item.instanceId === instanceId) || item.element === el);
      const itemInfo: PlayerOwnedItemInfo = {
        name: weaponName,
        grade: result.grade,
        element: el,
        isPerfect: !!result.isPerfect5of5,
        hash: itemHash,
        matchedPerks: sheetPerks ? sheetPerks.matched : undefined,
        perkHashes: result.matchedPerks,
        equippedMasterwork: equippedMasterwork || undefined,
        instanceId,
        potentialGrade: result.potentialGrade,
        upgradeAvailable: result.upgradeAvailable,
        isOmniRoll: result.isOmniRoll,
        isPerfect5of5: result.isPerfect5of5
      };
      if (idx >= 0) {
        existing[idx] = itemInfo;
      } else {
        existing.push(itemInfo);
      }
      playerVaultInventory.set(lookupKey, existing);
    }

    if (result.grade && aegisMode !== 'both') {
      const isExotic = sheetWeapon && (sheetWeapon.exoticViability || sheetWeapon.source === 'Exotic');
      if (isExotic && sheetWeapon && sheetWeapon.tier) {
        result.grade = sheetWeapon.tier.trim();
      } else {
        const activeGrade = result.grade;
        const potentialGrade = result.potentialGrade;
        const hasHigherPotential = potentialGrade && potentialGrade !== activeGrade && getGradeValue(potentialGrade) > getGradeValue(activeGrade);

        if (hasHigherPotential) {
          result.upgradeAvailable = true;
        }

        let displayRollGrade = activeGrade;
        if (hasHigherPotential && aegisGradeDisplayMode === 'dual') {
          displayRollGrade = `${activeGrade}➔${potentialGrade}`;
        } else if (hasHigherPotential && aegisGradeDisplayMode === 'potential') {
          displayRollGrade = potentialGrade;
        }

        if (aegisTwoTier && sheetWeapon && sheetWeapon.tier && displayRollGrade) {
          result.grade = `${sheetWeapon.tier.trim()}${displayRollGrade}`;
        } else {
          result.grade = displayRollGrade;
        }
      }
    }

    if (result.grade) {
      const isPopup = !IS_WINNOWER_HOST && el.matches('.item-popup, [class*="item-popup"], [class*="ItemPopup"]');
      const isItemTile = IS_WINNOWER_HOST
        ? el.hasAttribute('data-aegis-item-hash')
        : el.matches('[id^="item-"], [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"], [class*="item-tile"], .item-tile, .item');

      // Inject rank badge (only if it's a valid item tile and NOT the popup container itself)
      if (!isPopup && isItemTile) {
        if (result.isOmniRoll) {
          el.setAttribute('data-aegis-omni', 'true');
        } else {
          el.removeAttribute('data-aegis-omni');
        }
        if (result.isPerfect5of5) {
          el.setAttribute('data-aegis-perfect', 'true');
        } else {
          el.removeAttribute('data-aegis-perfect');
        }
        injectBadge(el, result);
      } else if (!isPopup) {
        removeBadge(el);
      }

      // Inject popup summary card if inside a details popup. DIM-only: Winnower
      // has no item popups (and [class*="Sheet"] could false-positive there).
      if (!IS_WINNOWER_HOST) {
        const popupContainer = isPopup ? el : el.closest('.item-popup, [class*="item-popup"], [class*="ItemPopup"]');
        if (popupContainer) {
          injectPopupSummary(
            popupContainer as HTMLElement,
            result,
            scoringSource,
            sheetWeapon || undefined,
            sheetPerks,
            undefined,
            equippedMasterwork,
            aegisMode === 'both' ? {
              sheetWeaponPvE,
              sheetWeaponPvP,
              sheetPerksPvE,
              sheetPerksPvP,
              pveResult,
              pvpResult,
              bestAlternativePvE,
              bestAlternativePvP,
              isBestInClassPvE,
              isBestInClassPvP,
            } : undefined
          );
        }
      }

      // Hover binds to the name cell on Winnower because a full-width row
      // anchor defeats side placement and fires on every row during vertical travel.
      const hoverTarget = IS_WINNOWER_HOST ? (winnowerNameCell(el) ?? el) : el;
      if (!isPopup && isItemTile && !hoverTarget.hasAttribute('data-aegis-listeners')) {
        hoverTarget.addEventListener('mouseenter', handleMouseEnter);
        hoverTarget.addEventListener('mouseleave', handleMouseLeave);
        if (IS_WINNOWER_HOST) {
          hoverTarget.addEventListener('click', handleCellPinClick, true);
        }
        hoverTarget.setAttribute('data-aegis-listeners', 'true');
      } else if (!isItemTile && hoverTarget.hasAttribute('data-aegis-listeners')) {
        hoverTarget.removeEventListener('mouseenter', handleMouseEnter);
        hoverTarget.removeEventListener('mouseleave', handleMouseLeave);
        hoverTarget.removeEventListener('click', handleCellPinClick, true);
        hoverTarget.removeAttribute('data-aegis-listeners');
      }
    } else {
      // If graded previously but now has no grade, remove UI
      removeBadge(el);
      const popupContainer = el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (popupContainer) {
        const summary = popupContainer.querySelector('.aegis-popup-summary');
        if (summary) summary.remove();
      }
      if (el.hasAttribute('data-aegis-listeners')) {
        el.removeEventListener('mouseenter', handleMouseEnter);
        el.removeEventListener('mouseleave', handleMouseLeave);
        el.removeAttribute('data-aegis-listeners');
      }
    }
  } catch (err) {
    console.error('Error processing element in content script:', err);
  }
}

const GRADE_VALUES: Record<string, number> = {
  's+': 9,
  's': 8,
  'a+': 7,
  'a': 6,
  'b+': 5,
  'b': 4,
  'c': 3,
  'd': 2,
  'f': 1,
  'none': 0
};

function compareGrades(itemGrade: string, queryStr: string): boolean {
  let normalizedGrade = itemGrade.toLowerCase().trim();
  
  // If it's a dual grade string like "f➔s+" or "bf➔s+", check if either equipped or potential grade matches
  if (normalizedGrade.includes('➔')) {
    const parts = normalizedGrade.split('➔');
    const equippedPart = parts[0];
    const potentialPart = parts[1];
    return compareGrades(equippedPart, queryStr) || compareGrades(potentialPart, queryStr);
  }

  const isArmor = normalizedGrade.includes('/');
  const isTwoTier = !isArmor && (normalizedGrade.length > 2 || (normalizedGrade.length === 2 && !normalizedGrade.endsWith('+') && !normalizedGrade.endsWith('-')));
  const rollGradePart = isTwoTier ? normalizedGrade.substring(1) : normalizedGrade;
  const archTierPart = isTwoTier ? normalizedGrade.charAt(0) : '';

  const match = queryStr.match(/^([><]=?|==?)(.+)$/);
  
  if (match) {
    const op = match[1];
    const targetRank = match[2].trim().toLowerCase();
    const valItem = GRADE_VALUES[rollGradePart] ?? GRADE_VALUES[normalizedGrade] ?? 0;
    const valTarget = GRADE_VALUES[targetRank] ?? 0;
    
    if (op === '>=') return valItem >= valTarget;
    if (op === '>') return valItem > valTarget;
    if (op === '<=') return valItem <= valTarget;
    if (op === '<') return valItem < valTarget;
    if (op === '=' || op === '==') {
      return normalizedGrade === targetRank || rollGradePart === targetRank || (isTwoTier && archTierPart === targetRank);
    }
  }
  
  const qLow = queryStr.toLowerCase().trim();
  return normalizedGrade === qLow || rollGradePart === qLow || (isTwoTier && archTierPart === qLow) || normalizedGrade.startsWith(qLow);
}

function setupSearchWidget() {
  // Winnower's own filter input matches this selector; injecting the widget
  // there would rewrite Winnower's controlled input.
  if (IS_WINNOWER_HOST) return;
  const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]') as HTMLInputElement;
  if (!searchInput) return;

  const searchWrapper = searchInput.parentElement;
  if (!searchWrapper) return;

  if (searchWrapper.querySelector('.aegis-search-widget') || document.querySelector('.aegis-search-widget')) return;

  // Closure state variables for modular filter building
  let activeTarget = 'perk'; // 'perk', 'weapon', 'armor2p', 'armor4p'
  let activeCondition = '>='; // '=', '>=', '<='

  const widgetContainer = document.createElement('div');
  widgetContainer.className = 'aegis-search-widget';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'aegis-search-widget-btn';
  button.title = t('aegisFilters');
  button.innerHTML = `
    <svg viewBox="0 0 24 24" class="aegis-widget-icon" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  `;

  const menu = document.createElement('div');
  menu.className = 'aegis-search-widget-menu hidden';
  menu.innerHTML = `
    <div class="aegis-menu-header">${t('aegisFilters')}</div>
    
    <div class="aegis-widget-row">
      <div class="aegis-row-label">${t('target')}</div>
      <div class="aegis-btn-group" data-group="target">
        <button type="button" class="aegis-group-btn active" data-value="perk">${t('targetPerk')}</button>
        <button type="button" class="aegis-group-btn" data-value="weapon">${t('targetWeapon')}</button>
        <button type="button" class="aegis-group-btn" data-value="source">${t('targetSource')}</button>
        <button type="button" class="aegis-group-btn" data-value="armor2p">${t('targetArmor2p')}</button>
        <button type="button" class="aegis-group-btn" data-value="armor4p">${t('targetArmor4p')}</button>
      </div>
    </div>

    <div class="aegis-widget-row">
      <div class="aegis-row-label">${t('condition')}</div>
      <div class="aegis-btn-group" data-group="condition">
        <button type="button" class="aegis-group-btn active" data-value=">=">${t('orBetter')}</button>
        <button type="button" class="aegis-group-btn" data-value="=">${t('only')}</button>
        <button type="button" class="aegis-group-btn" data-value="<=">${t('orWorse')}</button>
      </div>
    </div>

    <div class="aegis-widget-row">
      <div class="aegis-row-label">${t('grade')}</div>
      <div class="aegis-grade-grid">
        <button type="button" class="aegis-grade-btn" data-grade="s">S</button>
        <button type="button" class="aegis-grade-btn" data-grade="a">A</button>
        <button type="button" class="aegis-grade-btn" data-grade="b">B</button>
        <button type="button" class="aegis-grade-btn" data-grade="c">C</button>
      </div>
    </div>

    <div class="aegis-menu-divider"></div>

    <div class="aegis-widget-row">
      <div class="aegis-row-label">${t('activitySource')}</div>
      <div class="aegis-combobox-wrapper" data-combobox-id="widget-source" style="width: 100% !important;">
        <input type="text" class="aegis-combobox-input aegis-widget-source-input" placeholder="${t('sourcePlaceholder')}" />
        <span class="aegis-combobox-arrow">▾</span>
        <div class="aegis-combobox-menu hidden">
          <div class="aegis-combobox-options"></div>
        </div>
      </div>
    </div>

    <div class="aegis-menu-divider"></div>

    <div class="aegis-widget-row">
      <div class="aegis-row-label">${t('shortcuts')}</div>
      <div class="aegis-shortcuts-grid">
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:5/5">${t('perfectRollFilter')}</button>
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:omni">${t('omniRollFilter')}</button>
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:god">${t('godRolls')}</button>
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:shopping">${t('shoppingList')}</button>
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:upgrade">${t('upgradeable')}</button>
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:chase">${t('chaseList')}</button>
      </div>
    </div>

    <div class="aegis-menu-divider"></div>
    <button type="button" class="aegis-menu-clear-btn">${t('clearActiveFilter')}</button>
  `;

  widgetContainer.appendChild(button);
  widgetContainer.appendChild(menu);

  // Inject widget right after searchInput
  searchInput.after(widgetContainer);

  // Position relative is required for absolute dropdown anchoring
  searchWrapper.style.setProperty('position', 'relative', 'important');

  // Setup Activity Source Combobox in Widget
  const widgetSourceWrapper = menu.querySelector('.aegis-combobox-wrapper[data-combobox-id="widget-source"]') as HTMLElement;
  if (widgetSourceWrapper) {
    const wsInput = widgetSourceWrapper.querySelector('.aegis-combobox-input') as HTMLInputElement;
    const wsMenu = widgetSourceWrapper.querySelector('.aegis-combobox-menu') as HTMLElement;

    const openWidgetSourceMenu = () => {
      populateSourceFilter();
      widgetSourceWrapper.classList.add('active');
      wsMenu.classList.remove('hidden');
    };

    wsInput?.addEventListener('focus', openWidgetSourceMenu);
    wsInput?.addEventListener('click', (e) => {
      e.stopPropagation();
      openWidgetSourceMenu();
    });

    wsInput?.addEventListener('input', () => {
      populateComboboxMenu('widget-source');
      if (wsInput.value.trim()) {
        searchInput.value = `aegis:s:${wsInput.value.trim()}`;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  // Toggle dropdown on button click
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    populateSourceFilter();
    menu.classList.toggle('hidden');
  });

  // Handle Target selection clicks
  const targetGroup = menu.querySelector('[data-group="target"]') as HTMLElement;
  targetGroup.addEventListener('click', (e) => {
    const btn = e.target as HTMLButtonElement;
    if (!btn.classList.contains('aegis-group-btn')) return;
    targetGroup.querySelectorAll('.aegis-group-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTarget = btn.getAttribute('data-value') || 'perk';
  });

  // Handle Condition selection clicks
  const conditionGroup = menu.querySelector('[data-group="condition"]') as HTMLElement;
  conditionGroup.addEventListener('click', (e) => {
    const btn = e.target as HTMLButtonElement;
    if (!btn.classList.contains('aegis-group-btn')) return;
    conditionGroup.querySelectorAll('.aegis-group-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCondition = btn.getAttribute('data-value') || '>=';
  });

  // Handle Grade button clicks (constructs & triggers filter)
  const gradeGrid = menu.querySelector('.aegis-grade-grid') as HTMLElement;
  gradeGrid.addEventListener('click', (e) => {
    const btn = e.target as HTMLButtonElement;
    if (!btn.classList.contains('aegis-grade-btn')) return;

    const grade = btn.getAttribute('data-grade') || 's';
    const prefixes: Record<string, string> = {
      perk: 'aegis:p:',
      weapon: 'aegis:w:',
      source: 'aegis:s:',
      armor2p: 'aegis:a:2p:',
      armor4p: 'aegis:a:4p:'
    };

    const prefix = prefixes[activeTarget] || 'aegis:p:';
    const op = activeCondition === '=' ? '' : activeCondition;
    const query = `${prefix}${op}${grade}`;

    searchInput.value = query;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    menu.classList.add('hidden');
  });

  // Handle Shortcut button clicks
  const shortcutsGrid = menu.querySelector('.aegis-shortcuts-grid') as HTMLElement;
  shortcutsGrid.addEventListener('click', (e) => {
    const btn = e.target as HTMLButtonElement;
    if (!btn.classList.contains('aegis-shortcut-btn')) return;

    const query = btn.getAttribute('data-shortcut');
    if (query) {
      searchInput.value = query;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    menu.classList.add('hidden');
  });

  // Handle Clear Filter click
  const clearBtn = menu.querySelector('.aegis-menu-clear-btn') as HTMLButtonElement;
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    menu.classList.add('hidden');
  });

  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!widgetContainer.contains(e.target as Node)) {
      menu.classList.add('hidden');
    }
  });
}

let activeAegisFilter: string | null = null;
let activeAegisFilterLabel: string | null = null;

function renderAegisFilterPill() {
  if (IS_WINNOWER_HOST) return; // DIM-only aegis: filter UI
  const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]') as HTMLInputElement;
  if (!searchInput) return;

  const searchWrapper = searchInput.parentElement;
  if (!searchWrapper) return;

  let pill = searchWrapper.querySelector('.aegis-filter-pill') as HTMLElement | null;
  
  if (!activeAegisFilter) {
    if (pill) {
      pill.remove();
      searchInput.style.removeProperty('padding-left');
    }
    return;
  }

  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'aegis-filter-pill';
    searchWrapper.appendChild(pill);
  }

  const textSpan = document.createElement('span');
  textSpan.className = 'aegis-pill-text';
  textSpan.textContent = activeAegisFilterLabel || 'Aegis Filter';
  
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'aegis-pill-close';
  closeBtn.innerHTML = '&times;';
  
  pill.replaceChildren(textSpan, closeBtn);

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    activeAegisFilter = null;
    activeAegisFilterLabel = null;
    renderAegisFilterPill();
    
    // Trigger search input update
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Adjust padding-left on search input
  requestAnimationFrame(() => {
    if (pill) {
      const pillWidth = pill.getBoundingClientRect().width || 100;
      searchInput.style.setProperty('padding-left', `${36 + pillWidth + 8}px`, 'important');
    }
  });
}

function evaluateAegisFiltering() {
  if (IS_WINNOWER_HOST) return; // DIM-only aegis: filter UI
  const items = document.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
  
  if (!activeAegisFilter) {
    items.forEach(item => {
      item.style.removeProperty('opacity');
      item.style.removeProperty('filter');
      item.style.removeProperty('pointer-events');
    });
    return;
  }

  const targetQuery = activeAegisFilter.replace(/^aegis:/i, '').toLowerCase().trim();

  items.forEach(item => {
    const data = weaponDataMap.get(item) || weaponDataMap.get(item.closest('[data-aegis-item-hash]') as HTMLElement) || weaponDataMap.get(item.querySelector('[data-aegis-item-hash]') as HTMLElement);
    const result = data?.result;
    const grade = result?.grade?.toLowerCase() || '';
    let isMatch = false;
    const isArmor = grade.includes('/');

    const shoppingItem = aegisMode === 'pvp'
      ? data?.shoppingItemPvP
      : (aegisMode === 'both'
          ? (data?.shoppingItemPvE || data?.shoppingItemPvP || data?.shoppingItem)
          : (data?.shoppingItemPvE || data?.shoppingItem));
    const shoppingAlt = aegisMode === 'pvp'
      ? data?.shoppingAltPvP
      : (aegisMode === 'both'
          ? (data?.shoppingAltPvE || data?.shoppingAltPvP || data?.shoppingAlt)
          : (data?.shoppingAltPvE || data?.shoppingAlt));
    const sheetW = aegisMode === 'pvp'
      ? (data?.sheetWeaponPvP || data?.sheetWeapon)
      : (aegisMode === 'both'
          ? (data?.sheetWeaponPvE || data?.sheetWeaponPvP || data?.sheetWeapon)
          : (data?.sheetWeaponPvE || data?.sheetWeapon));
    const weaponName = (data?.name || '').toLowerCase().trim();
    const isBestInClass = !!(aegisMode === 'pvp'
      ? data?.isBestInClassPvP
      : (aegisMode === 'both'
          ? (data?.isBestInClassPvE || data?.isBestInClassPvP || data?.isBestInClass)
          : (data?.isBestInClassPvE || data?.isBestInClass)));

    if (isArmor) {
      let cleanQuery = targetQuery;
      if (targetQuery.startsWith('a:') || targetQuery.startsWith('armor:')) {
        cleanQuery = targetQuery.startsWith('a:') ? targetQuery.substring(2) : targetQuery.substring(6);
      }

      const parts = grade.split('/');
      const rating2 = parts[0];
      const rating4 = parts[1];

      if (cleanQuery.startsWith('2p:') || cleanQuery.startsWith('2piece:')) {
        const targetRank = cleanQuery.startsWith('2p:') ? cleanQuery.substring(3) : cleanQuery.substring(7);
        isMatch = compareGrades(rating2, targetRank);
      } else if (cleanQuery.startsWith('4p:') || cleanQuery.startsWith('4piece:')) {
        const targetRank = cleanQuery.startsWith('4p:') ? cleanQuery.substring(3) : cleanQuery.substring(7);
        isMatch = compareGrades(rating4, targetRank);
      } else if (cleanQuery.includes('/')) {
        isMatch = (grade === cleanQuery);
      } else {
        isMatch = compareGrades(rating2, cleanQuery) || compareGrades(rating4, cleanQuery);
      }
    } else {
      if (targetQuery.startsWith('a:') || targetQuery.startsWith('armor:')) {
        isMatch = false;
      } else {
        const isSplit = grade.includes('|');
        const pvePart = result?.pveGrade?.toLowerCase() || (isSplit ? grade.split('|')[0].trim() : '');
        const pvpPart = result?.pvpGrade?.toLowerCase() || (isSplit ? grade.split('|')[1].trim() : '');

        let weaponRank = '';
        let perkRank = '';
        const isTwoTier = !isSplit && (grade.length > 2 || (grade.length === 2 && !grade.endsWith('+') && !grade.endsWith('-')));
        if (isTwoTier) {
          weaponRank = grade.charAt(0);
          perkRank = grade.substring(1);
        } else if (!isSplit) {
          perkRank = grade;
        }

        if (targetQuery === '5/5' || targetQuery === 'perfect' || targetQuery === '5of5' || targetQuery === 'godroll') {
          isMatch = !!result?.isPerfect5of5;
        } else if (targetQuery === 'omni' || targetQuery === 'master' || targetQuery === 'allperks') {
          isMatch = !!result?.isOmniRoll;
        } else if (targetQuery === 'upgradeable' || targetQuery === 'upgradable' || targetQuery === 'upgrade') {
          isMatch = !!result?.upgradeAvailable;
        } else if (targetQuery === 'god') {
          isMatch = isSplit 
            ? (compareGrades(pvePart, '>=s') || compareGrades(pvpPart, '>=s'))
            : compareGrades(perkRank, '>=s');
        } else if (targetQuery === 'bis' || targetQuery === 'bestinclass') {
          isMatch = isBestInClass;
        } else if (targetQuery === 'chase') {
          isMatch = !!chaseList[normName(weaponName)];
        } else if (targetQuery.startsWith('pve:')) {
          const q = targetQuery.substring(4);
          isMatch = compareGrades(pvePart, q);
        } else if (targetQuery.startsWith('pvp:')) {
          const q = targetQuery.substring(4);
          isMatch = compareGrades(pvpPart, q);
        } else if (targetQuery === 'shopping' || targetQuery === 'shop') {
          isMatch = !!shoppingItem;
        } else if (targetQuery === 'shopping:high' || targetQuery === 'priority:1' || targetQuery === 'priority:high') {
          isMatch = shoppingItem?.priority === 'high';
        } else if (targetQuery === 'shopping:ready') {
          isMatch = !!shoppingItem && (isSplit ? (compareGrades(pvePart, '>=a') || compareGrades(pvpPart, '>=a')) : compareGrades(perkRank, '>=a'));
        } else if (targetQuery === 'shopping:farm' || targetQuery === 'shopping:suboptimal') {
          isMatch = !!shoppingItem && !(isSplit ? (compareGrades(pvePart, '>=a') || compareGrades(pvpPart, '>=a')) : compareGrades(perkRank, '>=a'));
        } else if (targetQuery === 'shopping:alt' || targetQuery === 'shopping:alternative') {
          isMatch = !!shoppingAlt;
        } else if (targetQuery.startsWith('s:') || targetQuery.startsWith('source:')) {
          const targetSource = targetQuery.startsWith('s:') ? targetQuery.substring(2) : targetQuery.substring(7);
          const itemSource = sheetW?.source || (aegisSheetDb?.weapons[weaponName]?.source) || (aegisSheetDbPvE?.weapons[weaponName]?.source) || (aegisSheetDbPvP?.weapons[weaponName]?.source) || '';
          isMatch = itemSource.toLowerCase().includes(targetSource.toLowerCase());
        } else if (targetQuery.startsWith('w:') || targetQuery.startsWith('weapon:')) {
          const targetRank = targetQuery.startsWith('w:') ? targetQuery.substring(2) : targetQuery.substring(7);
          isMatch = compareGrades(weaponRank, targetRank);
        } else if (targetQuery.startsWith('p:') || targetQuery.startsWith('perk:')) {
          const targetRank = targetQuery.startsWith('p:') ? targetQuery.substring(2) : targetQuery.substring(5);
          isMatch = isSplit 
            ? (compareGrades(pvePart, targetRank) || compareGrades(pvpPart, targetRank))
            : compareGrades(perkRank, targetRank);
        } else {
          isMatch = isSplit
            ? (compareGrades(pvePart, targetQuery) || compareGrades(pvpPart, targetQuery))
            : (compareGrades(grade, targetQuery) || compareGrades(weaponRank, targetQuery) || compareGrades(perkRank, targetQuery));
        }
      }
    }

    if (isMatch) {
      // Let DIM's native search rules determine opacity (bright if matches DIM search, dimmed if not)
      item.style.removeProperty('opacity');
      item.style.removeProperty('filter');
      item.style.removeProperty('pointer-events');
    } else {
      // Force dimming because it failed the Aegis filter criteria
      item.style.setProperty('opacity', '0.15', 'important');
      item.style.setProperty('filter', 'grayscale(80%)', 'important');
      item.style.setProperty('pointer-events', 'none', 'important');
    }
  });
}

function getAegisFilterLabel(targetQuery: string): string {
  const q = targetQuery.toLowerCase().trim();
  if (q === '5/5' || q === 'perfect' || q === '5of5' || q === 'godroll') return t('perfectRollFilter');
  if (q === 'omni' || q === 'master' || q === 'allperks') return t('omniRollFilter');
  if (q === 'god') return t('godRolls');
  if (q === 'upgrade' || q === 'upgradeable') return t('upgradeable');
  if (q === 'chase') return t('chaseList');
  if (q === 'shopping' || q === 'shop') return t('shoppingList');
  if (q === 'shopping:high' || q === 'priority:1' || q === 'priority:high') return t('priorityHigh');
  if (q === 'shopping:ready') return t('statusReady');
  if (q === 'shopping:farm' || q === 'shopping:suboptimal') return t('statusSuboptimal');
  if (q === 'shopping:alt' || q === 'shopping:alternative') return t('viableAlternatives');
  if (q === 'bis' || q === 'bestinclass') return t('bestInClass');
  if (q === 'meta') return 'Meta Tier';

  if (q.startsWith('s:') || q.startsWith('source:')) {
    const src = q.startsWith('s:') ? q.substring(2) : q.substring(7);
    return `Source: ${src}`;
  }

  const parts = q.split(':');
  if (parts.length >= 2) {
    const type = parts[0];
    const rank = parts[parts.length - 1];
    const hasOp = q.includes('>=') || q.includes('<=');
    const op = hasOp ? (q.includes('>=') ? ' >= ' : ' <= ') : ' = ';
    const cleanRank = rank.replace(/>=/g, '').replace(/<=/g, '').toUpperCase();
    
    let typeLabel = 'Perk';
    if (type === 'w' || type === 'weapon') typeLabel = 'Weapon';
    else if (type === 'a' || type === 'armor') {
      if (q.includes('2p') || q.includes('2piece')) typeLabel = 'Armor 2pc';
      else if (q.includes('4p') || q.includes('4piece')) typeLabel = 'Armor 4pc';
      else typeLabel = 'Armor';
    }
    return `${typeLabel}${op}${cleanRank}`;
  }

  return q.toUpperCase();
}

function processCompletedAegisToken(searchInput: HTMLInputElement, val: string, aegisMatch: RegExpMatchArray) {
  const fullMatchText = aegisMatch[0];
  const targetQuery = aegisMatch[1].toLowerCase();

  activeAegisFilter = fullMatchText;
  activeAegisFilterLabel = getAegisFilterLabel(targetQuery);

  // Strip aegis: filter token from search input
  const newVal = val.replace(aegisMatch[0], '').replace(/\s+/g, ' ').trim();
  searchInput.value = newVal;

  renderAegisFilterPill();

  // Dispatch input event so DIM processes remaining text (e.g. is:handcannon)
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  evaluateAegisFiltering();
}

function setupSearchFilterObserver() {
  if (IS_WINNOWER_HOST) return; // DIM-only - see setupSearchWidget
  const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]') as HTMLInputElement;
  if (!searchInput) return;

  setupSearchWidget();

  if (searchInput.hasAttribute('data-aegis-search-observer')) return;
  searchInput.setAttribute('data-aegis-search-observer', 'true');

  searchInput.addEventListener('input', () => {
    let val = searchInput.value;
    
    // 1. Check if user typed a trailing space after an aegis: token (e.g. "aegis:god ")
    const spaceMatch = val.match(/\baegis:([a-z0-9+:-><=/]+)\s+/i);
    if (spaceMatch) {
      processCompletedAegisToken(searchInput, val, spaceMatch);
      return;
    }

    // 2. Check if user is actively typing an aegis: token (e.g. "aegis:g", "aegis:god")
    const liveMatch = val.match(/\baegis:([a-z0-9+:-><=/]+)/i);
    if (liveMatch) {
      const fullMatchText = liveMatch[0];
      const targetQuery = liveMatch[1].toLowerCase();
      
      activeAegisFilter = fullMatchText;
      activeAegisFilterLabel = getAegisFilterLabel(targetQuery);

      // Do NOT strip input text while user is typing! Live filter vault items
      evaluateAegisFiltering();
      return;
    }

    // 3. If there is no aegis: token in the input box and no active pill, clear filter state
    const searchWrapper = searchInput.parentElement;
    const hasPill = searchWrapper?.querySelector('.aegis-filter-pill');
    if (!hasPill) {
      activeAegisFilter = null;
      activeAegisFilterLabel = null;
    }

    // Run custom Aegis highlighting on all item elements
    evaluateAegisFiltering();
  });

  // Handle Enter / Tab keys to convert typed aegis: token into a pill
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const val = searchInput.value;
      const match = val.match(/\baegis:([a-z0-9+:-><=/]+)/i);
      if (match) {
        processCompletedAegisToken(searchInput, val, match);
      }
    }
  });

  // Handle input blur to convert typed aegis: token into a pill if complete
  searchInput.addEventListener('blur', () => {
    const val = searchInput.value;
    const match = val.match(/\baegis:([a-z0-9+:-><=/]+)/i);
    if (match) {
      processCompletedAegisToken(searchInput, val, match);
    }
  });
}

/**
 * Scans the page DOM for annotated item elements and processes them.
 */
function reprocessAllElements() {
  setupRegistryObserver();
  setupSearchFilterObserver();

  // Prune uninstanced detached items to prevent memory leaks across route changes
  for (const [key, items] of playerVaultInventory.entries()) {
    const valid = items.filter(item => item.instanceId || item.element.isConnected);
    if (valid.length === 0) {
      playerVaultInventory.delete(key);
    } else {
      playerVaultInventory.set(key, valid);
    }
  }

  const elements = document.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
  for (let i = 0; i < elements.length; i++) {
    processElement(elements[i]);
  }
  const explorerPanel = document.querySelector('.aegis-explorer-panel');
  if (explorerPanel && !explorerPanel.classList.contains('hidden')) {
    renderResults();
  }
  evaluateAegisFiltering();
}

// 1. Observe the DOM for additions or changes to 'data-aegis-item-hash' or 'data-aegis-perk-hashes'
// Mutations are batched and processed once per animation frame instead of
// running processElement + opacity sync for every single mutation record.
const pendingProcessTargets = new Set<HTMLElement>();
let processFlushScheduled = false;

function flushPendingProcessTargets() {
  processFlushScheduled = false;
  setupRegistryObserver();
  setupSearchFilterObserver();
  const targets = Array.from(pendingProcessTargets);
  pendingProcessTargets.clear();
  for (let i = 0; i < targets.length; i++) {
    if (targets[i].isConnected) {
      processElement(targets[i]);
    }
  }
  evaluateAegisFiltering();
  scheduleOpacityUpdate();
}

const observer = new MutationObserver((mutations) => {
  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i];

    // Check if the custom data attributes were modified
    if (
      mutation.type === 'attributes' &&
      (mutation.attributeName === 'data-aegis-item-hash' || mutation.attributeName === 'data-aegis-perk-hashes')
    ) {
      pendingProcessTargets.add(mutation.target as HTMLElement);
    }

    // Check for added nodes that might contain our attributes
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.hasAttribute('data-aegis-item-hash')) {
            pendingProcessTargets.add(node);
          }
          // Scan children
          const children = node.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
          children.forEach((child) => pendingProcessTargets.add(child));
        }
      });
      if (IS_WINNOWER_HOST && mutation.removedNodes.length > 0 && (pinnedRow || hoveredElement)) {
        scheduleTooltipAnchorCheck();
      }
    }
  }
  if (pendingProcessTargets.size > 0 && !processFlushScheduled) {
    processFlushScheduled = true;
    requestAnimationFrame(flushPendingProcessTargets);
  }
});

function startObserver() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    return;
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-aegis-item-hash', 'data-aegis-perk-hashes'],
  });
}
startObserver();

function getItemContainer(badge: HTMLElement): HTMLElement | null {
  const parent = badge.parentElement;
  if (!parent) return null;


  // Case A: The parent itself is the item container
  if (parent.hasAttribute('data-aegis-item-hash')) {
    return parent;
  }

  // Case B: The item container is a sibling inside the parent (e.g. parent is .item-drag-container)
  const siblingContainer = parent.querySelector('[data-aegis-item-hash]');
  if (siblingContainer) {
    return siblingContainer as HTMLElement;
  }

  // Case C: The item container is an ancestor of parent
  const ancestorContainer = parent.closest('[data-aegis-item-hash]');
  if (ancestorContainer) {
    return ancestorContainer as HTMLElement;
  }

  return null;
}

function updateBadgesOpacity() {
  const badges = document.querySelectorAll<HTMLElement>('.aegis-badge');
  const cache = new Map<HTMLElement, boolean>();

  const checkElementOrAncestorDimmed = (el: HTMLElement | null): boolean => {
    if (!el || el === document.body) return false;
    let cached = cache.get(el);
    if (cached !== undefined) return cached;

    const style = window.getComputedStyle(el);
    const opacity = parseFloat(style.opacity || '1');
    const filter = style.filter || '';
    let dimmed = opacity < 0.9 || filter.includes('opacity') || filter.includes('grayscale');

    if (!dimmed && el.parentElement) {
      dimmed = checkElementOrAncestorDimmed(el.parentElement);
    }

    cache.set(el, dimmed);
    return dimmed;
  };

  const checkSingleElementDimmed = (el: HTMLElement): boolean => {
    let cached = cache.get(el);
    if (cached !== undefined) return cached;

    const style = window.getComputedStyle(el);
    const opacity = parseFloat(style.opacity || '1');
    const filter = style.filter || '';
    const dimmed = opacity < 0.9 || filter.includes('opacity') || filter.includes('grayscale');

    cache.set(el, dimmed);
    return dimmed;
  };

  badges.forEach((badge) => {
    const parent = badge.parentElement;
    if (!parent) return;

    // 1. Check parent and walk up to document.body (detect parent card dimming)
    // Caches and short-circuits to avoid layout thrashing across multiple badges
    let isDimmed = checkElementOrAncestorDimmed(parent);

    // 2. Find the item container and check its direct children
    if (!isDimmed) {
      const container = getItemContainer(badge);
      if (container) {
        // A. Check container itself
        if (checkSingleElementDimmed(container)) {
          isDimmed = true;
        }

        // B. Check direct children of the container (e.g. the .item wrapper)
        if (!isDimmed) {
          const children = container.children;
          for (let i = 0; i < children.length; i++) {
            const child = children[i] as HTMLElement;
            if (child.classList.contains('aegis-badge')) continue;
            if (checkSingleElementDimmed(child)) {
              isDimmed = true;
              break;
            }
          }
        }
      }
    }

    // Apply or remove style overrides accordingly (skip DOM writes when the
    // state didn't change — each setProperty call forces a style recalc)
    const newState = isDimmed ? '1' : '0';
    if (badge.dataset.aegisDimmed === newState) return;
    badge.dataset.aegisDimmed = newState;
    if (isDimmed) {
      badge.style.setProperty('opacity', '0.25', 'important');
      badge.style.setProperty('filter', 'grayscale(0.8)', 'important');
    } else {
      badge.style.removeProperty('opacity');
      badge.style.removeProperty('filter');
    }
  });
}

// Run initial scan once script loads
reprocessAllElements();
if (!IS_WINNOWER_HOST) {
  updateBadgesOpacity();
}
setupRegistryObserver();

// Keep badge opacity in sync with React state updates — event-driven, not polled.
// DIM dims items by mutating class/style attributes, so watch for those changes
// near annotated items and recompute once per frame when they occur.
let opacityUpdateScheduled = false;

function scheduleOpacityUpdate() {
  if (IS_WINNOWER_HOST) return; // DIM-only: mirrors DIM's search-fade
  if (opacityUpdateScheduled) return;
  opacityUpdateScheduled = true;
  const tryRun = () => {
    // Defer while the page is actively scrolling: the badge dim state is not
    // perceivable mid-scroll, and running the getComputedStyle walk over every
    // badge each frame is expensive (13%+ of main thread in Firefox profiles).
    if (Date.now() - lastScrollTime < TOOLTIP_SCROLL_SUPPRESS_MS) {
      setTimeout(tryRun, 150);
      return;
    }
    opacityUpdateScheduled = false;
    updateBadgesOpacity();
  };
  tryRun();
}

const dimmingObserver = new MutationObserver((mutations) => {
  for (let i = 0; i < mutations.length; i++) {
    const target = mutations[i].target as HTMLElement;
    // Ignore our own badge style writes
    if (target.classList && target.classList.contains('aegis-badge')) continue;
    // Only care about changes on or around annotated item containers
    if (
      target.closest('[data-aegis-item-hash]') ||
      (target.querySelector && target.querySelector('.aegis-badge'))
    ) {
      scheduleOpacityUpdate();
      return;
    }
  }
});

function startDimmingObserver() {
  // Observes class/style mutations body-wide - a perf tax on Winnower, where
  // Tailwind class strings churn constantly - for DIM-only search-fade dimming.
  if (IS_WINNOWER_HOST) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startDimmingObserver, { once: true });
    return;
  }
  dimmingObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'style'],
    subtree: true,
  });
}
startDimmingObserver();

// Diagnostic logging framework
const diagnosticLogs: string[] = [];

function addDiagnosticLog(msg: string) {
  const time = new Date().toTimeString().split(' ')[0];
  const formatted = `[${time}] ${msg}`;
  diagnosticLogs.push(formatted);
  const content = document.querySelector('.aegis-diagnostic-logs-content');
  if (content) {
    content.textContent += `${formatted}\n`;
    content.scrollTop = content.scrollHeight;
  }
}

// Receive logs from main world context
document.addEventListener('aegis-diagnostic-log', (e: any) => {
  if (e.detail) {
    addDiagnosticLog(e.detail);
  }
});

// Setup initial log entry
addDiagnosticLog('Aegis isolated-world script initialized.');

/**
 * Creates and displays a premium glassmorphic toast notification on the page.
 */
function showAegisToast(msg: string) {
  const existing = document.querySelector('.aegis-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'aegis-toast';

  const textHtml = `<span class="aegis-toast-text">${msg}</span>`;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`${textHtml}`, 'text/html');
  toast.replaceChildren(...Array.from(doc.body.childNodes));

  document.body.appendChild(toast);

  // Trigger CSS animations
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Hide and remove elements after delay
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 450);
  }, 4500);
}

// Handle incoming messages from the background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'showToast') {
    showAegisToast(message.message);
  }
});

// Notify the background service worker that DIM is running
chrome.runtime.sendMessage({ action: 'dimLaunched' }).catch(() => {});


import { scoreWeapon } from './scorer';
import { WishlistDatabase, ScoringResult, AegisSheetDatabase, AegisSheetWeapon, TooltipPerk, AegisArmorSet } from './types';
import { showTooltip, hideTooltip, extractRecommendedMasterwork, renderViabilityMatrix, formatFormattedNotes } from './tooltip';
/** Safely sets element HTML using DOMParser (avoids innerHTML linter warning). */
function safeSetInnerHTML(element: HTMLElement, htmlString: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, 'text/html');
  element.replaceChildren(...Array.from(parsed.body.childNodes));
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
  if (!aegisSheetDb) return null;

  const db = (aegisArmorSource === 'aegis' && aegisSheetDb.armorAegis)
    ? aegisSheetDb.armorAegis
    : aegisSheetDb.armor;

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
let aegisDbMode = 'both';
let aegisTwoTier = false;
let aegisGradeDisplayMode: 'equipped' | 'dual' | 'potential' = 'equipped';
let aegisHoverEnabled = true;
let aegisArmorSource = 'lowco';
let aegisMode: 'pve' | 'pvp' = 'pve';
let lightggDb: Record<string, string> = {};
let aegisSheetDb: AegisSheetDatabase | null = null;
let hoveredElement: HTMLElement | null = null;
let registryObserver: MutationObserver | null = null;
let nameToHash: Record<string, number> = {};
let perkNameToIcon: Record<string, string> = {};
let activeDetailsTimeout: ReturnType<typeof setTimeout> | null = null;
let completedWeapons: Record<string, boolean> = {};
let chaseList: Record<string, {
  name: string;
  barrel: string;
  mag: string;
  perk1: string;
  perk1Alt1?: string;
  perk1Alt2?: string;
  perk2: string;
  perk2Alt1?: string;
  perk2Alt2?: string;
  origin?: string;
}> = {};
let activeTab = 'explorer';
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
const WEAPON_PERK_RETRY_DELAY_MS = 30_000;

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
          } catch (e) {
            // Ignore
          }
        }

        if (hoveredElement) {
          const result = (hoveredElement as any)._aegisResult as ScoringResult;
          const name = (hoveredElement as any)._aegisName as string;
          const perksMap = (hoveredElement as any)._aegisPerksMap as Record<number, { name: string; icon: string }>;
          const activeHashes = (hoveredElement as any)._aegisActiveHashes as number[];
          if (result && result.grade) {
            const sheetWeapon = (hoveredElement as any)._aegisSheetWeapon;
            const bestAlternative = (hoveredElement as any)._aegisBestAlternative;
            const isBestInClass = (hoveredElement as any)._aegisIsBestInClass;
            const sheetPerks = (hoveredElement as any)._aegisSheetPerks;

            const equippedMW = (hoveredElement as any)._aegisEquippedMasterwork;

            showTooltip(
              hoveredElement,
              result,
              name,
              perksMap,
              activeHashes,
              scoringSource === 'lightgg',
              sheetWeapon,
              bestAlternative,
              isBestInClass,
              sheetPerks,
              perkNameToIcon,
              null,
              equippedMW,
              aegisMode as any
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
            if (Array.isArray(results)) {
              for (const { name, possible, error } of results) {
                if (!name) continue;
                const norm = name.toLowerCase().trim();
                if (possible) {
                  failedWeaponRequests.delete(norm);
                  addDiagnosticLog(`Received perks response for "${name}" (Col3: ${possible.perk1s?.length || 0}, Col4: ${possible.perk2s?.length || 0}, Barrels: ${possible.barrels?.length || 0}, Mags: ${possible.mags?.length || 0}).`);
                  weaponPossiblePerksCache[norm] = possible;
                } else {
                  // Keep the spreadsheet fallback visible and retry only after a short
                  // cooldown, rather than immediately entering a render/request loop.
                  requestedWeapons.delete(norm);
                  failedWeaponRequests.set(norm, Date.now());
                  addDiagnosticLog(`Could not load perks for "${name}": ${error || 'unknown error'}`);
                }
              }
              renderResults();
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
  return name
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)\s+version$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)$/gi, '')
    .trim();
}

function findAegisWeapon(
  name: string,
  perksMap?: Record<number, { name: string; icon: string }>,
  activeHashes?: number[],
  elText?: string
): AegisSheetWeapon | null {
  if (!aegisSheetDb || !aegisSheetDb.weapons) return null;

  const normalized = name.split('\n')[0].trim().toLowerCase();
  const baseNormalized = cleanWeaponNameBase(normalized);

  // 1. Get variants array for this base weapon name
  const variants = aegisSheetDb.variants?.[baseNormalized] || [];

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
  return aegisSheetDb.weapons[normalized] || aegisSheetDb.weapons[baseNormalized] || (variants[0] ?? null);
}

function findWeaponCategory(weaponName: string): string {
  if (!aegisSheetDb || !aegisSheetDb.categories) return '';
  const norm = weaponName.split('\n')[0].trim().toLowerCase();
  const baseNorm = norm.replace(/\s*\([^)]+\)\s*$/, '').trim();
  for (const [tab, list] of Object.entries(aegisSheetDb.categories)) {
    if (list.some(w => {
      const n = w.name.toLowerCase();
      return n === norm || n === baseNorm;
    })) {
      return tab;
    }
  }
  return '';
}

function findSuperiors(categoryTab: string, currentEnergy: string, currentFrame: string) {
  if (!aegisSheetDb || !aegisSheetDb.categories || !categoryTab) {
    return { byEnergy: null, byFrame: null, byBoth: null };
  }
  const list = aegisSheetDb.categories[categoryTab] || [];
  const normEnergy = currentEnergy.toLowerCase().trim();
  const normFrame = currentFrame.toLowerCase().replace(/ frame$/, '').trim();

  const byEnergy = list.find(w => w.energy.toLowerCase().trim() === normEnergy) || null;
  const byFrame = list.find(w => w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame) || null;
  const byBoth = list.find(w => 
    w.energy.toLowerCase().trim() === normEnergy && 
    w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame
  ) || null;

  return { byEnergy, byFrame, byBoth };
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

    let foundPerk: { hash: number; name: string; icon: string; active: boolean } | null = null;
    
    // First pass: try to find an active matching perk
    for (const perk of availablePerks) {
      if (perk.active && isPerkMatch(perk.name, rec)) {
        foundPerk = perk;
        break;
      }
    }

    // Second pass: if no active match, try to find a selectable matching perk
    if (!foundPerk) {
      for (const perk of availablePerks) {
        if (isPerkMatch(perk.name, rec)) {
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
      // Capitalize the first letter of each word for missing perks
      const displayName = rawRec.replace(/\b\w/g, c => c.toUpperCase());
      const missingIcon = perkNameToIcon[rec] || perkNameToIcon[displayName.toLowerCase().trim()];
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
  sheetPerks: { matched: TooltipPerk[]; missing: TooltipPerk[] };
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
      sheetPerks: { matched: [], missing: [] }
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

  const categories: { type: TooltipPerk['type']; evals: EvaluatedPerk[] }[] = [
    { type: 'barrel', evals: barrelEvals },
    { type: 'mag', evals: magEvals },
    { type: 'perk1', evals: p1Evals },
    { type: 'perk2', evals: p2Evals },
    { type: 'origin', evals: originEvals },
  ];

  const selectablePerkNames: string[] = [];

  for (const cat of categories) {
    for (const perk of cat.evals) {
      const tooltipPerk: TooltipPerk = {
        name: perk.name,
        icon: perk.icon,
        matched: perk.matched,
        type: cat.type,
        status: perk.status,
      };

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

  let upgradeAdvice = '';
  const gradeOrder = ['F', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+'];
  const curIdx = gradeOrder.indexOf(currentGrade);
  const potIdx = gradeOrder.indexOf(potentialGrade);

  if (potIdx > curIdx && selectablePerkNames.length > 0) {
    const perksStr = selectablePerkNames.join(' or ');
    upgradeAdvice = `Upgrade available: Select ${perksStr} to rank up to ${potentialGrade}!`;
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
    },
    potentialGrade,
    upgradeAdvice,
    sheetPerks: { matched: matchedList, missing: missingList }
  };
}

/* ==========================================================================
   Aegis Database Explorer Slide-out Panel Injection & Controller Logic
   ========================================================================== */

function populateFramesFilter(selectedCat: string) {
  if (!aegisSheetDb) return;
  const frameSelect = document.querySelector('.aegis-explorer-frame-select') as HTMLSelectElement;
  if (!frameSelect) return;

  const prevValue = frameSelect.value;
  
  // Clear existing options except the first one ("All Frames")
  while (frameSelect.children.length > 1) {
    frameSelect.removeChild(frameSelect.lastChild!);
  }

  const frames = new Set<string>();
  
  if (selectedCat) {
    const list = aegisSheetDb.categories[selectedCat] || [];
    for (const w of list) {
      if (w.frame) {
        frames.add(w.frame.trim());
      }
    }
  } else {
    for (const w of Object.values(aegisSheetDb.weapons)) {
      if (w.frame) {
        frames.add(w.frame.trim());
      }
    }
  }

  const sortedFrames = Array.from(frames).sort();
  for (const frame of sortedFrames) {
    const opt = document.createElement('option');
    opt.value = frame;
    opt.textContent = frame;
    frameSelect.appendChild(opt);
  }

  // Restore selection if still valid
  if (frames.has(prevValue)) {
    frameSelect.value = prevValue;
  } else {
    frameSelect.value = '';
  }
}

function populateFilters() {
  if (!aegisSheetDb || !aegisSheetDb.categories) return;

  const catSelect = document.querySelector('.aegis-explorer-category-select') as HTMLSelectElement;
  const ammoSelect = document.querySelector('.aegis-explorer-ammo-select') as HTMLSelectElement;
  if (!catSelect) return;

  const prevCat = catSelect.value;
  const selectedAmmo = ammoSelect ? ammoSelect.value : '';

  // Clear existing category options except the first one ("All Categories")
  catSelect.innerHTML = '<option value="">All Categories</option>';

  const categories = Object.keys(aegisSheetDb.categories).sort();
  for (const cat of categories) {
    if (selectedAmmo) {
      const weaponAmmo = AMMO_TYPE_MAP[cat] || 'Other';
      if (weaponAmmo !== selectedAmmo) continue;
    }

    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  }

  // Restore selection if still valid/available
  const hasPrevCat = Array.from(catSelect.options).some(opt => opt.value === prevCat);
  if (hasPrevCat) {
    catSelect.value = prevCat;
  } else {
    catSelect.value = '';
  }

  populateFramesFilter(catSelect.value);
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
    progressText.textContent = `Completed: ${completedWeaponsCount}/${totalWeaponsCount} (${pct}%)`;
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
  const cleanRecs = recommendedList.map(r => r.toLowerCase().trim());
  const otherOptions = Array.from(globalSet)
    .filter(o => !cleanRecs.includes(o.toLowerCase().trim()))
    .sort();

  let html = `<option value="">Any</option>`;

  if (recommendedList.length > 0) {
    html += `
      <optgroup label="Recommended">
        ${recommendedList.map(r => `<option value="${r}" ${currentValue === r ? 'selected' : ''}>${r}</option>`).join('')}
      </optgroup>
    `;
  }

  if (otherOptions.length > 0) {
    html += `
      <optgroup label="All Others">
        ${otherOptions.map(o => `<option value="${o}" ${currentValue === o ? 'selected' : ''}>${o}</option>`).join('')}
      </optgroup>
    `;
  }

  return html;
}

function renderResults() {
  const resultsContainer = document.querySelector('.aegis-explorer-results') as HTMLElement;
  if (!resultsContainer) return;

  const db = aegisSheetDb;
  addDiagnosticLog(`renderResults called. activeTab: "${activeTab}". Has db: ${!!db}. Weapons count: ${db ? Object.keys(db.weapons || {}).length : 0}. Items in chaseList: ${JSON.stringify(Object.keys(chaseList))}`);

  if (!db || !db.weapons) {
    resultsContainer.innerHTML = '<div class="aegis-explorer-empty">Loading database...</div>';
    return;
  }

  try {
    // 1. CHASE LIST TAB RENDERER
    if (activeTab === 'chase') {
      updateProgressIndicator();
      let html = '';
      const items = Object.values(chaseList).sort((a, b) => a.name.localeCompare(b.name));

      if (items.length === 0) {
        resultsContainer.innerHTML = `
          <div class="aegis-explorer-empty" style="padding: 30px 15px; text-align: center; line-height: 1.5; color: #aaa;">
            Your chase list is empty.<br/><br/>
            Search for weapons in the <strong>Database Explorer</strong> tab and click <strong>+ Chase</strong> to pin them here!
          </div>
        `;
        return;
      }

      const pendingManifestRequests: string[] = [];
      for (const item of items) {
        try {
          const normName = item.name.toLowerCase().trim();
          const w = db.weapons[normName];
          const sourceStr = w?.source ? w.source : 'Unknown Source';

          const barrels = w ? parseRecommendations(w.barrel) : [];
          const mags = w ? parseRecommendations(w.mag) : [];
          const perk1s = w ? parseRecommendations(w.perk1) : [];
          const perk2s = w ? parseRecommendations(w.perk2) : [];
          const origins = w ? parseRecommendations(w.origin) : [];

          const possiblePerks = weaponPossiblePerksCache[normName];
          const hasManifestPerks = possiblePerks && possiblePerks.isFromManifest;
          addDiagnosticLog(`Loop item: "${item.name}". w exists: ${!!w}. possiblePerks exists: ${!!possiblePerks} (isFromManifest: ${!!hasManifestPerks}). requestedHas: ${requestedWeapons.has(normName)}`);

          const lastFailure = failedWeaponRequests.get(normName) || 0;
          const canRetryManifestRequest = Date.now() - lastFailure >= WEAPON_PERK_RETRY_DELAY_MS;
          if (!hasManifestPerks && !requestedWeapons.has(normName) && canRetryManifestRequest) {
            pendingManifestRequests.push(normName);
            addDiagnosticLog(`Cache miss (or partial cache) for "${item.name}". Queueing possible perks from manifest...`);
          }

          // When Fiber data isn't available yet, fall back to the weapon's own sheet entry
          // so we at least show the sheet-recommended options rather than every perk in the game.
          const sheetBarrels = new Set(barrels);
          const sheetMags = new Set(mags);
          const sheetPerk1sSet = new Set(perk1s);
          const sheetPerk2sSet = new Set(perk2s);
          const sheetOrigins = new Set(origins);

          // Manifest data can be incomplete for unusual sockets. Keep sheet recommendations
          // and the saved selection available rather than replacing them with an empty list.
          const mergeOptions = (recommended: Set<string>, manifest: string[] | undefined, selected: string | undefined) =>
            new Set([...recommended, ...(manifest || []), ...(selected ? [selected] : [])]);
          const barrelsSet = mergeOptions(sheetBarrels, possiblePerks?.barrels, item.barrel);
          const magsSet = mergeOptions(sheetMags, possiblePerks?.mags, item.mag);
          // Column-specific perk sets: perk1sSet for column 3, perk2sSet for column 4.
          const perk1sSet = mergeOptions(sheetPerk1sSet, possiblePerks?.perk1s, item.perk1);
          const perk2sSet = mergeOptions(sheetPerk2sSet, possiblePerks?.perk2s, item.perk2);
          const perk1Alt1Set = mergeOptions(sheetPerk1sSet, possiblePerks?.perk1s, item.perk1Alt1);
          const perk2Alt1Set = mergeOptions(sheetPerk2sSet, possiblePerks?.perk2s, item.perk2Alt1);
          const perk1Alt2Set = mergeOptions(sheetPerk1sSet, possiblePerks?.perk1s, item.perk1Alt2);
          const perk2Alt2Set = mergeOptions(sheetPerk2sSet, possiblePerks?.perk2s, item.perk2Alt2);
          const originsSet = mergeOptions(sheetOrigins, possiblePerks?.origins, item.origin);

          // Scan owned matching weapons
          const owned = Array.from(ownedItemsMap.values()).filter(oi => oi.name.toLowerCase().trim() === normName);
          const matches: string[] = [];

          for (const oi of owned) {
            let match = true;
            const failedSelections: string[] = [];

            const checkPerkMatch = (selectedPerk: string | undefined, label: string) => {
              if (!selectedPerk) return true;
              const norm = selectedPerk.toLowerCase().trim();
              const clean = cleanPerkName(selectedPerk);
              // 1. Fast path: hash lookup
              const targetHash = perkNameToHash[norm] ?? perkNameToHash[clean];
              if (targetHash !== undefined) {
                const hashMatch = oi.perkHashes.some(hash =>
                  hash === targetHash || enhancedToNormalMap[hash] === targetHash
                );
                if (hashMatch) return true;
              }
              // 2. Name comparison handles late registry hydration, enhanced traits,
              // and DIM display-name punctuation differences.
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
            } else if (failedSelections.length > 0) {
              addDiagnosticLog(`Chase match failed for "${item.name}" instance ${oi.instanceId}: ${failedSelections.join('; ')}`);
            }
          }

          let statusHtml = '';
          let highlightBtnHtml = '';
          if (owned.length === 0) {
            statusHtml = `<span class="aegis-chase-status aegis-status-none">Not in Inventory</span>`;
          } else if (matches.length > 0) {
            statusHtml = `<span class="aegis-chase-status aegis-status-match">Obtained (${matches.length} matching)</span>`;
            highlightBtnHtml = `<button class="aegis-action-btn" data-action="highlight-matching" data-ids="${matches.join(',')}" style="flex: none !important; height: 28px !important; padding: 0 10px !important; font-size: 11px !important; background: rgba(30, 215, 96, 0.08) !important; border: 1px solid rgba(30, 215, 96, 0.25) !important; color: #1ed760 !important; cursor: pointer !important; font-weight: 600 !important; border-radius: 6px !important;">Highlight in Vault</button>`;
          } else {
            statusHtml = `<span class="aegis-chase-status aegis-status-have-weapon">Have weapon, wrong perks</span>`;
          }

          const baseNameForReport = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
          const weaponHashForReport = nameToHash[normName] || nameToHash[baseNameForReport];
          let destinyReportBtnHtml = '';
          if (weaponHashForReport) {
            destinyReportBtnHtml = `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHashForReport}" target="_blank" rel="noopener noreferrer" style="flex: none !important; padding: 0 10px !important;">Destiny.Report ↗</a>`;
          } else {
            destinyReportBtnHtml = `<button class="aegis-action-btn aegis-btn-disabled" title="Weapon ID not resolved. Ensure the weapon is in your wishlist or has been viewed/scanned on screen in DIM." disabled style="flex: none !important; padding: 0 10px !important;">Destiny.Report (Unknown ID)</button>`;
          }
          const isExpanded = expandedChaseWeapons.has(normName);
          const isCompleted = !!completedWeapons[normName];
          html += `
            <div class="aegis-chase-row ${isExpanded ? 'expanded' : ''} ${isCompleted ? 'completed' : ''}" data-weapon-name="${item.name.replace(/"/g, '&quot;')}">
              <div class="aegis-chase-row-header">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="aegis-chase-chevron" style="font-size: 10px; color: #888; transition: transform 0.2s ease; display: inline-block;">▶</span>
                  <label class="aegis-checklist-toggle" style="display: flex; align-items: center; cursor: pointer;" title="Mark as obtained/completed">
                    <input type="checkbox" class="aegis-chase-completed-checkbox" ${isCompleted ? 'checked' : ''} style="margin: 0; cursor: pointer;" />
                  </label>
                  <span class="aegis-chase-name">${item.name}</span>
                </div>
                <button class="aegis-chase-delete" data-action="delete-chase" title="Remove from Chase List">&times;</button>
              </div>
              <div class="aegis-chase-meta">
                Source: ${sourceStr}
              </div>
              <div class="aegis-chase-selectors">
                <div class="aegis-chase-select-group">
                  <label>Barrel</label>
                  <select class="aegis-chase-select" data-type="barrel">
                    ${buildSelectHtml(item.barrel, barrels, barrelsSet)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Mag</label>
                  <select class="aegis-chase-select" data-type="mag">
                    ${buildSelectHtml(item.mag, mags, magsSet)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Slot A)</label>
                  <select class="aegis-chase-select" data-type="perk1">
                    ${buildSelectHtml(item.perk1, perk1s, perk1sSet)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Slot A)</label>
                  <select class="aegis-chase-select" data-type="perk2">
                    ${buildSelectHtml(item.perk2, perk2s, perk2sSet)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Slot B)</label>
                  <select class="aegis-chase-select" data-type="perk1Alt1">
                    ${buildSelectHtml(item.perk1Alt1 || '', perk1s, perk1Alt1Set)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Slot B)</label>
                  <select class="aegis-chase-select" data-type="perk2Alt1">
                    ${buildSelectHtml(item.perk2Alt1 || '', perk2s, perk2Alt1Set)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Slot C)</label>
                  <select class="aegis-chase-select" data-type="perk1Alt2">
                    ${buildSelectHtml(item.perk1Alt2 || '', perk1s, perk1Alt2Set)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Slot C)</label>
                  <select class="aegis-chase-select" data-type="perk2Alt2">
                    ${buildSelectHtml(item.perk2Alt2 || '', perk2s, perk2Alt2Set)}
                  </select>
                </div>

                <div class="aegis-chase-select-group span-2">
                  <label>Origin</label>
                  <select class="aegis-chase-select" data-type="origin">
                    ${buildSelectHtml(item.origin || '', origins, originsSet)}
                  </select>
                </div>
              </div>
              <div class="aegis-chase-status-row" style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                ${statusHtml}
                <div style="display: flex; gap: 6px; align-items: center;">
                  ${highlightBtnHtml}
                  ${destinyReportBtnHtml}
                </div>
              </div>
            </div>
          `;
        } catch (e: any) {
          addDiagnosticLog(`Error processing item "${item?.name}": ${e.message}\n${e.stack}`);
        }
      }

      // Send one batched request after every card has been inspected. The old
      // one-attribute-per-card approach overwrote earlier requests during a render.
      if (pendingManifestRequests.length > 0) {
        const registryEl = document.getElementById('aegis-global-perk-registry');
        if (registryEl) {
          const requestNames = [...new Set(pendingManifestRequests)];
          requestNames.forEach(name => requestedWeapons.add(name));
          registryEl.setAttribute('data-request-weapon-perks', JSON.stringify(requestNames));
        }
      }

      resultsContainer.innerHTML = html;
      // Bind Chase List event handlers
      const chaseRows = resultsContainer.querySelectorAll('.aegis-chase-row');
      chaseRows.forEach(row => {
        const name = row.getAttribute('data-weapon-name');
        if (!name) return;
        const norm = name.toLowerCase().trim();

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

      return;
    }

    // 2. EXPLORER DATABASE TAB RENDERER
    updateProgressIndicator();

    const searchInput = document.querySelector('.aegis-explorer-search-input') as HTMLInputElement;
    const catSelect = document.querySelector('.aegis-explorer-category-select') as HTMLSelectElement;
    const frameSelect = document.querySelector('.aegis-explorer-frame-select') as HTMLSelectElement;
    const elementSelect = document.querySelector('.aegis-explorer-element-select') as HTMLSelectElement;
    const ammoSelect = document.querySelector('.aegis-explorer-ammo-select') as HTMLSelectElement;
    const hideCompletedCheckbox = document.querySelector('.aegis-explorer-hide-completed') as HTMLInputElement | null;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedCat = catSelect ? catSelect.value : '';
    const selectedFrame = frameSelect ? frameSelect.value : '';
    const selectedElement = elementSelect ? elementSelect.value : '';
    const selectedAmmo = ammoSelect ? ammoSelect.value : '';
    const hideCompleted = hideCompletedCheckbox ? hideCompletedCheckbox.checked : false;

    const matches: { weapon: AegisSheetWeapon; category: string }[] = [];

    for (const [cat, list] of Object.entries(db.categories)) {
      if (selectedCat && cat !== selectedCat) continue;
      const weaponAmmo = AMMO_TYPE_MAP[cat] || 'Other';
      if (selectedAmmo && weaponAmmo !== selectedAmmo) continue;

      for (const w of list) {
        const normName = w.name.toLowerCase().trim();
        if (hideCompleted && completedWeapons[normName]) continue;
        if (selectedFrame && w.frame !== selectedFrame) continue;
        if (selectedElement && w.energy.toLowerCase().trim() !== selectedElement.toLowerCase().trim()) continue;
        if (query) {
          const nameMatch = w.name.toLowerCase().includes(query);
          const notesMatch = w.notes.toLowerCase().includes(query);
          const frameMatch = w.frame.toLowerCase().includes(query);
          const perksMatch = (w.perk1 + ' ' + w.perk2).toLowerCase().includes(query);
          if (!nameMatch && !notesMatch && !frameMatch && !perksMatch) continue;
        }
        matches.push({ weapon: w, category: cat });
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
      resultsContainer.innerHTML = '<div class="aegis-explorer-empty">No matching weapons found.</div>';
      return;
    }

    let html = '';
    for (const m of matches) {
      const w = m.weapon;
      const normName = w.name.toLowerCase().trim();
      const isCompleted = !!completedWeapons[normName];
      const completedClass = isCompleted ? 'completed' : '';
      
      const tierLetter = w.tier ? w.tier.charAt(0).toLowerCase() : '';
      const tierClass = `aegis-tier-${tierLetter}`;
      const rankLabel = w.rank ? (w.rank === '1' ? 'Best in Archetype' : `#${w.rank}`) : '-';

      const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
      const weaponHash = nameToHash[normName] || nameToHash[baseName];

      let destinyReportBtnHtml = '';
      if (weaponHash) {
        destinyReportBtnHtml = `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHash}" target="_blank" rel="noopener noreferrer">Destiny.Report ↗</a>`;
      } else {
        destinyReportBtnHtml = `<button class="aegis-action-btn aegis-btn-disabled" title="Weapon ID not resolved. Ensure the weapon is in your wishlist or has been viewed/scanned on screen in DIM." disabled>Destiny.Report (Unknown ID)</button>`;
      }

      const isChasing = !!chaseList[normName];
      const chaseText = isChasing ? 'Remove Chase' : '+ Chase';
      const chaseClass = isChasing ? 'aegis-btn-chase-active' : '';

      html += `
        <div class="aegis-explorer-row ${completedClass}" data-weapon-name="${w.name.replace(/"/g, '&quot;')}">
          <div class="aegis-explorer-row-header">
            <label class="aegis-checklist-toggle" style="display: flex; align-items: center; margin-right: 8px; cursor: pointer;" title="Mark as obtained/completed">
              <input type="checkbox" class="aegis-checklist-checkbox" ${isCompleted ? 'checked' : ''} style="margin: 0; cursor: pointer;" />
            </label>
            <span class="aegis-explorer-row-name">${w.name}</span>
            <div class="aegis-explorer-row-badges">
              <span class="aegis-explorer-row-badge ${tierClass}">${w.tier || 'F'}</span>
              <span class="aegis-explorer-row-rank">${rankLabel}</span>
            </div>
          </div>
          <div class="aegis-explorer-row-details">
            <span class="aegis-explorer-row-meta">${w.energy} / ${w.frame}</span>
            <span class="aegis-explorer-row-cat">${m.category}</span>
            ${w.source ? `<div class="aegis-explorer-row-source" style="margin-top: 4px; font-size: 11px; color: #ffd700;"><span style="color: #aaa; font-weight: 500;">Source:</span> ${w.source}</div>` : ''}
          </div>
          ${w.notes ? `<div class="aegis-explorer-row-notes">${w.notes}</div>` : ''}
          <div class="aegis-explorer-row-actions">
            <button class="aegis-action-btn aegis-btn-highlight" data-action="filter-vault">Filter in Vault</button>
            <button class="aegis-action-btn aegis-btn-chase ${chaseClass}" data-action="chase-weapon">${chaseText}</button>
            ${destinyReportBtnHtml}
          </div>
        </div>
      `;
    }

    resultsContainer.innerHTML = html;

    // Bind Explorer List event handlers
    const rows = resultsContainer.querySelectorAll('.aegis-explorer-row');
    rows.forEach((row) => {
      const name = row.getAttribute('data-weapon-name');
      if (!name) return;
      const norm = name.toLowerCase().trim();
      const w = db.weapons[norm];

      // Row expand listener
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.aegis-explorer-row-actions') || target.closest('.aegis-checklist-toggle')) {
          return;
        }
        
        // Accordion: collapse other rows
        rows.forEach((otherRow) => {
          if (otherRow !== row) {
            otherRow.classList.remove('expanded');
          }
        });

        row.classList.toggle('expanded');
      });

      // Checklist checkbox change listener
      const checkbox = row.querySelector('.aegis-checklist-checkbox') as HTMLInputElement;
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
          if (hideCompleted) {
            renderResults();
          }
        });
      }

      // Filter in Vault button listener
      const highlightBtn = row.querySelector('[data-action="filter-vault"]');
      highlightBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerDimSearch(norm);
      });

      // Toggle Chase button listener
      const chaseBtn = row.querySelector('[data-action="chase-weapon"]') as HTMLButtonElement;
      if (chaseBtn && w) {
        chaseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (chaseList[norm]) {
            delete chaseList[norm];
            chaseBtn.classList.remove('aegis-btn-chase-active');
            chaseBtn.textContent = '+ Chase';
          } else {
            const perk1s = parseRecommendations(w.perk1);
            const perk2s = parseRecommendations(w.perk2);

            chaseList[norm] = {
              name: w.name,
              // Trait rolls are the chase defaults.  Barrel, magazine, and origin
              // selections remain optional filters rather than silently rejecting
              // a weapon that has the requested trait pair.
              barrel: '',
              mag: '',
              perk1: perk1s[0] || '',
              perk1Alt1: '',
              perk1Alt2: '',
              perk2: perk2s[0] || '',
              perk2Alt1: '',
              perk2Alt2: '',
              origin: '',
            };
            chaseBtn.classList.add('aegis-btn-chase-active');
            chaseBtn.textContent = 'Remove Chase';
          }
          chrome.storage.local.set({ aegisChaseList: chaseList });
          renderResults();
        });
      }

      // Destiny.Report button listener
      const reportBtn = row.querySelector('.aegis-btn-report');
      if (reportBtn) {
        reportBtn.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
    });
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

function initAegisExplorer() {
  if (!document.body || document.querySelector('.aegis-fab')) return;

  const fab = document.createElement('div');
  fab.className = 'aegis-fab';
  fab.title = 'Open Aegis Database Explorer';
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
      <span class="aegis-explorer-title">Aegis Database Explorer</span>
      <button class="aegis-explorer-close" title="Close Explorer">&times;</button>
    </div>
    <div class="aegis-explorer-tabs">
      <button class="aegis-explorer-tab active" data-tab="explorer">Database Explorer</button>
      <button class="aegis-explorer-tab" data-tab="chase">My Chase List</button>
    </div>
    <div class="aegis-explorer-search-group">
      <input type="text" class="aegis-explorer-search-input" placeholder="Search weapon, notes, perks..." />
      <div class="aegis-explorer-selects">
        <select class="aegis-explorer-category-select">
          <option value="">All Categories</option>
        </select>
        <select class="aegis-explorer-frame-select">
          <option value="">All Frames</option>
        </select>
      </div>
      <div class="aegis-explorer-selects">
        <select class="aegis-explorer-element-select">
          <option value="">All Elements</option>
          <option value="Kinetic">Kinetic</option>
          <option value="Arc">Arc</option>
          <option value="Solar">Solar</option>
          <option value="Void">Void</option>
          <option value="Stasis">Stasis</option>
          <option value="Strand">Strand</option>
        </select>
        <select class="aegis-explorer-ammo-select">
          <option value="">All Ammo</option>
          <option value="Primary">Primary</option>
          <option value="Special">Special</option>
          <option value="Heavy">Heavy</option>
        </select>
      </div>
      <div class="aegis-explorer-sub-controls">
        <label class="aegis-explorer-checkbox-label">
          <input type="checkbox" class="aegis-explorer-hide-completed" />
          Hide Checked-off
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
      <div class="aegis-explorer-empty">Loading database...</div>
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
  const catSelect = panel.querySelector('.aegis-explorer-category-select');
  const frameSelect = panel.querySelector('.aegis-explorer-frame-select');
  const elementSelect = panel.querySelector('.aegis-explorer-element-select');
  const ammoSelect = panel.querySelector('.aegis-explorer-ammo-select');
  const hideCompletedCheckbox = panel.querySelector('.aegis-explorer-hide-completed');

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      populateFilters();
      renderResults();
    }
  });

  closeBtn?.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Tab switching setup
  const tabs = panel.querySelectorAll('.aegis-explorer-tab');
  const searchGroup = panel.querySelector('.aegis-explorer-search-group') as HTMLElement;
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab') || 'explorer';

      if (activeTab === 'chase') {
        if (searchGroup) searchGroup.style.display = 'none';
      } else {
        if (searchGroup) searchGroup.style.display = 'flex';
      }
      renderResults();
    });
  });

  const onUpdate = () => {
    renderResults();
  };

  searchInput?.addEventListener('input', onUpdate);
  catSelect?.addEventListener('change', () => {
    populateFramesFilter((catSelect as HTMLSelectElement).value);
    onUpdate();
  });
  frameSelect?.addEventListener('change', onUpdate);
  elementSelect?.addEventListener('change', onUpdate);
  ammoSelect?.addEventListener('change', () => {
    populateFilters();
    onUpdate();
  });
  hideCompletedCheckbox?.addEventListener('change', onUpdate);
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
        <!-- Slide 1: Welcome & What's New in v1.7.0 -->
        <div class="aegis-welcome-slide active" data-slide="0">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Getting Started & What's New in v1.7.1</span>
            <p class="tooltip-desc" style="font-size: 12.5px; line-height: 1.5; margin-top: 6px; margin-bottom: 10px;">
              This extension enhances Destiny Item Manager (DIM) by displaying meta spreadsheet weapon rankings, perk accuracy ratings, and custom armor set configurations directly on your items.
            </p>

            <div style="border: 1px solid rgba(255, 215, 0, 0.3); background: rgba(255, 215, 0, 0.05); padding: 10px 12px; border-radius: 8px; margin-bottom: 10px;">
              <div style="font-size: 10px; font-weight: 800; color: #ffd700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                <span>What's New in Release v1.7.1</span>
              </div>
              <ul style="font-size: 11px; line-height: 1.45; color: #e5e9f0; margin: 0; padding-left: 16px;">
                <li><strong>Perk Evaluation Basis & Dual Grade Badges (<span style="color: #ffd700;">F ➔ S+</span>):</strong> Evaluate weapon perk grades based on currently equipped perks, max potential rank, or both at once!</li>
                <li><strong>Armor Set Bonus Side Panels & Readability Cleanups:</strong> Armor set bonus cards now open as floating side panels next to DIM's item details modal for 100% UI consistency.</li>
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

// Load wishlist & config on startup
chrome.storage.local.get(['wishlistData', 'enhancedToNormal', 'scoringSource', 'lightggData', 'aegisSheetDb', 'perkRegistry', 'aegisLayoutSide', 'aegisDbMode', 'aegisMode', 'aegisTwoTier', 'aegisGradeDisplayMode', 'aegisHoverEnabled', 'aegisArmorSource', 'aegisCompletedWeapons', 'aegisChaseList', 'aegisWelcomeDismissed'], (res) => {
  wishlistDb = res.wishlistData || {};
  enhancedToNormalMap = res.enhancedToNormal || {};
  completedWeapons = res.aegisCompletedWeapons || {};
  chaseList = res.aegisChaseList || {};
  scoringSource = res.scoringSource || 'aegis';
  aegisLayoutSide = res.aegisLayoutSide || 'side';
  aegisDbMode = res.aegisDbMode || 'both';
  aegisMode = res.aegisMode || 'pve';
  aegisTwoTier = res.aegisTwoTier || false;
  aegisGradeDisplayMode = res.aegisGradeDisplayMode || 'equipped';
  aegisHoverEnabled = res.aegisHoverEnabled !== false;
  aegisArmorSource = res.aegisArmorSource || 'lowco';
  lightggDb = res.lightggData || {};
  aegisSheetDb = res.aegisSheetDb || null;
  if (clearLegacyDefaultChaseFilters()) {
    chrome.storage.local.set({ aegisChaseList: chaseList });
  }
  updateNameToHashFromWishlist();
  updatePerkNameToIcon(res.perkRegistry || {});
  updatePerkNameToHash(res.perkRegistry || {});
  reprocessAllElements();
  initAegisExplorer();

  if (!res.aegisWelcomeDismissed) {
    showWelcomeModal();
  }
});

// Watch for changes in storage (e.g. manual sync from settings popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    let changed = false;
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
    if (changes.aegisDbMode) {
      aegisDbMode = changes.aegisDbMode.newValue || 'both';
      changed = true;
    }
    if (changes.aegisMode) {
      aegisMode = changes.aegisMode.newValue || 'pve';
      changed = true;
    }
    if (changes.aegisTwoTier) {
      aegisTwoTier = changes.aegisTwoTier.newValue || false;
      changed = true;
    }
    if (changes.aegisGradeDisplayMode) {
      aegisGradeDisplayMode = changes.aegisGradeDisplayMode.newValue || 'equipped';
      changed = true;
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
      if (clearLegacyDefaultChaseFilters()) {
        chrome.storage.local.set({ aegisChaseList: chaseList });
      }
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

function handleMouseEnter(e: MouseEvent) {
  if (!aegisHoverEnabled) return;

  const el = e.currentTarget as HTMLElement;
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

    const result = (el as any)._aegisResult as ScoringResult;
    const name = (el as any)._aegisName as string;
    const perksMap = (el as any)._aegisPerksMap as Record<number, { name: string; icon: string }>;
    const activeHashes = (el as any)._aegisActiveHashes as number[];

    if (result && result.grade) {
      const sheetWeapon = (el as any)._aegisSheetWeapon;
      const bestAlternative = (el as any)._aegisBestAlternative;
      const isBestInClass = (el as any)._aegisIsBestInClass;
      const sheetPerks = (el as any)._aegisSheetPerks;
      const sheetArmor = (el as any)._aegisSheetArmor;

      const equippedMW = (el as any)._aegisEquippedMasterwork;

      showTooltip(
        el,
        result,
        name,
        perksMap,
        activeHashes,
        scoringSource === 'lightgg',
        sheetWeapon,
        bestAlternative,
        isBestInClass,
        sheetPerks,
        perkNameToIcon,
        sheetArmor,
        equippedMW,
        aegisMode as any
      );
    }
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
  hideTooltip();
}

/**
 * Injects a detailed grade summary block into the DIM item popup header.
 */
function injectPopupSummary(
  popupContainer: HTMLElement,
  result: ScoringResult,
  scoringSource: string,
  sheetWeapon?: AegisSheetWeapon,
  sheetPerks?: { matched: TooltipPerk[]; missing: TooltipPerk[] },
  sheetArmor?: AegisArmorSet | null,
  equippedMasterwork?: string
) {
  const titleEl = popupContainer.querySelector('h1, [class*="title"]');
  if (!titleEl) return;

  const header = titleEl.parentElement;
  if (!header) return;

  // Cancel any pending details card injection timeouts
  if (activeDetailsTimeout) {
    clearTimeout(activeDetailsTimeout);
    activeDetailsTimeout = null;
  }

  // Clean up any previously injected details card
  popupContainer.querySelectorAll('[data-aegis-details="true"]').forEach((el) => el.remove());

  let summaryEl = popupContainer.querySelector('.aegis-popup-summary') as HTMLDivElement | null;
  if (!result.grade) {
    if (summaryEl) summaryEl.remove();
    return;
  }

  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.className = 'aegis-popup-summary';
    titleEl.insertAdjacentElement('afterend', summaryEl);
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

    // Inject armor detail card as a side panel next to DIM details modal
    const insertArmorCard = () => {
      if (!popupContainer.isConnected) return;
      if (popupContainer.querySelector('[data-aegis-details="true"]')) return;

      const insertTarget = popupContainer.querySelector(
        '[class*="sockets" i], [class*="Sockets" i], [class*="item-details" i], [class*="ItemDetails" i], [class*="main-content" i], [class*="body" i], [class*="content" i]'
      ) || summaryEl;

      if (insertTarget) {
        const detailsCard = document.createElement('div');
        detailsCard.className = 'aegis-popup-details-card';
        detailsCard.setAttribute('data-aegis-details', 'true');

        safeSetInnerHTML(
          detailsCard,
          `
          <div class="aegis-details-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span>LowCo Armor Set Bonuses</span>
            ${sheetArmor.source ? `<span class="aegis-details-source-badge" style="font-size: 10px; font-weight: 500; color: #ffd700; background: rgba(255, 215, 0, 0.08); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.2); font-family: sans-serif; letter-spacing: 0.1px;">Source: ${sheetArmor.source}</span>` : ''}
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

        const isSheet = popupContainer.matches('[class*="Sheet"], [class*="sheet"]');
        const rect = popupContainer.getBoundingClientRect();
        const spaceLeft = rect.left;
        const spaceRight = window.innerWidth - rect.right;

        if (aegisLayoutSide === 'side' && window.innerWidth >= 1000 && (isSheet || spaceLeft >= 330 || spaceRight >= 330)) {
          detailsCard.classList.add('aegis-side-panel');
          popupContainer.appendChild(detailsCard);

          detailsCard.style.setProperty('position', 'absolute', 'important');
          detailsCard.style.setProperty('top', '55px', 'important');

          if (isSheet || (spaceLeft >= spaceRight && spaceLeft >= 330)) {
            detailsCard.style.setProperty('left', '-320px', 'important');
            detailsCard.style.setProperty('right', 'auto', 'important');
          } else if (spaceRight >= 330) {
            detailsCard.style.setProperty('left', 'auto', 'important');
            detailsCard.style.setProperty('right', '-320px', 'important');
          } else {
            detailsCard.classList.remove('aegis-side-panel');
            detailsCard.style.removeProperty('position');
            detailsCard.style.removeProperty('top');
            detailsCard.style.removeProperty('left');
            detailsCard.style.removeProperty('right');
            insertTarget.after(detailsCard);
          }
        } else {
          detailsCard.classList.remove('aegis-side-panel');
          detailsCard.style.removeProperty('position');
          detailsCard.style.removeProperty('top');
          detailsCard.style.removeProperty('left');
          detailsCard.style.removeProperty('right');
          insertTarget.after(detailsCard);
        }
      }
    };

    insertArmorCard();
    setTimeout(insertArmorCard, 100);
    setTimeout(insertArmorCard, 250);
    return;
  }

  const baseGradeLetter = result.grade.charAt(0).toLowerCase();
  const gradeClass = `aegis-grade-${baseGradeLetter}`;
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

  const matchLabel = isLightGG
    ? 'Light.gg Roll Appraisal'
    : `Wishlist Match: <strong class="${gradeClass}">${result.matchPercentage}%</strong>`;

  // Look up Aegis Master spreadsheet metadata
  const weaponName = titleEl.querySelector('span')?.textContent?.trim() || titleEl.textContent?.trim() || '';

  let sheetMetaHtml = '';
  if (sheetWeapon) {
    const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
    const tierClass = `aegis-tier-${tierLetter}`;
    const rankLabel = sheetWeapon.rank ? `Rank #${sheetWeapon.rank} in Category` : '';

    sheetMetaHtml = `
      <div class="aegis-popup-meta-divider"></div>
      <div class="aegis-popup-meta-content">
        <div class="aegis-popup-row">
          <span class="aegis-popup-meta-badge ${tierClass}">${sheetWeapon.tier} Tier</span>
          ${rankLabel ? `<span class="aegis-popup-meta-rank">${rankLabel}</span>` : ''}
        </div>
        ${sheetWeapon.notes ? `<div class="aegis-popup-notes-text aegis-meta-notes"><strong>Aegis Meta:</strong> ${sheetWeapon.notes}</div>` : ''}
      </div>
    `;
  }

  const gradeStr = result.grade || '';
  const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
  const popupBaseGradeLetter = isTwoTier 
    ? gradeStr.substring(1).charAt(0).toLowerCase() 
    : baseGradeLetter;
  const wideClass = isTwoTier ? 'aegis-popup-grade-badge-wide' : '';

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

  // If we have sheet data, also inject detailed overview cards below perks grid
  if (sheetWeapon) {
    const categoryTab = findWeaponCategory(weaponName);
    const superiors = findSuperiors(categoryTab, sheetWeapon.energy, sheetWeapon.frame);

    // Find insertion target: Display perks button or sockets element
    const perksBtn = popupContainer.querySelector('button[title*="perks" i], button[title*="Perks" i]');
    const perksSection = perksBtn?.parentElement;
    const sockets = popupContainer.querySelector('[class*="sockets" i], [class*="Sockets" i]');
    const insertTarget = perksSection || sockets;

    if (insertTarget) {
      // Create a single unified details card
      const detailsCard = document.createElement('div');
      detailsCard.className = 'aegis-popup-details-card';
      detailsCard.setAttribute('data-aegis-details', 'true');

      let perksRowsHtml = '';
      const items = [
        { label: 'Barrel', type: 'barrel', rawVal: sheetWeapon.barrel },
        { label: 'Mag', type: 'mag', rawVal: sheetWeapon.mag },
        { label: 'Perk 1', type: 'perk1', rawVal: sheetWeapon.perk1 },
        { label: 'Perk 2', type: 'perk2', rawVal: sheetWeapon.perk2 },
        { label: 'Origin', type: 'origin', rawVal: sheetWeapon.origin },
      ];

      for (const item of items) {
        if (!item.rawVal) continue;
        
        let chipsHtml = '';
        if (sheetPerks) {
          const matched = sheetPerks.matched.filter(p => p.type === item.type);
          const missing = sheetPerks.missing.filter(p => p.type === item.type);

          for (const perk of matched) {
            const statusClass = perk.status === 'active' ? 'aegis-chip-active' : 'aegis-chip-selectable';
            const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : '';
            const statusLabel = perk.status === 'active' ? '' : ' (Selectable)';
            chipsHtml += `
              <span class="aegis-perk-chip ${statusClass}" title="${perk.name}${statusLabel}">
                ${iconHtml}
                <span class="aegis-chip-name">${perk.name}</span>
              </span>
            `;
          }

          for (const perk of missing) {
            const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : '';
            chipsHtml += `
              <span class="aegis-perk-chip aegis-chip-missing" title="${perk.name} (Missing)">
                ${iconHtml}
                <span class="aegis-chip-name">${perk.name}</span>
              </span>
            `;
          }
        }

        if (!chipsHtml) {
          // Parse and sanitize item.rawVal: split by slash/newline, trim whitespace, and join with ' / '.
          // Optimized implementation avoids intermediate array allocations and regex overhead.
          let cleanVal = '';
          let start = 0;
          const rawVal = item.rawVal;
          const len = rawVal.length;
          for (let i = 0; i <= len; i++) {
            const char = i < len ? rawVal[i] : '\n';
            if (char === '/' || char === '\n') {
              if (start < i) {
                // Find trimmed boundaries within [start, i) to avoid allocating untrimmed substrings
                let tStart = start;
                let tEnd = i - 1;
                while (tStart <= tEnd && rawVal.charCodeAt(tStart) <= 32) {
                  tStart++;
                }
                while (tEnd >= tStart && rawVal.charCodeAt(tEnd) <= 32) {
                  tEnd--;
                }
                if (tStart <= tEnd) {
                  const part = rawVal.substring(tStart, tEnd + 1);
                  if (cleanVal) {
                    cleanVal += ' / ' + part;
                  } else {
                    cleanVal = part;
                  }
                }
              }
              start = i + 1;
            }
          }

          if (!cleanVal) continue;
          chipsHtml = `<span class="aegis-details-value-text">${cleanVal}</span>`;
        }

        perksRowsHtml += `
          <div class="aegis-details-row aegis-perk-row">
            <span class="aegis-details-label">${item.label}</span>
            <div class="aegis-details-value aegis-details-chips-container">
              ${chipsHtml}
            </div>
          </div>
        `;
      }

      // Extract recommended Masterworks
      const recMWs: string[] = [];
      let rawMW = sheetWeapon.mw ? sheetWeapon.mw.trim() : null;
      if (rawMW && rawMW !== '-') {
        const parts = rawMW.split(/[\/\n\\]/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed) recMWs.push(trimmed);
        }
      }
      if (recMWs.length === 0) {
        const notesText = (sheetWeapon.notes || '') + ' ' + (result.notes || '') + ' ' + (result.wishlistNotes || '');
        const foundMW = extractRecommendedMasterwork(notesText);
        if (foundMW) {
          const parts = foundMW.split(/[\/\n\\]/);
          for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed) recMWs.push(trimmed);
          }
        }
      }

      if (recMWs.length > 0) {
        let mwChipsHtml = '';
        const eqMW = (equippedMasterwork || '').toLowerCase();

        for (const mw of recMWs) {
          const mwLower = mw.toLowerCase();
          // Fuzzy match: "Reload" matches "Reload Speed", "Range" matches "Range", etc.
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
          let title = `Aegis recommends: ${mw}`;

          if (isMatch) {
            // MATCHED: Luminous gold gradient + checkmark + outer glow + bright white text
            chipStyle.push(
              'background: linear-gradient(135deg, rgba(255, 215, 0, 0.35), rgba(255, 140, 0, 0.25)) !important',
              'border: 1.5px solid #ffd700 !important',
              'color: #ffffff !important',
              'text-shadow: 0 0 6px rgba(255, 215, 0, 0.8) !important',
              'box-shadow: 0 0 10px rgba(255, 191, 0, 0.65), inset 0 0 4px rgba(255, 255, 255, 0.2) !important'
            );
            icon = '✓';
            title = `✓ You have this Masterwork equipped!`;
          } else {
            // UNMATCHED: Muted dashed amber chip
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

        perksRowsHtml += `
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

        if (sheetWeapon.energy) addUniqueSup(sheetWeapon.energy, superiors.byEnergy);
        if (sheetWeapon.frame) addUniqueSup(sheetWeapon.frame, superiors.byFrame);
        if (sheetWeapon.energy && sheetWeapon.frame) {
          addUniqueSup(`${sheetWeapon.energy} ${sheetWeapon.frame}`, superiors.byBoth);
        }

        let supRowsHtml = '';
        for (const item of uniqueSups.values()) {
          const isSelf = item.weapon.name.toLowerCase() === sheetWeapon.name.toLowerCase();
          const selfClass = isSelf ? 'aegis-sup-self' : '';
          const labelsStr = item.labels.join(' / ');
          
          const tierLetter = item.weapon.tier ? item.weapon.tier.charAt(0).toLowerCase() : '';
          const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${item.weapon.tier}</span>`;
          const rankHtml = item.weapon.rank ? `<span class="aegis-sup-rank-num">#${item.weapon.rank}</span>` : '';
          const currentLabel = isSelf ? '<span class="aegis-current-badge">(Current)</span>' : '';

          supRowsHtml += `
            <div class="aegis-details-row aegis-sup-row ${isSelf ? 'aegis-sup-row-self' : ''}">
              <span class="aegis-details-label aegis-sup-type-label" title="${labelsStr}">${labelsStr}</span>
              <span class="aegis-sup-name ${selfClass}">${item.weapon.name}${currentLabel}</span>
              <div class="aegis-sup-rank-group">
                ${tierBadgeHtml}
                ${rankHtml}
              </div>
            </div>
          `;
        }

        const currentWeaponKey = sheetWeapon.name.toLowerCase();
        if (!uniqueSups.has(currentWeaponKey)) {
          const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
          const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${sheetWeapon.tier}</span>`;
          const rankHtml = sheetWeapon.rank ? `<span class="aegis-sup-rank-num">#${sheetWeapon.rank}</span>` : '';

          supRowsHtml += `
            <div class="aegis-details-row aegis-sup-row aegis-sup-row-self">
              <span class="aegis-details-label aegis-sup-type-label" title="Current Weapon">Current Weapon</span>
              <span class="aegis-sup-name aegis-sup-self">${sheetWeapon.name}<span class="aegis-current-badge">(Current)</span></span>
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
            <div class="aegis-details-header" style="margin-top: 10px;">Best in Category (${categoryTab})</div>
            <div class="aegis-details-body">
              ${supRowsHtml}
            </div>
          `;
        }
      }

      let exoticViabilityHtml = '';
      if (sheetWeapon.exoticViability || sheetWeapon.notes || sheetWeapon.description) {
        const matrixHtml = sheetWeapon.exoticViability ? renderViabilityMatrix(sheetWeapon.exoticViability, aegisMode) : '';
        const tagsBadge = sheetWeapon.exoticViability?.tags 
          ? `<span style="font-size: 10px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.2);">${sheetWeapon.exoticViability.tags.toUpperCase()}</span>` 
          : '';
        const tierBadgeLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
        const tierBadgeHtml = sheetWeapon.tier 
          ? `<span class="aegis-mini-tier-badge aegis-badge-${tierBadgeLetter}" style="font-size: 11px; padding: 2px 8px; font-weight: 800;">${sheetWeapon.tier} Tier</span>` 
          : '';

        let analysisBlock = '';
        if (sheetWeapon.notes) {
          analysisBlock = `
            <div style="margin-top: 6px; background: rgba(0, 0, 0, 0.25); border-left: 3px solid #ebcb8b; border-radius: 0 6px 6px 0; padding: 6px 9px;">
              <div style="font-size: 9.5px; font-weight: 700; color: #ebcb8b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;">Strategic Analysis</div>
              <div style="font-size: 11px; line-height: 1.55; color: #d8dee9;">${formatFormattedNotes(sheetWeapon.notes)}</div>
            </div>
          `;
        }

        let mechanicsBlock = '';
        if (sheetWeapon.description) {
          mechanicsBlock = `
            <div style="margin-top: 6px; background: rgba(0, 0, 0, 0.25); border-left: 3px solid #88c0d0; border-radius: 0 6px 6px 0; padding: 6px 9px;">
              <div style="font-size: 9.5px; font-weight: 700; color: #88c0d0; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;">Exotic Mechanics</div>
              <div style="font-size: 11px; line-height: 1.55; color: #d8dee9;">${formatFormattedNotes(sheetWeapon.description)}</div>
            </div>
          `;
        }

        exoticViabilityHtml = `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            ${tierBadgeHtml}
            ${tagsBadge}
          </div>
          ${matrixHtml}
          ${analysisBlock}
          ${mechanicsBlock}
        `;
      }

      if (perksRowsHtml || superiorsHtml || exoticViabilityHtml) {
        const cardHeaderTitle = sheetWeapon.exoticViability 
          ? (aegisMode === 'pvp' ? 'Finnald Exotic Analysis (PvP)' : 'Aegis Exotic Analysis') 
          : (aegisMode === 'pvp' ? 'Finnald Recommended Perks (PvP)' : 'Aegis Recommended Perks');

        safeSetInnerHTML(
          detailsCard,
          `
          <div class="aegis-details-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span>${cardHeaderTitle}</span>
            ${sheetWeapon.source ? `<span class="aegis-details-source-badge" style="font-size: 10px; font-weight: 500; color: #ffd700; background: rgba(255, 215, 0, 0.08); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.2); font-family: sans-serif; letter-spacing: 0.1px;">Source: ${sheetWeapon.source}</span>` : ''}
          </div>
          <div class="aegis-details-body aegis-perks-body" style="margin-bottom: ${superiorsHtml ? '10px' : '0'};">
            ${exoticViabilityHtml}
            ${perksRowsHtml}
          </div>
          ${superiorsHtml}
        `
        );
        
        activeDetailsTimeout = setTimeout(() => {
          activeDetailsTimeout = null;
          const isSheet = popupContainer.matches('[class*="Sheet"], [class*="sheet"]');
          const rect = popupContainer.getBoundingClientRect();
          const spaceLeft = rect.left;
          const spaceRight = window.innerWidth - rect.right;

          if (aegisLayoutSide === 'side' && window.innerWidth >= 1000 && (isSheet || spaceLeft >= 330 || spaceRight >= 330)) {
            detailsCard.classList.add('aegis-side-panel');
            popupContainer.appendChild(detailsCard);
            
            detailsCard.style.setProperty('position', 'absolute', 'important');
            detailsCard.style.setProperty('top', '55px', 'important');
            
            if (isSheet || (spaceLeft >= spaceRight && spaceLeft >= 330)) {
              detailsCard.style.setProperty('left', '-320px', 'important');
              detailsCard.style.setProperty('right', 'auto', 'important');
            } else if (spaceRight >= 330) {
              detailsCard.style.setProperty('left', 'auto', 'important');
              detailsCard.style.setProperty('right', '-320px', 'important');
            } else {
              // Fallback to inline if neither side has enough space
              detailsCard.classList.remove('aegis-side-panel');
              detailsCard.style.removeProperty('position');
              detailsCard.style.removeProperty('top');
              detailsCard.style.removeProperty('left');
              detailsCard.style.removeProperty('right');
              insertTarget.after(detailsCard);
            }
          } else {
            detailsCard.classList.remove('aegis-side-panel');
            detailsCard.style.removeProperty('position');
            detailsCard.style.removeProperty('top');
            detailsCard.style.removeProperty('left');
            detailsCard.style.removeProperty('right');
            insertTarget.after(detailsCard);
          }
        }, 50);
      }
    }
  }
}

/**
 * Injects or updates the Aegis rank badge overlay inside a weapon tile.
 */
function injectBadge(el: HTMLElement, result: ScoringResult) {
  // Never inject badges inside popup toolbars, tag controls, or stat rows
  if (el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup') &&
      !el.matches('[id^="item-"], [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"], [class*="item-tile"], .item-tile, .item')) {
    removeBadge(el);
    return;
  }

  // Deduplicate: Find root item container to ensure EXACTLY 1 badge per item tile in DIM Stable and Beta
  const itemContainer = (el.closest('[data-aegis-item-hash]') as HTMLElement) || el;
  let badgeTarget = itemContainer.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"]') as HTMLElement | null;
  if (!badgeTarget) {
    badgeTarget = itemContainer;
  }
  // Ensure the badge target is relatively positioned so the absolute badge is anchored to it
  badgeTarget.style.setProperty('position', 'relative', 'important');

  // Handle S-tier gold glow class on the badge target
  if (result.grade && result.grade.startsWith('S')) {
    badgeTarget.classList.add('aegis-gold-glow');
  } else {
    badgeTarget.classList.remove('aegis-gold-glow');
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
  const isDual = gradeStr.includes('➔');
  const isArmor = gradeStr.includes('/');
  const isTwoTier = !isArmor && (gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-')));

  let baseLetter = '';
  if (isArmor) {
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
  if (isTwoTier || isArmor || isDual) {
    badge.classList.add('aegis-badge-wide');
  }
  if (isDual) {
    badge.classList.add('aegis-badge-dual');
  }
  badge.textContent = gradeStr;

  if (result.upgradeAvailable) {
    const upgradeArrow = document.createElement('span');
    upgradeArrow.className = 'aegis-badge-upgrade-arrow';
    upgradeArrow.textContent = '▲';
    badge.appendChild(upgradeArrow);
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

      (el as any)._aegisResult = result;
      (el as any)._aegisName = weaponName;
      (el as any)._aegisSheetArmor = sheetArmor;

      if (result.grade) {
        const isPopup = el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');

        if (!isPopup) {
          injectBadge(el, result);
        }

        const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
        if (popupContainer) {
          injectPopupSummary(popupContainer as HTMLElement, result, scoringSource, undefined, undefined, sheetArmor);
        }

        if (!isPopup && !el.hasAttribute('data-aegis-listeners')) {
          el.addEventListener('mouseenter', handleMouseEnter);
          el.addEventListener('mouseleave', handleMouseLeave);
          el.setAttribute('data-aegis-listeners', 'true');
        }
      } else {
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
    const elText = el.textContent || '';
    const sheetWeapon = findAegisWeapon(weaponName, perksMap, activeHashes, elText);
    let bestAlternative = undefined;
    let isBestInClass = false;

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
      const categoryTab = findWeaponCategory(weaponName);
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

    // Attach data on the element object for hover events to retrieve
    (el as any)._aegisResult = result;
    (el as any)._aegisName = weaponName;
    (el as any)._aegisPerksMap = perksMap;
    (el as any)._aegisActiveHashes = activeHashes;
    (el as any)._aegisSheetWeapon = hasSheetData ? sheetWeapon : null;
    (el as any)._aegisBestAlternative = bestAlternative;
    (el as any)._aegisIsBestInClass = isBestInClass;
    (el as any)._aegisSheetPerks = hasSheetData ? sheetPerks : null;
    (el as any)._aegisEquippedMasterwork = equippedMasterwork || null;

    if (result.grade) {
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

        if (aegisTwoTier && hasSheetData && sheetWeapon && sheetWeapon.tier) {
          const archetypeTier = sheetWeapon.tier.trim();
          result.grade = `${archetypeTier}${displayRollGrade}`;
        } else {
          result.grade = displayRollGrade;
        }
      }

      const isPopup = el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      const isItemTile = el.matches('[id^="item-"], [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"], [class*="item-tile"], .item-tile, .item');

      // Inject rank badge (only if it's a valid item tile and NOT the popup container itself)
      if (!isPopup && isItemTile) {
        injectBadge(el, result);
      } else if (!isPopup) {
        removeBadge(el);
      }

      // Inject popup summary card if inside a details popup (or if we are the popup container)
      const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (popupContainer) {
        injectPopupSummary(popupContainer as HTMLElement, result, scoringSource, sheetWeapon || undefined, sheetPerks, undefined, equippedMasterwork);
      }

      // Attach event listeners for hover tooltips (only for valid item tiles)
      if (!isPopup && isItemTile && !el.hasAttribute('data-aegis-listeners')) {
        el.addEventListener('mouseenter', handleMouseEnter);
        el.addEventListener('mouseleave', handleMouseLeave);
        el.setAttribute('data-aegis-listeners', 'true');
      } else if (!isItemTile && el.hasAttribute('data-aegis-listeners')) {
        el.removeEventListener('mouseenter', handleMouseEnter);
        el.removeEventListener('mouseleave', handleMouseLeave);
        el.removeAttribute('data-aegis-listeners');
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

  const match = queryStr.match(/^([><]=?|==?)(.+)$/);
  
  if (match) {
    const op = match[1];
    const targetRank = match[2].trim();
    const valItem = GRADE_VALUES[normalizedGrade] ?? 0;
    const valTarget = GRADE_VALUES[targetRank] ?? 0;
    
    if (op === '>=') return valItem >= valTarget;
    if (op === '>') return valItem > valTarget;
    if (op === '<=') return valItem <= valTarget;
    if (op === '<') return valItem < valTarget;
    if (op === '=' || op === '==') return normalizedGrade === targetRank || normalizedGrade.startsWith(targetRank);
  }
  
  return normalizedGrade === queryStr || normalizedGrade.startsWith(queryStr);
}

function setupSearchWidget() {
  const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]') as HTMLInputElement;
  if (!searchInput) return;

  const searchWrapper = searchInput.parentElement;
  if (!searchWrapper) return;

  if (searchWrapper.querySelector('.aegis-search-widget')) return;

  // Closure state variables for modular filter building
  let activeTarget = 'perk'; // 'perk', 'weapon', 'armor2p', 'armor4p'
  let activeCondition = '>='; // '=', '>=', '<='

  const widgetContainer = document.createElement('div');
  widgetContainer.className = 'aegis-search-widget';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'aegis-search-widget-btn';
  button.title = 'Aegis Filters';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" class="aegis-widget-icon" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  `;

  const menu = document.createElement('div');
  menu.className = 'aegis-search-widget-menu hidden';
  menu.innerHTML = `
    <div class="aegis-menu-header">Aegis Filters</div>
    
    <div class="aegis-widget-row">
      <div class="aegis-row-label">Target</div>
      <div class="aegis-btn-group" data-group="target">
        <button type="button" class="aegis-group-btn active" data-value="perk">Perk</button>
        <button type="button" class="aegis-group-btn" data-value="weapon">Weapon</button>
        <button type="button" class="aegis-group-btn" data-value="armor2p">Armor 2pc</button>
        <button type="button" class="aegis-group-btn" data-value="armor4p">Armor 4pc</button>
      </div>
    </div>

    <div class="aegis-widget-row">
      <div class="aegis-row-label">Condition</div>
      <div class="aegis-btn-group" data-group="condition">
        <button type="button" class="aegis-group-btn active" data-value=">=">Or Better (&ge;)</button>
        <button type="button" class="aegis-group-btn" data-value="=">Only (=)</button>
        <button type="button" class="aegis-group-btn" data-value="<=">Or Worse (&le;)</button>
      </div>
    </div>

    <div class="aegis-widget-row">
      <div class="aegis-row-label">Grade</div>
      <div class="aegis-grade-grid">
        <button type="button" class="aegis-grade-btn" data-grade="s">S</button>
        <button type="button" class="aegis-grade-btn" data-grade="a">A</button>
        <button type="button" class="aegis-grade-btn" data-grade="b">B</button>
        <button type="button" class="aegis-grade-btn" data-grade="c">C</button>
      </div>
    </div>

    <div class="aegis-menu-divider"></div>

    <div class="aegis-widget-row">
      <div class="aegis-row-label">Shortcuts</div>
      <div class="aegis-shortcuts-grid">
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:god">God Rolls</button>
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:upgrade">Upgradeable</button>
        <button type="button" class="aegis-shortcut-btn" data-shortcut="aegis:chase">Chase List</button>
      </div>
    </div>

    <div class="aegis-menu-divider"></div>
    <button type="button" class="aegis-menu-clear-btn">Clear Active Filter</button>
  `;

  widgetContainer.appendChild(button);
  widgetContainer.appendChild(menu);

  // Inject widget right after searchInput
  searchInput.after(widgetContainer);

  // Position relative is required for absolute dropdown anchoring
  searchWrapper.style.setProperty('position', 'relative', 'important');

  // Toggle dropdown on button click
  button.addEventListener('click', (e) => {
    e.stopPropagation();
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
  const items = document.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
  
  if (!activeAegisFilter) {
    items.forEach(item => {
      item.style.removeProperty('opacity');
      item.style.removeProperty('filter');
      item.style.removeProperty('pointer-events');
    });
    return;
  }

  const targetQuery = activeAegisFilter.replace(/^aegis:/i, '').toLowerCase();

  items.forEach(item => {
    const result = (item as any)._aegisResult as ScoringResult | undefined;
    const grade = result?.grade?.toLowerCase() || '';
    let isMatch = false;
    const isArmor = grade.includes('/');

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
        let weaponRank = '';
        let perkRank = '';
        const isTwoTier = grade.length > 2 || (grade.length === 2 && !grade.endsWith('+') && !grade.endsWith('-'));
        if (isTwoTier) {
          weaponRank = grade.charAt(0);
          perkRank = grade.substring(1);
        } else {
          perkRank = grade;
        }

        if (targetQuery === 'upgradeable' || targetQuery === 'upgradable' || targetQuery === 'upgrade') {
          isMatch = !!result?.upgradeAvailable;
        } else if (targetQuery === 'god') {
          isMatch = compareGrades(perkRank, '>=s');
        } else if (targetQuery.startsWith('w:') || targetQuery.startsWith('weapon:')) {
          const targetRank = targetQuery.startsWith('w:') ? targetQuery.substring(2) : targetQuery.substring(7);
          isMatch = compareGrades(weaponRank, targetRank);
        } else if (targetQuery.startsWith('p:') || targetQuery.startsWith('perk:')) {
          const targetRank = targetQuery.startsWith('p:') ? targetQuery.substring(2) : targetQuery.substring(5);
          isMatch = compareGrades(perkRank, targetRank);
        } else {
          isMatch = compareGrades(grade, targetQuery) || compareGrades(weaponRank, targetQuery) || compareGrades(perkRank, targetQuery);
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
  if (q === 'god') return 'God Rolls';
  if (q === 'upgrade' || q === 'upgradeable') return 'Upgradeable';
  if (q === 'chase') return 'Chase List';
  if (q === 'bis' || q === 'bestinclass') return 'Best in Class';
  if (q === 'meta') return 'Meta Tier';

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
  const elements = document.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
  for (let i = 0; i < elements.length; i++) {
    processElement(elements[i]);
  }
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
updateBadgesOpacity();
setupRegistryObserver();

// Keep badge opacity in sync with React state updates — event-driven, not polled.
// DIM dims items by mutating class/style attributes, so watch for those changes
// near annotated items and recompute once per frame when they occur.
let opacityUpdateScheduled = false;

function scheduleOpacityUpdate() {
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

  const iconHtml = `<span class="aegis-toast-icon">🔄</span>`;
  const textHtml = `<span class="aegis-toast-text">${msg}</span>`;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`${iconHtml}${textHtml}`, 'text/html');
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


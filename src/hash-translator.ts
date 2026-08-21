import { HASH_TO_ENGLISH_WEAPON, HASH_TO_ENGLISH_PERK, CANONICAL_PERK_HASHES } from './canonical-hashes';

// Localized registries populated by DIM React Fiber & IndexedDB manifest scans
let localizedPerkRegistry: Record<number, { name: string; icon: string }> = {};
let localizedWeaponRegistry: Record<number, string> = {};

const ENGLISH_WEAPON_TO_HASH: Record<string, number> = {};
for (const [hashStr, name] of Object.entries(HASH_TO_ENGLISH_WEAPON)) {
  const hash = Number(hashStr);
  const lower = name.toLowerCase().trim();
  if (!ENGLISH_WEAPON_TO_HASH[lower]) {
    ENGLISH_WEAPON_TO_HASH[lower] = hash;
  }
}

export function getEnglishWeaponNameFromHash(hash: number): string | null {
  return HASH_TO_ENGLISH_WEAPON[hash] || null;
}

export function getEnglishPerkNameFromHash(hash: number): string | null {
  return HASH_TO_ENGLISH_PERK[hash] || null;
}

export function updateLocalizedRegistries(
  perks: Record<string | number, { name: string; icon: string }>,
  weapons?: Record<string | number, string>
) {
  if (perks) {
    for (const [hashStr, p] of Object.entries(perks)) {
      const hash = Number(hashStr);
      if (!isNaN(hash) && p && p.name) {
        localizedPerkRegistry[hash] = p;
      }
    }
  }

  if (weapons) {
    for (const [hashStr, name] of Object.entries(weapons)) {
      const hash = Number(hashStr);
      if (!isNaN(hash) && name) {
        localizedWeaponRegistry[hash] = name;
      }
    }
  }
}

export function cleanName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Returns the Bungie Hash for a given English perk name.
 */
export function getPerkHashFromEnglish(englishName: string): number | null {
  if (!englishName) return null;
  const raw = englishName.toLowerCase().trim();
  if (CANONICAL_PERK_HASHES[raw]) return CANONICAL_PERK_HASHES[raw];

  const clean = cleanName(raw);
  if (CANONICAL_PERK_HASHES[clean]) return CANONICAL_PERK_HASHES[clean];

  return null;
}

/**
 * Returns the Bungie Hash for a given English weapon name.
 */
export function getWeaponHashFromEnglish(englishName: string): number | null {
  if (!englishName) return null;
  const raw = englishName.toLowerCase().trim();
  if (ENGLISH_WEAPON_TO_HASH[raw]) return ENGLISH_WEAPON_TO_HASH[raw];

  const base = raw.replace(/\s*\([^)]+\)\s*$/gi, '').trim();
  if (ENGLISH_WEAPON_TO_HASH[base]) return ENGLISH_WEAPON_TO_HASH[base];

  const clean = cleanName(base);
  if (ENGLISH_WEAPON_TO_HASH[clean]) return ENGLISH_WEAPON_TO_HASH[clean];

  return null;
}

/**
 * Translates an English perk name or hash to the localized name in the user's active DIM language.
 */
export function getLocalizedPerkName(englishNameOrHash: string | number, fallback?: string): string {
  let hash: number | null = typeof englishNameOrHash === 'number' ? englishNameOrHash : null;
  if (!hash && typeof englishNameOrHash === 'string') {
    hash = getPerkHashFromEnglish(englishNameOrHash);
  }

  if (hash && localizedPerkRegistry[hash]?.name) {
    return localizedPerkRegistry[hash].name;
  }

  if (fallback) return fallback;
  if (typeof englishNameOrHash === 'string') {
    return englishNameOrHash.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return `Perk #${englishNameOrHash}`;
}

/**
 * Translates an English weapon name or hash to the localized name in the user's active DIM language.
 */
export function getLocalizedWeaponName(englishNameOrHash: string | number, fallback?: string): string {
  let hash: number | null = typeof englishNameOrHash === 'number' ? englishNameOrHash : null;
  if (!hash && typeof englishNameOrHash === 'string') {
    hash = getWeaponHashFromEnglish(englishNameOrHash);
  }

  if (hash && localizedWeaponRegistry[hash]) {
    return localizedWeaponRegistry[hash];
  }

  return fallback || (typeof englishNameOrHash === 'string' ? englishNameOrHash : `Weapon #${englishNameOrHash}`);
}

/**
 * Resolves the icon for an English perk name or hash.
 */
export function getPerkIcon(englishNameOrHash: string | number): string | null {
  let hash: number | null = typeof englishNameOrHash === 'number' ? englishNameOrHash : null;
  if (!hash && typeof englishNameOrHash === 'string') {
    hash = getPerkHashFromEnglish(englishNameOrHash);
  }

  if (hash && localizedPerkRegistry[hash]?.icon) {
    return localizedPerkRegistry[hash].icon;
  }

  return null;
}

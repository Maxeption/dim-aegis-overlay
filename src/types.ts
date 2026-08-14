/**
 * Represents a single parsed wishlist entry.
 */
export interface WishlistRoll {
  itemHash: number;
  perks: number[];
  notes: string;
  title?: string;
}

/**
 * The structured database format for the wishlist,
 * mapping weapon item hashes to their multiple recommended rolls.
 */
export type WishlistDatabase = Record<number, WishlistRoll[]>;

/**
 * Result of scoring a weapon roll against a wishlist entry.
 */
export interface ScoringResult {
  grade: string | null;
  matchPercentage: number;
  matchedPerks: number[];
  missingPerks: number[];
  notes: string;
  wishlistPerks: number[];
  upgradeAdvice?: string;
  potentialGrade?: string;
  wishlistNotes?: string;
  upgradeAvailable?: boolean;
}

/**
 * Storage schema for chrome.storage.local
 */
export interface LocalStorageSchema {
  wishlistUrl?: string;
  wishlistData?: WishlistDatabase;
  lastUpdated?: number;
  syncStatus?: 'success' | 'loading' | 'error';
  syncError?: string | null;
  parsedCount?: number;
  enhancedToNormal?: Record<number, number>;
  aegisSheetDb?: AegisSheetDatabase;
  aegisSheetDbPvE?: AegisSheetDatabase;
  aegisSheetDbPvP?: AegisSheetDatabase;
  aegisMode?: 'pve' | 'pvp';
  aegisSheetLastSync?: number;
  aegisChaseList?: Record<string, {
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
  }>;
}

/**
 * Data structure representing a single weapon row parsed from Aegis's spreadsheet.
 */
export interface AegisSheetWeapon {
  name: string;
  energy: string;
  frame: string;
  barrel: string;
  mag: string;
  perk1: string;
  perk2: string;
  origin: string;
  source?: string;
  notes: string;
  description?: string;
  rank: string;
  tier: string;
  versionTag?: string;
  mw?: string;
  stun?: string;
  exoticViability?: {
    roam?: string;
    dps?: string;
    chall?: string;
    speed?: string;
    trials?: string;
    comp?: string;
    quickplay?: string;
    vsDr?: string;
    duel?: string;
    tags?: string;
    stun?: string;
  };
}

/**
 * Data structure representing a single armor set parsed from the spreadsheet.
 */
export interface AegisArmorSet {
  setName: string;
  piece2Name: string;
  piece2Desc: string;
  piece2Numbers: string;
  piece2Rating: string;
  piece4Name: string;
  piece4Desc: string;
  piece4Numbers: string;
  piece4Rating: string;
  source: string;
  sourceType: string;
}

/**
 * Registry of all weapons parsed from the Aegis spreadsheet tabs,
 * containing a flat map of weapons by normalized name and lists grouped by category.
 */
export interface AegisSheetDatabase {
  weapons: Record<string, AegisSheetWeapon>;
  variants?: Record<string, AegisSheetWeapon[]>;
  categories: Record<string, AegisSheetWeapon[]>;
  armor?: Record<string, AegisArmorSet>;
  armorAegis?: Record<string, AegisArmorSet>;
}

/**
 * Defines a normalized perk representation for hover tooltips.
 */
export interface TooltipPerk {
  name: string;
  icon?: string;
  matched: boolean;
  type: 'barrel' | 'mag' | 'perk1' | 'perk2' | 'origin';
  status?: 'active' | 'selectable' | 'missing';
}



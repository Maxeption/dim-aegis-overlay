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
  isPerfect5of5?: boolean;
  isOmniRoll?: boolean;
  matchedSlotsCount?: number;
  pveGrade?: string;
  pvpGrade?: string;
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
  aegisShoppingDb?: AegisShoppingDatabase;
  aegisShoppingDbPvE?: AegisShoppingDatabase;
  aegisShoppingDbPvP?: AegisShoppingDatabase;
  aegisMode?: 'pve' | 'pvp' | 'both';
  aegisCompactPerksMatrix?: boolean;
  aegisInlineHeader?: boolean;
  aegisAutoMaxHeight?: boolean;
  aegisTooltipWidthMode?: 'auto' | 'fixed';
  aegisTooltipWidth?: number;
  aegisSheetLastSync?: number;
  aegisChaseList?: Record<string, AegisChaseItem>;
}

/**
 * An entry in the user's custom Roll Chase List.
 */
export interface AegisChaseItem {
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
  itemHash?: number;
  icon?: string;
  damageType?: string;
  damageIcon?: string;
  archetype?: string;
  typeName?: string;
  source?: string;
}

/**
 * Manifest weapon representation from Bungie API definitions.
 */
export interface ManifestWeapon {
  hash: number;
  name: string;
  icon: string;
  typeName: string;
  tierName: string;
  damageType: string;
  damageIcon: string;
  ammoType: string;
  watermark?: string;
  seasonName?: string;
  releaseVersion?: number;
  sourceName?: string | null;
  rpm?: number;
  archetype?: string;
  perks: string[];
  perkColumns: string[][];
  barrels?: string[];
  magazines?: string[];
  origins?: string[];
  isCraftable: boolean;
  baseStats?: Record<string, number>;
  maxStats?: Record<string, number>;
  superseded?: boolean;
  sourceCategories?: string[];
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
  rankIndex?: number;
}

export interface SheetPerksGroup {
  matched: TooltipPerk[];
  missing: TooltipPerk[];
  all?: TooltipPerk[];
}

export interface DualSheetInfo {
  sheetWeaponPvE?: AegisSheetWeapon | null;
  sheetWeaponPvP?: AegisSheetWeapon | null;
  sheetPerksPvE?: SheetPerksGroup | null;
  sheetPerksPvP?: SheetPerksGroup | null;
  pveResult?: ScoringResult | null;
  pvpResult?: ScoringResult | null;
  bestAlternativePvE?: string;
  bestAlternativePvP?: string;
  isBestInClassPvE?: boolean;
  isBestInClassPvP?: boolean;
  shoppingItemPvE?: AegisShoppingItem | null;
  shoppingAltPvE?: { primaryName: string; role: string } | null;
  shoppingItemPvP?: AegisShoppingItem | null;
  shoppingAltPvP?: { primaryName: string; role: string } | null;
}

/**
 * An item entry parsed from Aegis's "Shopping List" spreadsheet tab.
 */
export interface AegisShoppingItem {
  role: string;
  name: string;
  source: string;
  priorityNum: number;
  priority: 'high' | 'medium' | 'low' | 'niche';
  column1: string;
  column2: string;
  alternatives: string[];
  isArmor: boolean;
  isExotic?: boolean;
}

/**
 * Structured database of the Aegis Shopping List containing items, quick lookup by name,
 * and mapping of alternative gear to their primary recommendations.
 */
export interface AegisShoppingDatabase {
  items: AegisShoppingItem[];
  byName: Record<string, AegisShoppingItem>;
  alternativesMap: Record<string, { primaryName: string; role: string; priority: string; priorityNum: number }>;
}

/**
 * Universal, strongly-typed evaluation payload attached to a weapon/armor DOM tile via WeakMap.
 */
export interface WeaponEvaluationPayload {
  result: ScoringResult;
  name: string;
  perksMap: Record<number, { name: string; icon: string }>;
  activeHashes?: number[];
  sheetWeapon?: AegisSheetWeapon | null;
  sheetPerks?: SheetPerksGroup | null;
  sheetArmor?: AegisArmorSet | null;
  equippedMasterwork?: string | null;
  shoppingItem?: AegisShoppingItem | null;
  shoppingAlt?: { primaryName: string; role: string; priority: string; priorityNum: number } | null;
  bestAlternative?: string;
  isBestInClass?: boolean;
  dualInfo?: DualSheetInfo;
  shoppingItemPvE?: AegisShoppingItem | null;
  shoppingAltPvE?: { primaryName: string; role: string } | null;
  shoppingItemPvP?: AegisShoppingItem | null;
  shoppingAltPvP?: { primaryName: string; role: string } | null;
  sheetWeaponPvE?: AegisSheetWeapon | null;
  sheetWeaponPvP?: AegisSheetWeapon | null;
  sheetPerksPvE?: SheetPerksGroup | null;
  sheetPerksPvP?: SheetPerksGroup | null;
  pveResult?: ScoringResult | null;
  pvpResult?: ScoringResult | null;
  bestAlternativePvE?: string;
  bestAlternativePvP?: string;
  isBestInClassPvE?: boolean;
  isBestInClassPvP?: boolean;
}




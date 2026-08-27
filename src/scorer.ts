import { WishlistDatabase, ScoringResult, CommunityWeaponPerkStats, SheetPerksGroup, TooltipPerk, AegisSheetWeapon } from './types';

// Numeric weight for comparing grades
const GRADE_WEIGHTS: Record<string, number> = {
  'S+': 5,
  S: 4,
  A: 3,
  B: 2,
  C: 1,
  D: 0,
  F: -1,
};

/**
 * Compares a weapon's rolled perks against the cached wishlist database entries
 * for that weapon and returns the best matching grade and details.
 *
 * @param itemHash The weapon's itemHash.
 * @param rolledPerks The perk hashes currently active/rolled on the weapon instance.
 * @param database The parsed WishlistDatabase.
 * @returns The best ScoringResult found, or a null result if no match is found.
 */
export function scoreWeapon(
  itemHash: number,
  rolledPerks: number[],
  database: WishlistDatabase,
  enhancedToNormalMap?: Record<number, number>
): ScoringResult {
  const defaultResult: ScoringResult = {
    grade: null,
    matchPercentage: 0,
    matchedPerks: [],
    missingPerks: [],
    notes: '',
    wishlistPerks: [],
  };

  // If there are no wishlist entries for this weapon, return default
  const recommendations = database[itemHash];
  if (!recommendations || recommendations.length === 0) {
    return defaultResult;
  }

  // Build the set of rolled perks.
  // If a perk is enhanced, also include its normal counterpart in the rolled set
  // so it matches wishlist lines that specify normal perk hashes.
  const rolledSet = new Set<number>();
  for (const perk of rolledPerks) {
    rolledSet.add(perk);
    if (enhancedToNormalMap && enhancedToNormalMap[perk]) {
      rolledSet.add(enhancedToNormalMap[perk]);
    }
  }

  let bestResult: ScoringResult | null = null;

  for (const rec of recommendations) {
    const matched: number[] = [];
    const missing: number[] = [];

    // Check each required perk in the wishlist entry
    for (const perk of rec.perks) {
      if (rolledSet.has(perk)) {
        matched.push(perk);
      } else {
        missing.push(perk);
      }
    }

    const missingCount = missing.length;
    let grade: 'S' | 'A' | 'B' | 'C' | null = null;

    // Determine grade based on missing perks count
    if (missingCount === 0) {
      grade = 'S';
    } else if (missingCount === 1) {
      grade = 'A';
    } else if (missingCount === 2) {
      grade = 'B';
    } else if (missingCount === 3) {
      grade = 'C';
    }

    // If more than 3 perks are missing, it's not a valid match grade
    if (grade === null) {
      continue;
    }

    const matchPercentage = Math.round((matched.length / rec.perks.length) * 100);

    const result: ScoringResult = {
      grade,
      matchPercentage,
      matchedPerks: matched,
      missingPerks: missing,
      notes: rec.notes,
      wishlistPerks: rec.perks,
    };

    // Keep track of the best match (highest grade, then highest match percentage)
    if (!bestResult) {
      bestResult = result;
    } else {
      const currentWeight = GRADE_WEIGHTS[result.grade as string] || 0;
      const bestWeight = GRADE_WEIGHTS[bestResult.grade as string] || 0;

      if (currentWeight > bestWeight) {
        bestResult = result;
      } else if (currentWeight === bestWeight && result.matchPercentage > bestResult.matchPercentage) {
        bestResult = result;
      }
    }
  }

  return bestResult || defaultResult;
}

/**
 * Scores a weapon's rolled perk names against community popularity statistics.
 *
 * @param rolledPerkNames Names of perks rolled/active on the weapon instance.
 * @param stats The CommunityWeaponPerkStats for this weapon.
 * @param mode 'pve' | 'pvp' (default: 'pve')
 * @returns ScoringResult with grade (S+, S, A, B, C, D, F), matchPercentage, and meta notes.
 */
export function scoreCommunityWeapon(
  rolledPerkNames: string[],
  stats?: CommunityWeaponPerkStats | null,
  mode: 'pve' | 'pvp' = 'pve'
): ScoringResult {
  const defaultResult: ScoringResult = {
    grade: null,
    matchPercentage: 0,
    matchedPerks: [],
    missingPerks: [],
    notes: '',
    wishlistPerks: [],
  };

  if (!stats) return defaultResult;
  const modeData = mode === 'pvp' ? (stats.pvp || stats.pve) : (stats.pve || stats.pvp);
  if (!modeData) return defaultResult;

  const cleanNames = (rolledPerkNames || []).map(n => (n || '').replace(/\*+$/, '').trim().toLowerCase()).filter(Boolean);

  // Check top roll combinations match
  let comboMatchIndex = -1;
  let comboMatchPct = 0;
  if (modeData.topRolls && modeData.topRolls.length > 0) {
    for (let i = 0; i < modeData.topRolls.length; i++) {
      const tr = modeData.topRolls[i];
      const p1 = (tr.perk1 || '').replace(/\*+$/, '').trim().toLowerCase();
      const p2 = (tr.perk2 || '').replace(/\*+$/, '').trim().toLowerCase();
      if (cleanNames.includes(p1) && cleanNames.includes(p2)) {
        comboMatchIndex = i;
        comboMatchPct = tr.pct;
        break;
      }
    }
  }

  // Check individual column maximum percentages found on this roll
  let maxCol3Pct = 0;
  let maxCol4Pct = 0;
  let col3PerkName = '';
  let col4PerkName = '';

  if (modeData.col3) {
    for (const [pName, val] of Object.entries(modeData.col3)) {
      const clean = (pName || '').replace(/\*+$/, '').trim().toLowerCase();
      if (cleanNames.includes(clean) && val > maxCol3Pct) {
        maxCol3Pct = val;
        col3PerkName = pName.replace(/\*+$/, '').trim();
      }
    }
  }

  if (modeData.col4) {
    for (const [pName, val] of Object.entries(modeData.col4)) {
      const clean = (pName || '').replace(/\*+$/, '').trim().toLowerCase();
      if (cleanNames.includes(clean) && val > maxCol4Pct) {
        maxCol4Pct = val;
        col4PerkName = pName.replace(/\*+$/, '').trim();
      }
    }
  }

  // Calculate composite meta score (0 to 100)
  const comboBonus = comboMatchIndex >= 0 ? Math.max(0, 30 - comboMatchIndex * 5) : 0;
  const compositeScore = Math.min(100, Math.round(maxCol3Pct * 0.45 + maxCol4Pct * 0.45 + comboBonus));

  let grade: string | null = null;
  let notes = '';

  if (comboMatchIndex === 0 || (maxCol3Pct >= 40 && maxCol4Pct >= 40) || compositeScore >= 65) {
    grade = 'S+';
    notes = comboMatchIndex === 0
      ? `Community Meta #1 God Roll (${comboMatchPct}% of all rolls)`
      : `Top Community Synergy: ${col3PerkName} (${Math.round(maxCol3Pct)}%) + ${col4PerkName} (${Math.round(maxCol4Pct)}%)`;
  } else if ((comboMatchIndex >= 1 && comboMatchIndex <= 2) || compositeScore >= 35) {
    grade = 'S';
    notes = comboMatchIndex >= 0
      ? `Community Top #${comboMatchIndex + 1} Roll (${comboMatchPct}% popularity)`
      : `High Meta Popularity: ${col3PerkName} (${Math.round(maxCol3Pct)}%) + ${col4PerkName} (${Math.round(maxCol4Pct)}%)`;
  } else if (comboMatchIndex >= 3 || compositeScore >= 20 || (maxCol3Pct >= 15 && maxCol4Pct >= 15)) {
    grade = 'A';
    notes = comboMatchIndex >= 0
      ? `Popular Community Roll #${comboMatchIndex + 1} (${comboMatchPct}%)`
      : `Community Meta: ${col3PerkName || 'Col 3'} (${Math.round(maxCol3Pct)}%) / ${col4PerkName || 'Col 4'} (${Math.round(maxCol4Pct)}%)`;
  } else if (maxCol3Pct >= 25 || maxCol4Pct >= 25 || compositeScore >= 12) {
    grade = 'B';
    notes = `Above Average: Strong perk (${Math.max(Math.round(maxCol3Pct), Math.round(maxCol4Pct))}%) with alternative trait`;
  } else if (maxCol3Pct >= 10 || maxCol4Pct >= 10 || compositeScore >= 6) {
    grade = 'C';
    notes = `Usable Community Roll (${Math.max(Math.round(maxCol3Pct), Math.round(maxCol4Pct))}% peak perk adoption)`;
  } else if (maxCol3Pct > 0 || maxCol4Pct > 0) {
    grade = 'D';
    notes = 'Off-Meta Community Roll';
  } else {
    grade = 'F';
    notes = 'Off-Meta (Low Community Adoption)';
  }

  return {
    grade,
    matchPercentage: compositeScore,
    matchedPerks: [],
    missingPerks: [],
    notes,
    wishlistPerks: [],
    pveGrade: mode === 'pve' ? (grade || undefined) : undefined,
    pvpGrade: mode === 'pvp' ? (grade || undefined) : undefined,
  };
}

export interface CommunityScoringEvaluation {
  result: ScoringResult;
  potentialGrade: string;
  upgradeAdvice: string;
  sheetPerks: SheetPerksGroup;
  pseudoSheetWeapon: AegisSheetWeapon;
}

/**
 * Scores a weapon using community popularity data while building full perk matrix breakdown
 * with active, selectable, and missing chips, and computes potential upgrades.
 */
export function scoreCommunityPerksWithBreakdown(
  weaponName: string,
  stats: CommunityWeaponPerkStats,
  perksMap: Record<number, { name: string; icon: string }>,
  activeHashes: number[],
  mode: 'pve' | 'pvp' = 'pve',
  getIconFn?: (name: string) => string | undefined
): CommunityScoringEvaluation {
  const modeData = mode === 'pvp' ? (stats.pvp || stats.pve) : (stats.pve || stats.pvp);
  const emptySheetPerks: SheetPerksGroup = { matched: [], missing: [], all: [] };
  const emptyPseudoWeapon: AegisSheetWeapon = {
    name: weaponName,
    energy: '',
    frame: '',
    barrel: '',
    mag: '',
    perk1: '',
    perk2: '',
    origin: '',
    notes: '',
    tier: 'C',
    rank: '',
    source: 'Community Meta'
  };

  if (!modeData) {
    return {
      result: { grade: null, matchPercentage: 0, matchedPerks: [], missingPerks: [], notes: '', wishlistPerks: [] },
      potentialGrade: '',
      upgradeAdvice: '',
      sheetPerks: emptySheetPerks,
      pseudoSheetWeapon: emptyPseudoWeapon
    };
  }

  // 1. Map owned perks by normalized name
  const ownedPerksByName: Record<string, { hash: number; name: string; icon: string; active: boolean }> = {};
  for (const [hashStr, pObj] of Object.entries(perksMap)) {
    if (pObj?.name) {
      const clean = pObj.name.replace(/\*+$/, '').trim().toLowerCase();
      const hash = parseInt(hashStr, 10);
      ownedPerksByName[clean] = {
        hash,
        name: pObj.name,
        icon: pObj.icon,
        active: activeHashes.includes(hash)
      };
    }
  }

  // 2. Sort column 3 and column 4 perks by popularity percentage descending
  const col3Entries = Object.entries(modeData.col3 || {}).sort((a, b) => b[1] - a[1]);
  const col4Entries = Object.entries(modeData.col4 || {}).sort((a, b) => b[1] - a[1]);

  const matchedList: TooltipPerk[] = [];
  const missingList: TooltipPerk[] = [];
  const allList: TooltipPerk[] = [];

  const col3Names: string[] = [];
  const col4Names: string[] = [];

  // Build Column 3 TooltipPerks
  col3Entries.forEach(([pName], idx) => {
    const clean = pName.replace(/\*+$/, '').trim().toLowerCase();
    const cleanPName = pName.replace(/\*+$/, '').trim();
    const owned = ownedPerksByName[clean];
    col3Names.push(cleanPName);

    const status: 'active' | 'selectable' | 'missing' = owned
      ? (owned.active ? 'active' : 'selectable')
      : 'missing';

    const resolvedIcon = owned?.icon || getIconFn?.(cleanPName) || '';

    const tPerk: TooltipPerk = {
      name: cleanPName,
      icon: resolvedIcon,
      matched: !!owned,
      type: 'perk1',
      status,
      rankIndex: idx + 1
    };

    allList.push(tPerk);
    if (owned) {
      matchedList.push(tPerk);
    } else {
      missingList.push(tPerk);
    }
  });

  // Build Column 4 TooltipPerks
  col4Entries.forEach(([pName], idx) => {
    const clean = pName.replace(/\*+$/, '').trim().toLowerCase();
    const cleanPName = pName.replace(/\*+$/, '').trim();
    const owned = ownedPerksByName[clean];
    col4Names.push(cleanPName);

    const status: 'active' | 'selectable' | 'missing' = owned
      ? (owned.active ? 'active' : 'selectable')
      : 'missing';

    const resolvedIcon = owned?.icon || getIconFn?.(cleanPName) || '';

    const tPerk: TooltipPerk = {
      name: cleanPName,
      icon: resolvedIcon,
      matched: !!owned,
      type: 'perk2',
      status,
      rankIndex: idx + 1
    };

    allList.push(tPerk);
    if (owned) {
      matchedList.push(tPerk);
    } else {
      missingList.push(tPerk);
    }
  });

  const sheetPerks: SheetPerksGroup = {
    matched: matchedList,
    missing: missingList,
    all: allList
  };

  // 3. Active perks scoring
  const activePerkNames = Object.values(ownedPerksByName).filter(p => p.active).map(p => p.name);
  const allOwnedPerkNames = Object.values(ownedPerksByName).map(p => p.name);

  const activeResult = scoreCommunityWeapon(activePerkNames.length > 0 ? activePerkNames : allOwnedPerkNames, stats, mode);

  // 4. Potential perks scoring across all owned selectable perks
  const potentialResult = scoreCommunityWeapon(allOwnedPerkNames, stats, mode);

  let upgradeAdvice = '';
  const currentGrade = activeResult.grade || 'F';
  const potentialGrade = potentialResult.grade || currentGrade;

  const currentGradeWeight = GRADE_WEIGHTS[currentGrade] ?? -1;
  const potentialGradeWeight = GRADE_WEIGHTS[potentialGrade] ?? -1;

  if (potentialGradeWeight > currentGradeWeight) {
    activeResult.upgradeAvailable = true;
    activeResult.potentialGrade = potentialGrade;

    // Find which selectable perks enable the higher grade
    const selectableCol3 = col3Entries.filter(([pName]) => {
      const clean = pName.replace(/\*+$/, '').trim().toLowerCase();
      return ownedPerksByName[clean] && !ownedPerksByName[clean].active;
    }).map(([pName, pct]) => `${pName.replace(/\*+$/, '').trim()} (${Math.round(pct)}%)`);

    const selectableCol4 = col4Entries.filter(([pName]) => {
      const clean = pName.replace(/\*+$/, '').trim().toLowerCase();
      return ownedPerksByName[clean] && !ownedPerksByName[clean].active;
    }).map(([pName, pct]) => `${pName.replace(/\*+$/, '').trim()} (${Math.round(pct)}%)`);

    const upgradeParts: string[] = [];
    if (selectableCol3.length > 0) {
      upgradeParts.push(`Col 3: [${selectableCol3[0]}]`);
    }
    if (selectableCol4.length > 0) {
      upgradeParts.push(`Col 4: [${selectableCol4[0]}]`);
    }

    upgradeAdvice = `💡 Switch to ${upgradeParts.join(' and ')} to upgrade from ${currentGrade} ➔ ${potentialGrade}`;
    activeResult.upgradeAdvice = upgradeAdvice;
  }

  const topCombo = modeData.topRolls?.[0];
  const pseudoSheetWeapon: AegisSheetWeapon = {
    name: weaponName,
    energy: '',
    frame: '',
    barrel: '',
    mag: '',
    perk1: col3Names.join(' / '),
    perk2: col4Names.join(' / '),
    origin: '',
    notes: topCombo ? `Top Community Roll: ${topCombo.perk1.replace(/\*+$/, '')} + ${topCombo.perk2.replace(/\*+$/, '')} (${topCombo.pct}% of all rolls)` : '',
    tier: '',
    rank: topCombo ? `1 (${topCombo.pct}%)` : '',
    source: 'Light.gg Community Meta'
  };

  return {
    result: activeResult,
    potentialGrade,
    upgradeAdvice,
    sheetPerks,
    pseudoSheetWeapon
  };
}

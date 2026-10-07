export type PerkRatingTab = 'Perks' | 'Origin Traits';
export interface PerkRating {
  name: string;
  tier: string;
  rank: number;
  analysis: string;
  usage: string;
  tab: PerkRatingTab;
}
export type PerkRatings = Record<string, PerkRating>;
export interface PerkRatingsCache {
  tabs: Partial<Record<PerkRatingTab, { updatedAt: number; ratings: PerkRatings }>>;
}

export function perkRatingKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().trim().replace(/\s*\(?enhanced\)?$/i, '')
    .replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

/** The KEY column is a separate tier legend, never a rating for that row. */
export function parsePerkRatings(rows: string[][], tab: PerkRatingTab): PerkRatings {
  const headerIndex = rows.findIndex(row => row.some(c => c.trim() === 'Name') && row.some(c => c.trim() === 'Tier'));
  if (headerIndex < 0) throw new Error(`${tab}: missing rating headers`);
  const header = rows[headerIndex].map(c => c.trim());
  const nameCol = header.indexOf('Name'), tierCol = header.indexOf('Tier'), rankCol = header.indexOf('#');
  if (rankCol < 0) throw new Error(`${tab}: missing rank column`);
  const analysisCol = header.findIndex(c => /^(?:ANALYSIS\s+)?Description$/.test(c));
  const usageCol = header.indexOf('Usage');
  const ratings: PerkRatings = {};
  for (const row of rows.slice(headerIndex + 1)) {
    const name = row[nameCol]?.trim(), tier = row[tierCol]?.trim().toUpperCase();
    const rank = Number(row[rankCol]);
    if (!name || !/^[SABCDEF][+-]?$/.test(tier || '') || !Number.isInteger(rank) || rank < 1) continue;
    ratings[perkRatingKey(name)] = { name, tier, rank, tab, analysis: row[analysisCol]?.trim() || '', usage: row[usageCol]?.trim() || '' };
  }
  if (!Object.keys(ratings).length) throw new Error(`${tab}: no rated perks`);
  return ratings;
}

export function findPerkRating(cache: PerkRatingsCache | undefined, englishName: string, origin: boolean): PerkRating | undefined {
  return cache?.tabs[origin ? 'Origin Traits' : 'Perks']?.ratings[perkRatingKey(englishName)];
}

export function buildPerkRatingIndex(cache: PerkRatingsCache | undefined, names: Record<number, string>): Record<number, PerkRating> {
  const index: Record<number, PerkRating> = {};
  for (const [hash, name] of Object.entries(names)) {
    const rating = findPerkRating(cache, name, false) || findPerkRating(cache, name, true);
    if (rating) index[Number(hash)] = rating;
  }
  return index;
}

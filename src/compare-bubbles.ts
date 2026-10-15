import type { TooltipPerk } from './types';

export type CompareStatus = 'active' | 'selectable' | 'missing' | 'other';
export type OwnedComparePerk = { hash: number; name: string; icon: string; selected: boolean };
export type CompareBubble = { name: string; icon?: string; hash?: number; status: CompareStatus; selected: boolean; ownedIndex?: number };

export function iconPath(value: string): string {
  try { return new URL(value, 'https://www.bungie.net').pathname; } catch { return value; }
}
const nameKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase().trim();

/** Rank recommendations independently of DOM order; never mutate DIM's plugs. */
export function planCompareBubbles(recommendations: TooltipPerk[], owned: OwnedComparePerk[], order: 'sheet' | 'owned'): CompareBubble[] {
  const used = new Set<number>(), seen = new Set<string>();
  const planned: CompareBubble[] = [];
  const ranked = recommendations.map((perk, index) => ({ perk, rank: perk.rankIndex ?? index + 1 })).sort((a, b) => a.rank - b.rank);
  for (const { perk } of ranked) {
    const key = String(perk.hash || nameKey(perk.name));
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = owned.flatMap((candidate, index) => !used.has(index) && (
      (perk.hash && candidate.hash === perk.hash) || nameKey(candidate.name) === nameKey(perk.name)
      || (perk.icon && iconPath(candidate.icon) === iconPath(perk.icon))
    ) ? [index] : []);
    if (!matches.length) planned.push({ name: perk.name, hash: perk.hash, icon: perk.icon, status: 'missing', selected: false });
    else for (const index of matches) {
      used.add(index);
      planned.push({ ...owned[index], ownedIndex: index, status: owned[index].selected ? 'active' : 'selectable' });
    }
  }
  if (order === 'owned') planned.sort((a, b) => Number(a.status === 'missing') - Number(b.status === 'missing'));
  owned.forEach((perk, index) => {
    if (used.has(index)) return;
    planned.push({ ...perk, ownedIndex: index, status: 'other' });
  });
  return planned;
}

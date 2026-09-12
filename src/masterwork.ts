import { WEAPON_STAT_HASHES } from './weapon-stats';

export function masterworkStatName(stats?: { hash: number; isPrimary: boolean }[]): string {
  const primary = stats?.filter(stat => stat.isPrimary) || [];
  if (primary.length !== 1) return '';
  return Object.keys(WEAPON_STAT_HASHES).find(name => WEAPON_STAT_HASHES[name] === primary[0].hash) || '';
}

export function normalizeMasterwork(value: string): string {
  const name = value.toLowerCase().replace(/\btier\s*\d+\s*/g, '').replace(/\b(?:mw|masterwork(?:ed|s)?)\b\s*:?/g, '').trim().replace(/\s+/g, ' ');
  return ({ 'reload speed': 'reload', 'projectile speed': 'velocity' } as Record<string, string>)[name] || name;
}

export function masterworkMatches(recommendations: string[], equipped: string, localize: (stat: string) => string = stat => stat): boolean {
  if (!recommendations.length) return true;
  const actual = normalizeMasterwork(equipped);
  return !!actual && recommendations.some(recommended => {
    const canonical = normalizeMasterwork(recommended);
    return canonical === actual || normalizeMasterwork(localize(canonical)) === actual;
  });
}

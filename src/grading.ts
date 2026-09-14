export const GRADES = ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F'] as const;
export type Grade = typeof GRADES[number];
export type SlotStatus = 'active' | 'selectable' | 'missing';
export type Slots = [SlotStatus, SlotStatus, SlotStatus, SlotStatus, SlotStatus];
export type GradeRule = {
  traits: 'both' | 'mixed' | 'one' | 'available';
  extras: 'none' | 'mag' | 'barrel' | 'either' | 'both';
  origin: boolean;
  masterwork: boolean;
  enabled: boolean;
};
export type Rules = Record<Exclude<Grade, 'F'>, GradeRule>;
export type GradeSettings = {
  version: 1;
  colorsEnabled: boolean;
  colors: Partial<Record<Grade, string>>;
  rulesEnabled: boolean;
  separatePvp: boolean;
  pve: Rules;
  pvp: Rules;
};

const rule = (traits: GradeRule['traits'], extras: GradeRule['extras'] = 'none', origin = false): GradeRule =>
  ({ traits, extras, origin, masterwork: false, enabled: true });

export function defaultRules(): Rules {
  return {
    'S+': rule('both', 'both', true), S: rule('both', 'mag'),
    'A+': rule('both', 'barrel'), A: rule('both'),
    'B+': rule('mixed', 'either'), B: rule('mixed'), C: rule('one', 'either'), D: rule('available'),
    E: { ...rule('available'), enabled: false },
  };
}

export function defaultGradeSettings(): GradeSettings {
  return { version: 1, colorsEnabled: false, colors: {}, rulesEnabled: false, separatePvp: false, pve: defaultRules(), pvp: defaultRules() };
}

export function normalizeGradeSettings(value: unknown, palette?: unknown): GradeSettings {
  if (palette !== undefined) {
    const rules = normalizeGradeSettings(value);
    const colors = normalizeGradeSettings(palette);
    return { ...rules, colorsEnabled: colors.colorsEnabled, colors: colors.colors };
  }
  const defaults = defaultGradeSettings();
  if (!value || typeof value !== 'object' || (value as GradeSettings).version !== 1) return defaults;
  const input = value as GradeSettings;
  const normalizeRules = (rules: Rules): Rules => {
    if (!rules || typeof rules !== 'object') return defaultRules();
    const result = defaultRules();
    for (const grade of GRADES) {
      if (grade === 'F') continue;
      const r = rules[grade];
      if (grade === 'E' && r === undefined) continue;
      if (!r || !['both', 'mixed', 'one', 'available'].includes(r.traits) ||
          !['none', 'mag', 'barrel', 'either', 'both'].includes(r.extras) ||
          typeof r.origin !== 'boolean' || typeof r.enabled !== 'boolean') return defaultRules();
      result[grade] = { traits: r.traits, extras: r.extras, origin: r.origin, masterwork: r.masterwork === true, enabled: r.enabled };
    }
    return result;
  };
  for (const grade of GRADES) {
    const color = input.colors?.[grade];
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) defaults.colors[grade] = color.toLowerCase();
  }
  return { ...defaults, colorsEnabled: input.colorsEnabled === true, rulesEnabled: input.rulesEnabled === true,
    separatePvp: input.separatePvp === true, pve: normalizeRules(input.pve), pvp: normalizeRules(input.pvp) };
}

export function gradeValue(grade: string): number {
  const normalized = grade.trim().toUpperCase();
  return ({ 'S+': 105, S: 100, 'A+': 90, A: 85, 'B+': 75, B: 70, 'C+': 60, C: 55, D: 45, PVP: 40, E: 30, F: 10 } as Record<string, number>)[normalized] || (normalized.startsWith('S') ? 100 : 0);
}

export function evaluateRules(slots: Slots, rules: Rules, masterworkMatched = true): Grade {
  const [p1, p2, mag, barrel, origin] = slots;
  const active = Number(p1 === 'active') + Number(p2 === 'active');
  const selectable = Number(p1 === 'selectable') + Number(p2 === 'selectable');
  for (const grade of GRADES) {
    if (grade === 'F') return grade;
    const r = rules[grade];
    if (!r.enabled) continue;
    const traits = { both: active === 2, mixed: active === 1 && selectable === 1, one: active === 1, available: active === 1 || selectable === 1 }[r.traits];
    const extras = { none: true, mag: mag === 'active', barrel: barrel === 'active', either: mag === 'active' || barrel === 'active', both: mag === 'active' && barrel === 'active' }[r.extras];
    if (traits && extras && (!r.origin || origin === 'active') && (!r.masterwork || masterworkMatched)) return grade;
  }
  return 'F';
}

export function evaluateCustomRoll(slots: Slots, rules: Rules, masterworkMatched = true) {
  const grade = evaluateRules(slots, rules, masterworkMatched);
  let potentialGrade = grade;
  let swaps: number[] = [];
  const selectable = slots.flatMap((status, index) => status === 'selectable' ? [index] : []);
  for (let mask = 1; mask < 2 ** selectable.length; mask++) {
    const candidate = [...slots] as Slots;
    const chosen = selectable.filter((_, bit) => mask & (1 << bit));
    chosen.forEach(index => { candidate[index] = 'active'; });
    const next = evaluateRules(candidate, rules, masterworkMatched);
    if (gradeValue(next) > gradeValue(potentialGrade) || (next === potentialGrade && chosen.length < swaps.length)) {
      potentialGrade = next;
      swaps = chosen;
    }
  }
  return { grade, potentialGrade, swaps };
}

export function unreachableGrades(rules: Rules): Grade[] {
  const reached = new Set<Grade>();
  const statuses: SlotStatus[] = ['active', 'selectable', 'missing'];
  for (let n = 0; n < 243; n++) {
    const slots = Array.from({ length: 5 }, (_, i) => statuses[Math.floor(n / 3 ** i) % 3]) as Slots;
    reached.add(evaluateRules(slots, rules));
    reached.add(evaluateRules(slots, rules, false));
  }
  return GRADES.filter(grade => grade !== 'F' && rules[grade].enabled && !reached.has(grade));
}

export function computeGrade(
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

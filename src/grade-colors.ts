import { Grade, GradeSettings, defaultGradeSettings, gradeValue } from './grading';
import type { BadgeColor, TileGlow } from './types';
import { gradeGradientEnd } from './grade-gradient';

export const defaultGradeColors: Record<Grade, string> = { 'S+': '#ffd700', S: '#ffd700', 'A+': '#da70d6', A: '#da70d6', 'B+': '#00f2fe', B: '#00f2fe', C: '#bdc3c7', D: '#e67e22', E: '#7f8c8d', F: '#e74c3c' };

let settings = defaultGradeSettings();
let badgeColor: BadgeColor = 'perk';
let tileGlow: TileGlow = 'archetype';
const originals = new WeakMap<HTMLElement, [string, string, string][]>();
const colorProperties = ['background', 'color', 'text-shadow'];
const badgeSelector = '.aegis-badge, .aegis-split-half, .aegis-title-badge, .aegis-popup-grade-badge, .aegis-tooltip-grade, .aegis-shopping-item-badge, [data-aegis-grade]';

export function setGradeColors(value: GradeSettings) { settings = value; }
export function resolveBadgeColor(value: unknown, legacy?: boolean): BadgeColor {
  return value === 'perk' || value === 'archetype' || value === 'gradient' ? value : legacy === true ? 'gradient' : 'perk';
}
export function setBadgeColor(value: BadgeColor) { badgeColor = value; }

function colorGrade(text: string): string {
  return badgeColor === 'archetype' ? twoTierGrades(text)?.[0] || displayGrade(text) : displayGrade(text);
}
export function resolveTileGlow(value: unknown, legacy?: boolean): TileGlow {
  return value === 'archetype' || value === 'perk' || value === 'max' ? value : legacy === true ? 'max' : 'archetype';
}
export function setTileGlow(value: TileGlow) { tileGlow = value; }

export function displayGrade(text: string): string {
  const clean = text.replace(/[★✦▲]/g, '').trim().toUpperCase();
  if (clean.includes('|') || clean.includes('/')) {
    return clean.split(/[|/]/).map(displayGrade).sort((a, b) => gradeValue(b) - gradeValue(a))[0] || '';
  }
  const last = clean.split(/[➔→]/).pop()!.trim();
  const match = last.match(/^(?:[SABCDEF][+-]?)?([SABCDEF][+-]?)$/);
  return match?.[1] || '';
}

export function rollGradeDisplay(text: string): string {
  return text.split(/[➔→]/).map(displayGrade).join('➔');
}

const gradientCache = new Map<string, string>();

export function gradeGradient(color: string): string {
  color = color.toLowerCase();
  const cached = gradientCache.get(color);
  if (cached) return cached;
  const gradient = `linear-gradient(135deg, ${color}, ${gradeGradientEnd(color)})`;
  if (gradientCache.size >= 128) gradientCache.clear();
  gradientCache.set(color, gradient);
  return gradient;
}

export function twoTierGrades(text: string): [Grade, Grade] | null {
  if (/[|/]/.test(text)) return null;
  const parts = text.replace(/[★✦▲]/g, '').trim().toUpperCase().split(/[➔→]/);
  const pair = parts[0].trim().match(/^([SABCDEF][+-]?)([SABCDEF][+-]?)$/);
  const perk = displayGrade(parts[parts.length - 1]) as Grade;
  if (!pair || !defaultGradeColors[pair[1] as Grade] || !defaultGradeColors[perk]) return null;
  return [pair[1] as Grade, perk];
}

export function twoTierGradient(text: string, palette = settings): string | null {
  const pair = twoTierGrades(text);
  if (!pair) return null;
  const color = (grade: Grade) => (palette.colorsEnabled && palette.colors[grade] || defaultGradeColors[grade]).toLowerCase();
  const weaponColor = color(pair[0]), perkColor = color(pair[1]);
  if (weaponColor === perkColor) return gradeGradient(perkColor);
  return `linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.18)), linear-gradient(90deg, ${weaponColor} 25%, ${perkColor} 75%)`;
}

export function applyGradeColors(root: HTMLElement, palette = settings) {
  const badges = [...(root.matches(badgeSelector) ? [root] : []), ...root.querySelectorAll<HTMLElement>(badgeSelector)];
  for (const badge of badges) {
    if (originals.has(badge)) {
      for (const [property, value, priority] of originals.get(badge)!) {
        if (value) badge.style.setProperty(property, value, priority);
        else badge.style.removeProperty(property);
      }
      originals.delete(badge);
    }
    if (badge.querySelector('.aegis-split-half')) continue;
    const text = badge.dataset.aegisGrade || badge.textContent || '';
    const gradient = badgeColor === 'gradient' ? twoTierGradient(text, palette) : null;
    const grade = colorGrade(text);
    const color = palette.colorsEnabled && palette.colors[grade as Grade] || defaultGradeColors[grade as Grade];
    if (!gradient && !color) continue;
    originals.set(badge, colorProperties.map(property => [property, badge.style.getPropertyValue(property), badge.style.getPropertyPriority(property)]));
    badge.style.setProperty('background', gradient || gradeGradient(color as string), 'important');
    badge.style.setProperty('color', '#ffffff', 'important');
    badge.style.setProperty('text-shadow', '0 1px 2px rgba(0, 0, 0, 0.8)', 'important');
  }
}

export function hasMaxTierGrade(text: string): boolean {
  return text.split(/[|/]/).some(part => {
    const pair = twoTierGrades(part);
    return !!pair && (pair[0] === 'S' || pair[0] === 'S+') && pair[1] === 'S+';
  });
}

export function shouldGlow(text: string, mode: TileGlow): boolean {
  if (mode === 'max') return hasMaxTierGrade(text);
  if (mode === 'perk') return displayGrade(text) === 'S+';
  return text.split(/[|/]/).some(part => part.replace(/[★✦▲]/g, '').trim().startsWith('S'));
}

const glowCache = new Map<string, string>();

function gradeGlowImage(text: string): string {
  const color = (grade: Grade) => settings.colorsEnabled && settings.colors[grade] || defaultGradeColors[grade];
  const segments = text.split('|').map(part => {
    const pair = badgeColor === 'gradient' ? twoTierGrades(part) : null;
    const base = color(colorGrade(part) as Grade) || defaultGradeColors.S;
    const left = pair ? color(pair[0]) : base;
    const right = pair ? color(pair[1]) : base;
    return { left, right, dual: left !== right };
  });
  const key = JSON.stringify(segments);
  const cached = glowCache.get(key);
  if (cached) return cached;
  const definitions = segments.map((segment, i) => `<linearGradient id="g${i}" x2="100%" y2="${segment.dual ? 0 : 100}%"><stop offset="${segment.dual ? .25 : 0}" stop-color="${segment.left}"/><stop offset="${segment.dual ? .75 : 1}" stop-color="${segment.dual ? segment.right : gradeGradientEnd(segment.left)}"/></linearGradient>`).join('');
  const rectangles = segments.map((segment, i) => `<svg x="${i * 100 / segments.length}%" width="${100 / segments.length}%" height="100%"><rect width="100%" height="100%" fill="url(#g${i})"/>${segment.dual ? '<rect width="100%" height="100%" fill="url(#shade)"/>' : ''}</svg>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs>${definitions}<linearGradient id="shade" x2="0%" y2="100%"><stop stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".18"/></linearGradient></defs>${rectangles}</svg>`;
  const image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  if (glowCache.size >= 128) glowCache.clear();
  glowCache.set(key, image);
  return image;
}

export function applyGradeGlow(target: HTMLElement, grade: string) {
  target.classList.toggle('aegis-gold-glow', shouldGlow(grade, tileGlow));
  const color = settings.colorsEnabled && settings.colors[colorGrade(grade) as Grade];
  if (color) target.style.setProperty('--aegis-glow-color', color);
  else target.style.removeProperty('--aegis-glow-color');
  const parent = target.parentElement;
  if (target.matches('.item') && parent?.matches('.item-drag-container')) {
    parent.toggleAttribute('data-aegis-gradient-glow', target.classList.contains('aegis-gold-glow'));
    if (target.classList.contains('aegis-gold-glow')) parent.style.setProperty('--aegis-glow-image', gradeGlowImage(grade));
    else parent.style.removeProperty('--aegis-glow-image');
  }
}

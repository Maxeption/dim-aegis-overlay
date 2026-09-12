import { displayGrade } from './grade-colors';
import { gradeValue } from './grading';
import type { PreviewAppearance } from './preview-appearance';
import type { BadgeCategory } from './badge-presentation';

export interface PreviewItem {
  id: string;
  name: string;
  icon: string;
  power: string;
  grade: string;
  upgradeAvailable: boolean;
  isPerfect5of5?: boolean;
  isOmniRoll?: boolean;
  appearance?: PreviewAppearance;
  category?: BadgeCategory;
}

export function selectPreviewItems(items: PreviewItem[], ids: string[] = []): PreviewItem[] {
  const unique = [...new Map(items.map(item => [item.id, item])).values()];
  const selected = ids.map(id => unique.find(item => item.id === id)).filter((item): item is PreviewItem => !!item);
  const ranked = unique.sort((a, b) => gradeValue(displayGrade(b.grade)) - gradeValue(displayGrade(a.grade)));
  const add = (item?: PreviewItem) => {
    if (item && !selected.some(other => other.id === item.id) && selected.length < 3) selected.push(item);
  };
  if (!selected.length) add(ranked[0]);
  add([...ranked].reverse().find(item => !selected.some(other => other.grade === item.grade || other.name === item.name)));
  add(ranked.find(item => item.upgradeAvailable && !selected.some(other => other.name === item.name || other.grade === item.grade)));
  for (const item of ranked) if (!selected.some(other => other.grade === item.grade || other.name === item.name)) add(item);
  for (const item of ranked) if (!selected.some(other => other.name === item.name)) add(item);
  for (const item of ranked) add(item);
  return selected.slice(0, 3);
}

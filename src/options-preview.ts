import { applyGradeColors, applyGradeGlow, setTileGlow, resolveTileGlow } from './grade-colors';
import type { TileGlow } from './types';
import { applyBadgePresentation, normalizeBadgeVisibility, type BadgeVisibilitySettings } from './badge-presentation';

interface PreviewSettings {
  aegisBadgeVisibility?: BadgeVisibilitySettings;
  aegisBadgeStyle?: string;
  aegisBadgePosition?: string;
  aegisUpgradeStyle?: string;
  aegisMode?: string;
  aegisTwoTier?: boolean;
  aegisGradeDisplayMode?: string;
  aegisMaxTierGlow?: boolean;
  aegisTileGlow?: TileGlow;
}

let settings: PreviewSettings = {};

export function renderOptionsPreview() {
  const tile = document.getElementById('interactive-weapon-tile');
  if (!tile) return;

  setTileGlow(resolveTileGlow(settings.aegisTileGlow, settings.aegisMaxTierGlow));

  const badge = tile.querySelector<HTMLElement>('.aegis-badge');
  if (!badge) return;

  const style = settings.aegisBadgeStyle || 'classic';
  tile.classList.toggle('aegis-tile-footer', style === 'footer');
  const posVal = settings.aegisBadgePosition || 'bottom-left';
  const posKey = posVal.replace('bottom-left', 'bl').replace('top-left', 'tl').replace('top-right', 'tr').replace('bottom-right', 'br');

  // Preview grade string (BS+ in two-tier, S+ in standard)
  const gradeStr = settings.aegisTwoTier ? 'BS+' : 'S+';

  badge.className = `aegis-badge aegis-badge-s aegis-badge-wide aegis-style-${style} aegis-pos-${posKey}`;
  badge.replaceChildren();

  const label = document.createElement('span');
  label.className = 'aegis-grade-text';
  label.textContent = (style === 'classic' && !settings.aegisTwoTier ? '★ ' : '') + gradeStr;
  badge.append(label);

  if (settings.aegisUpgradeStyle && settings.aegisUpgradeStyle !== 'none') {
    const icon = document.createElement('span');
    icon.className = `aegis-badge-upgrade-arrow aegis-upgrade-${settings.aegisUpgradeStyle}`;
    icon.textContent = '▲';
    badge.append(icon);
  }

  applyGradeColors(badge);
  const visibility = normalizeBadgeVisibility(settings.aegisBadgeVisibility).weapon;
  applyBadgePresentation(badge, visibility);
  badge.classList.toggle('aegis-badge-hidden', visibility === 'off');

  applyGradeGlow(tile, visibility === 'off' ? '' : gradeStr);

  // Update corner targets active highlight
  tile.querySelectorAll<HTMLElement>('.corner-target').forEach(target => {
    target.classList.toggle('active-corner', target.dataset.pos === posVal);
  });
}

export function updateOptionsPreview(value: PreviewSettings) {
  settings = value;
  renderOptionsPreview();
}

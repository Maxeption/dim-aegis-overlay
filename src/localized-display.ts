import { getLocalizedPerkName, getLocalizedWeaponName, getLocalizedStatName, getPerkIcon } from './hash-translator';

type NameKind = 'perk' | 'weapon' | 'stat';

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]!));
}

function localizedName(kind: NameKind, source: string, fallback: string): string {
  const key = /^\d+$/.test(source) ? Number(source) : source;
  if (kind === 'perk') return getLocalizedPerkName(key, fallback);
  if (kind === 'weapon') return getLocalizedWeaponName(key, fallback);
  return getLocalizedStatName(source);
}

export function renderLocalizedName(kind: NameKind, source: string | number, fallback = String(source), className = ''): string {
  const name = localizedName(kind, String(source), fallback);
  return `<span class="${escapeAttribute(className)}" data-aegis-name-kind="${kind}" data-aegis-name="${escapeAttribute(String(source))}" data-aegis-name-fallback="${escapeAttribute(fallback)}">${escapeAttribute(name)}</span>`;
}

export function renderLocalizedWeaponReference(reference: string): string {
  const match = reference.match(/^(.*?)(\s+\([^()]*#[^()]*\))$/);
  return match ? renderLocalizedName('weapon', match[1]) + escapeAttribute(match[2])
    : renderLocalizedName('weapon', reference);
}

export function refreshLocalizedNames(root: ParentNode = document): void {
  for (const label of root.querySelectorAll<HTMLElement>('[data-aegis-name-kind]')) {
    const kind = label.getAttribute('data-aegis-name-kind') as NameKind;
    const source = label.getAttribute('data-aegis-name') || '';
    const fallback = label.getAttribute('data-aegis-name-fallback') || source;
    const name = localizedName(kind, source, fallback);
    const previousName = label.textContent || '';
    if (previousName !== name) label.textContent = name;

    const chip = label.closest<HTMLElement>('.aegis-perk-chip, .aegis-mw-badge');
    if (chip && previousName && previousName !== name) chip.title = chip.title.replace(previousName, name);
    if (kind !== 'perk' || !chip) continue;
    const icon = getPerkIcon(/^\d+$/.test(source) ? Number(source) : source);
    if (!icon) continue;
    let image = chip.querySelector<HTMLImageElement>('.aegis-chip-icon');
    if (!image) {
      image = document.createElement('img');
      image.className = 'aegis-chip-icon';
      chip.prepend(image);
    }
    const url = `https://www.bungie.net${icon}`;
    if (image.getAttribute('src') !== url) image.setAttribute('src', url);
  }
}

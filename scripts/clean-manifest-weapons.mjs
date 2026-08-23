/**
 * Clean and Optimize manifest-weapons.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'data', 'manifest-weapons.json');

const DAMAGE_ICONS = {
  Kinetic: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_3385a924f9666bf84dda72bb62773543.png',
  Arc: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_092d0666144eb35c018d6923b377ae1e.png',
  Solar: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_2a126e4341ecd516132f867b14a05c81.png',
  Void: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_ceb2f6197dccf3958bb31cc783eb97a0.png',
  Stasis: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_530c4c3e105ecb6660386f6f432ff34b.png',
  Strand: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_b2bc6c674a024b4e9f59265f2479e0a6.png',
};

const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function isDummy(str) {
  if (!str || typeof str !== 'string') return true;
  const s = str.toLowerCase().trim();
  return (
    s.includes('unknown') ||
    s.startsWith('empty ') ||
    s.startsWith('default ') ||
    s === 'none'
  );
}

function cleanList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(x => !isDummy(x)))];
}

const cleaned = [];

for (const w of raw) {
  if (!w.name || !w.icon) continue;
  if (w.name.startsWith('Dummy') || w.name.startsWith('Test ') || w.name.toLowerCase().includes('classified')) continue;

  const barrels = cleanList(w.barrels);
  const magazines = cleanList(w.magazines);
  const col3 = cleanList(w.perkColumns?.[0]);
  const col4 = cleanList(w.perkColumns?.[1]);
  const origins = cleanList(w.origins);
  const allPerks = cleanList([...barrels, ...magazines, ...col3, ...col4, ...origins]);

  // Skip completely empty weapons
  if (allPerks.length === 0 && col3.length === 0 && col4.length === 0) continue;

  // Add standard element icon if missing
  const damageIcon = w.damageIcon || DAMAGE_ICONS[w.damageType] || '';

  cleaned.push({
    ...w,
    damageIcon,
    barrels,
    magazines,
    origins,
    perkColumns: [col3, col4],
    perks: allPerks,
  });
}

// Smart deduplication for active versions
const groups = {};
for (const w of cleaned) {
  const norm = w.name.toLowerCase().trim();
  if (!groups[norm]) groups[norm] = [];
  groups[norm].push(w);
}

for (const group of Object.values(groups)) {
  if (group.length > 1) {
    group.sort((a, b) => {
      // 1. Prefer versions with real origin traits
      const aOrigins = a.origins.length > 0 ? 1 : 0;
      const bOrigins = b.origins.length > 0 ? 1 : 0;
      if (aOrigins !== bOrigins) return bOrigins - aOrigins;

      // 2. Prefer craftable or modern perk counts
      const aPerks = (a.perkColumns[0]?.length || 0) + (a.perkColumns[1]?.length || 0);
      const bPerks = (b.perkColumns[0]?.length || 0) + (b.perkColumns[1]?.length || 0);
      if (aPerks !== bPerks) return bPerks - aPerks;

      // 3. Prefer non-shiny standard icon
      return b.hash - a.hash;
    });

    group[0].superseded = false;
    for (let i = 1; i < group.length; i++) {
      group[i].superseded = true;
    }
  } else if (group.length === 1) {
    group[0].superseded = false;
  }
}

cleaned.sort((a, b) => a.name.localeCompare(b.name));

console.log(`Cleaned ${cleaned.length} weapons. Saving to ${manifestPath}...`);
fs.writeFileSync(manifestPath, JSON.stringify(cleaned, null, 2), 'utf8');
console.log('✅ Clean manifest saved.');

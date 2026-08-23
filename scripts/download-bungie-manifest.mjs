/**
 * Download & Parse Bungie Destiny 2 Weapon Manifest
 * 
 * Fetches the latest live definitions directly from Bungie API and outputs a
 * structured, complete weapon dataset to data/manifest-weapons.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputFile = path.join(root, 'data', 'manifest-weapons.json');

const BUNGIE_API_ROOT = 'https://www.bungie.net';

const AMMO_TYPE_NAMES = {
  1: 'Primary',
  2: 'Special',
  3: 'Heavy',
  0: 'Unknown',
};

const DAMAGE_TYPE_NAMES = {
  1: 'Kinetic',
  2: 'Arc',
  3: 'Solar',
  4: 'Void',
  5: 'Raid',
  6: 'Stasis',
  7: 'Strand',
};

async function fetchJson(url) {
  console.log(`  Fetching ${url}...`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'DIM-Aegis-Overlay-Builder/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

async function run() {
  console.log('🚀 Connecting to Bungie Manifest API...');
  const manifestMeta = await fetchJson(`${BUNGIE_API_ROOT}/Platform/Destiny2/Manifest/`);
  const enPaths = manifestMeta?.Response?.jsonWorldComponentContentPaths?.en;
  if (!enPaths) {
    throw new Error('Could not find English manifest component paths in Bungie API response');
  }

  console.log('📥 Downloading Bungie definitions...');
  const [itemsDef, plugSetsDef, damageTypesDef, collectiblesDef] = await Promise.all([
    fetchJson(`${BUNGIE_API_ROOT}${enPaths.DestinyInventoryItemDefinition}`),
    fetchJson(`${BUNGIE_API_ROOT}${enPaths.DestinyPlugSetDefinition}`),
    fetchJson(`${BUNGIE_API_ROOT}${enPaths.DestinyDamageTypeDefinition}`),
    fetchJson(`${BUNGIE_API_ROOT}${enPaths.DestinyCollectibleDefinition}`),
  ]);

  console.log(`✓ Downloaded ${Object.keys(itemsDef).length} item definitions`);
  console.log(`✓ Downloaded ${Object.keys(plugSetsDef).length} plug set definitions`);

  // Build collectible mapping for source strings
  const itemToSource = {};
  for (const c of Object.values(collectiblesDef)) {
    if (c.itemHash && c.sourceString) {
      itemToSource[c.itemHash] = c.sourceString;
    }
  }

  // Helper to get plug names from plug sets
  function getPlugNamesFromSet(plugSetHash) {
    const plugSet = plugSetsDef[plugSetHash];
    if (!plugSet || !Array.isArray(plugSet.reusablePlugItems)) return [];
    const names = [];
    for (const entry of plugSet.reusablePlugItems) {
      if (!entry.plugItemHash) continue;
      const plug = itemsDef[entry.plugItemHash];
      if (plug && plug.displayProperties && plug.displayProperties.name) {
        const pName = plug.displayProperties.name.trim();
        if (pName && !pName.toLowerCase().includes('unknown') && !names.includes(pName)) {
          names.push(pName);
        }
      }
    }
    return names;
  }

  const weapons = [];

  for (const [hashStr, item] of Object.entries(itemsDef)) {
    if (!item.displayProperties || !item.displayProperties.name) continue;
    // Check if item is a weapon (itemType === 3)
    const isWeapon =
      item.itemType === 3 ||
      (item.itemCategoryHashes && item.itemCategoryHashes.includes(1)) ||
      (item.sockets && item.itemTypeDisplayName && item.itemTypeDisplayName.toLowerCase().includes('weapon'));

    if (!isWeapon) continue;

    const hash = Number(hashStr);
    const name = item.displayProperties.name.trim();
    if (!name || name.startsWith('Dummy') || name.startsWith('Test ') || name.toLowerCase().includes('classified')) {
      continue;
    }

    const icon = item.displayProperties.icon ? `${BUNGIE_API_ROOT}${item.displayProperties.icon}` : '';
    const watermark = item.iconWatermark ? `${BUNGIE_API_ROOT}${item.iconWatermark}` : (item.iconWatermarkShelved ? `${BUNGIE_API_ROOT}${item.iconWatermarkShelved}` : '');
    const typeName = item.itemTypeDisplayName || 'Weapon';
    const tierName = item.inventory?.tierTypeName || 'Legendary';
    const ammoType = AMMO_TYPE_NAMES[item.equippingBlock?.ammoType] || 'Primary';

    // Damage type
    const defaultDamageType = item.defaultDamageType || 1;
    const damageTypeObj = damageTypesDef[item.defaultDamageTypeId || defaultDamageType] || {};
    const damageType = DAMAGE_TYPE_NAMES[defaultDamageType] || damageTypeObj.displayProperties?.name || 'Kinetic';
    const damageIcon = damageTypeObj.displayProperties?.icon ? `${BUNGIE_API_ROOT}${damageTypeObj.displayProperties.icon}` : '';

    // RPM / Charge Time
    let rpm = '';
    if (item.stats && item.stats.stats) {
      // 428488797 = Rounds Per Minute, 2961396640 = Charge Time, 3871231066 = Draw Time
      const rpmStat = item.stats.stats['428488797'] || item.stats.stats['2961396640'] || item.stats.stats['3871231066'];
      if (rpmStat && rpmStat.value) {
        rpm = String(rpmStat.value);
      }
    }

    // Intrinsic Archetype / Frame
    let archetype = '';
    const socketEntries = item.sockets?.socketEntries || [];
    for (const socket of socketEntries) {
      if (socket.singleInitialItemHash) {
        const plug = itemsDef[socket.singleInitialItemHash];
        if (plug && plug.itemTypeDisplayName && (plug.itemTypeDisplayName.includes('Frame') || plug.itemTypeDisplayName.includes('Intrinsic') || plug.itemTypeDisplayName.includes('Glaive'))) {
          archetype = plug.displayProperties?.name || plug.itemTypeDisplayName;
          break;
        }
      }
    }

    // Perk Columns extraction
    let col1Barrels = [];
    let col2Mags = [];
    let col3Perks = [];
    let col4Perks = [];
    let col5Origins = [];

    let traitColumnIndex = 0;

    for (const socket of socketEntries) {
      const plugSetHashes = [
        socket.randomizedPlugSetHash,
        socket.reusablePlugSetHash,
      ].filter(h => typeof h === 'number' && h > 0);

      let plugNames = [];
      for (const psHash of plugSetHashes) {
        plugNames.push(...getPlugNamesFromSet(psHash));
      }

      // Fallback to reusablePlugItems
      if (plugNames.length === 0 && Array.isArray(socket.reusablePlugItems)) {
        for (const rpi of socket.reusablePlugItems) {
          const plug = itemsDef[rpi.plugItemHash];
          if (plug?.displayProperties?.name) {
            const pName = plug.displayProperties.name.trim();
            if (!plugNames.includes(pName)) plugNames.push(pName);
          }
        }
      }

      if (plugNames.length === 0) continue;
      plugNames = [...new Set(plugNames)];

      // Inspect first plug to determine socket category
      const firstPlugHash = socket.randomizedPlugSetHash
        ? plugSetsDef[socket.randomizedPlugSetHash]?.reusablePlugItems?.[0]?.plugItemHash
        : (socket.reusablePlugItems?.[0]?.plugItemHash || socket.singleInitialItemHash);
      const firstPlug = firstPlugHash ? itemsDef[firstPlugHash] : null;
      const plugCat = (firstPlug?.plug?.plugCategoryIdentifier || '').toLowerCase();
      const plugType = (firstPlug?.itemTypeDisplayName || '').toLowerCase();

      if (plugCat.includes('barrel') || plugCat.includes('sight') || plugCat.includes('scope') || plugType.includes('barrel') || plugType.includes('sight') || plugType.includes('scope') || plugCat.includes('tube') || plugCat.includes('bowstring') || plugCat.includes('blade')) {
        col1Barrels.push(...plugNames);
      } else if (plugCat.includes('magazine') || plugCat.includes('battery') || plugCat.includes('mag') || plugType.includes('magazine') || plugType.includes('battery') || plugCat.includes('arrow') || plugCat.includes('guard')) {
        col2Mags.push(...plugNames);
      } else if (plugCat.includes('origin') || plugType.includes('origin') || plugCat.includes('trait.origin')) {
        col5Origins.push(...plugNames);
      } else if (plugCat.includes('v400.plugs.weapons.traits') || plugCat.includes('traits') || plugCat.includes('perk') || plugType.includes('trait') || plugCat.includes('frames')) {
        traitColumnIndex++;
        if (traitColumnIndex === 1) {
          col3Perks.push(...plugNames);
        } else if (traitColumnIndex === 2) {
          col4Perks.push(...plugNames);
        }
      }
    }

    col1Barrels = [...new Set(col1Barrels)];
    col2Mags = [...new Set(col2Mags)];
    col3Perks = [...new Set(col3Perks)];
    col4Perks = [...new Set(col4Perks)];
    col5Origins = [...new Set(col5Origins)];

    const allPerks = [...new Set([...col1Barrels, ...col2Mags, ...col3Perks, ...col4Perks, ...col5Origins])];

    const isCraftable = !!(item.inventory?.recipeItemHash || item.recipeItemHash);
    const sourceName = itemToSource[hash] || null;

    weapons.push({
      hash,
      name,
      icon,
      typeName,
      tierName,
      damageType,
      damageIcon,
      ammoType,
      watermark,
      seasonName: item.seasonHash ? `Season ${item.seasonHash}` : null,
      sourceName,
      rpm: rpm ? Number(rpm) || rpm : undefined,
      archetype: archetype || undefined,
      perks: allPerks,
      perkColumns: [col3Perks, col4Perks],
      barrels: col1Barrels,
      magazines: col2Mags,
      origins: col5Origins,
      isCraftable,
      superseded: false,
    });
  }

  // Deduplicate and mark superseded versions
  const nameGroups = {};
  for (const w of weapons) {
    const norm = w.name.toLowerCase().trim();
    if (!nameGroups[norm]) nameGroups[norm] = [];
    nameGroups[norm].push(w);
  }

  for (const group of Object.values(nameGroups)) {
    if (group.length > 1) {
      // Find the best/active version (highest perk count, or not sunset)
      group.sort((a, b) => {
        const aPerks = (a.perkColumns[0]?.length || 0) + (a.perkColumns[1]?.length || 0);
        const bPerks = (b.perkColumns[0]?.length || 0) + (b.perkColumns[1]?.length || 0);
        if (bPerks !== aPerks) return bPerks - aPerks;
        return b.hash - a.hash;
      });

      // Top entry is active, rest are superseded
      group[0].superseded = false;
      for (let i = 1; i < group.length; i++) {
        group[i].superseded = true;
      }
    }
  }

  weapons.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\n💾 Writing ${weapons.length} parsed weapons to ${outputFile}...`);
  fs.writeFileSync(outputFile, JSON.stringify(weapons, null, 2), 'utf8');
  console.log('✅ Done! Successfully updated manifest-weapons.json directly from Bungie API.\n');
}

run().catch((err) => {
  console.error('❌ Manifest download failed:', err);
  process.exit(1);
});

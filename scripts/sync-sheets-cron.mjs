import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AEGIS_PVE_SHEET_ID = '1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY';
const FINNALD_PVP_SHEET_ID = '1TVgtTRWNGEPi6OMlTLxXFSKUTi_ycwykhwuw8EW_jJ0';
const LOWCO_ARMOR_SHEET_ID = '14LnzOhmeXzKaSV3OR35pQJkclg6vLC4YmKtlKTctY3o';
const LOWCO_ARMOR_GID = '631213508';

const PVE_WEAPON_TABS = [
  'Autos', 'Bows', 'HCs', 'Pulses', 'Scouts', 'Sidearms', 'SMGs',
  'BGLs', 'Fusions', 'Glaives', 'Shotguns', 'Snipers',
  'Rocket Sidearms', 'Traces', 'HGLs', 'LFRs', 'LMGs', 'Rockets',
  'Swords', 'Other', 'Exotic Weapons'
];

function decodeHtml(html) {
  return (html || '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseHtmlTable(htmlText) {
  const rowMatches = [...htmlText.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)];
  const rows = [];
  for (const r of rowMatches) {
    const cells = [...r[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map(m => decodeHtml(m[1]));
    rows.push(cells);
  }
  return rows;
}

function parseCSV(text) {
  const normalizedText = text.replace(/\r\n|\r/g, '\n');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < normalizedText.length; i++) {
    const c = normalizedText[i], nx = normalizedText[i + 1];
    if (inQ) {
      if (c === '"' && nx === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchHtmlViewMetadata(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const text = await res.text();
  
  const regex = /items\.push\(\s*\{\s*name:\s*"([^"]+)"\s*,\s*pageUrl:\s*"([^"]+)"\s*,\s*gid:\s*"([^"]+)"/g;
  const matches = [...text.matchAll(regex)];
  const tabs = {};
  for (const m of matches) {
    const name = m[1].replace(/\\x26/g, '&').replace(/\\'/g, "'").trim();
    const gid = m[3].trim();
    tabs[name] = gid;
  }
  return tabs;
}

async function fetchTabRows(sheetId, tabName, gid) {
  if (gid) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview/sheet?headers=true&gid=${gid}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const text = await res.text();
        const rows = parseHtmlTable(text);
        if (rows.length >= 2) return rows;
      }
    } catch (e) {
      console.warn(`[HTML fetch error for ${tabName}]:`, e.message);
    }
  }

  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const text = await res.text();
      if (!text.trimStart().startsWith('<')) {
        return parseCSV(text);
      }
    }
  } catch (e) {}

  return [];
}

function normName(s) {
  return (s ?? '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractVersionTag(name) {
  const match = name.match(/(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)/i);
  return match ? match[1].toLowerCase() : '';
}

function stripEdition(name) {
  return name
    .replace(/\s*\([^)]+\)\s*$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)\s+version$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)$/gi, '')
    .trim();
}

function parseShoppingList(rows) {
  const items = [];
  const byName = {};
  const alternativesMap = {};

  if (rows.length < 2) return { items, byName, alternativesMap };

  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    if (rows[r].some(c => c.trim().toLowerCase() === 'name' || c.trim().toLowerCase() === 'role')) {
      headerRowIndex = r;
      break;
    }
  }

  const header = rows[headerRowIndex].map(h => h.trim().toLowerCase());
  const roleIdx = header.indexOf('role');
  const nameIdx = header.indexOf('name');
  const sourceIdx = header.indexOf('source');
  const numIdx = header.indexOf('#');
  const priorityIdx = header.indexOf('priority');
  const col1Idx = header.indexOf('column 1');
  const col2Idx = header.indexOf('column 2');
  const altIdx = header.indexOf('alternatives');

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawName = (row[nameIdx] || '').replace(/\n+/g, ' ').trim();
    if (!rawName || rawName.toLowerCase() === 'name') continue;

    const role = (row[roleIdx] || '').replace(/\n+/g, ' ').trim();
    const source = (row[sourceIdx] || '').replace(/\n+/g, ' ').trim();
    const priorityNum = parseInt(row[numIdx] || '3', 10) || 3;
    const rawPriority = (row[priorityIdx] || '').toLowerCase().trim();
    const priority =
      rawPriority === 'high' || rawPriority === 'medium' || rawPriority === 'low' || rawPriority === 'niche'
        ? rawPriority
        : (priorityNum === 1 ? 'high' : priorityNum === 2 ? 'medium' : priorityNum === 3 ? 'low' : 'niche');

    const col1 = (row[col1Idx] || '').trim();
    const col2 = (row[col2Idx] || '').trim();
    const rawAlts = (row[altIdx] || '').trim();
    let alternatives = [];
    if (rawAlts && rawAlts.toUpperCase() !== 'N/A' && rawAlts !== '-' && rawAlts.toUpperCase() !== 'NA' && rawAlts.toUpperCase() !== 'NONE') {
      alternatives = rawAlts
        .split(/[\/\n\\]+/)
        .map(a => a.trim())
        .filter(a => a && a.toUpperCase() !== 'N/A' && a !== '-' && a.toUpperCase() !== 'NA' && a.toUpperCase() !== 'NONE' && a.toUpperCase() !== 'N' && a.toUpperCase() !== 'A');
    }

    const rLow = role.toLowerCase();
    const sLow = source.toLowerCase();
    const c1Low = col1.toLowerCase();
    const nLow = rawName.toLowerCase();

    const isArmor =
      rLow.includes('dr') ||
      rLow.includes('pcs') ||
      rLow.includes('armor') ||
      rLow.includes('regen') ||
      rLow.includes('augmentation') ||
      c1Low.includes('specialist') ||
      c1Low.includes('powerhouse') ||
      c1Low.includes('gunner') ||
      c1Low.includes('skirmisher') ||
      (sLow.includes('rahool') && (!col2 || col2 === 'N/A' || col2 === '-'));

    const isExotic =
      sLow.includes('rahool') ||
      sLow.includes('kiosk') ||
      sLow.includes('monument') ||
      nLow.includes('exotic');

    const item = {
      role,
      name: rawName,
      source,
      priorityNum,
      priority,
      column1: col1,
      column2: col2,
      alternatives,
      isArmor,
      isExotic,
    };

    items.push(item);
    byName[normName(rawName)] = item;

    for (const alt of alternatives) {
      alternativesMap[normName(alt)] = {
        primaryName: rawName,
        role,
        priority,
        priorityNum,
      };
    }
  }

  return { items, byName, alternativesMap };
}

function parseWeaponRows(rows, categoryName, weapons, variants, categories) {
  if (rows.length < 2) return;

  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    if (rows[r].some(c => c.trim().toLowerCase() === 'name')) {
      headerRowIndex = r;
      break;
    }
  }

  const header = rows[headerRowIndex];
  const idx = {};
  header.forEach((col, i) => {
    idx[col.trim()] = i;
  });

  const getVal = (row, keys) => {
    for (const k of keys) {
      const i = idx[k];
      if (i !== undefined) {
        return (row[i] ?? '').trim();
      }
    }
    return '';
  };

  const categoryWeapons = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const nameVal = getVal(row, ['Name']);
    if (!nameVal || nameVal.toLowerCase() === 'name') continue;

    const weaponName = nameVal.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    const normalized = normName(weaponName);
    const baseNormalized = normName(stripEdition(weaponName));
    const versionTag = extractVersionTag(weaponName);

    const usageVal = getVal(row, ['Usage', 'ANALYSIS Notes', 'Notes', 'Role / Notes']);
    const descVal = getVal(row, ['Description']);

    const roamSymbol = getVal(row, ['ANALYSIS Roam', 'Roam']);
    const dpsSymbol = getVal(row, ['DPS']);
    const challSymbol = getVal(row, ['Chall', 'Challenge']);
    const speedSymbol = getVal(row, ['Speed', 'Speedrun']);

    const trialsSymbol = getVal(row, ['ANALYSIS Trials', 'Trials']);
    const compSymbol = getVal(row, ['Comp', 'Competitive']);
    const quickplaySymbol = getVal(row, ['Quickplay', '6v6']);
    const vsDrSymbol = getVal(row, ['vs DR', 'vsDR']);
    const duelSymbol = getVal(row, ['Duel', 'Dueling']);

    const tagsVal = getVal(row, ['Tags']);
    const stunVal = getVal(row, ['Stun']);

    const hasViability = roamSymbol || dpsSymbol || challSymbol || speedSymbol || trialsSymbol || compSymbol || quickplaySymbol || vsDrSymbol || duelSymbol || tagsVal || stunVal;

    const weaponData = {
      name: weaponName,
      energy: getVal(row, ['Energy', 'INFO Energy', 'Slot', 'Affinity', 'Type']),
      frame: getVal(row, ['Frame', 'Tags']),
      barrel: getVal(row, ['PERKS Barrel', 'Barrel']),
      mag: getVal(row, ['Mag', 'PERKS Mag', 'Magazine']),
      perk1: getVal(row, ['Perk 1', 'PERKS Perk 1', 'Column 1']),
      perk2: getVal(row, ['Perk 2', 'PERKS Perk 2', 'Column 2']),
      origin: getVal(row, ['Origin Trait', 'Origin', 'Stun']),
      source: getVal(row, ['Source', 'Where to get']),
      notes: usageVal || (descVal !== usageVal ? '' : descVal),
      description: descVal && descVal !== usageVal ? descVal : undefined,
      rank: getVal(row, ['Rank', 'WEAPON #', '#']),
      tier: getVal(row, ['Tier']),
      versionTag: versionTag || undefined,
      mw: getVal(row, ['MW', 'PERKS MW']),
      stun: stunVal || undefined,
      exoticViability: hasViability ? {
        roam: roamSymbol || undefined,
        dps: dpsSymbol || undefined,
        chall: challSymbol || undefined,
        speed: speedSymbol || undefined,
        trials: trialsSymbol || undefined,
        comp: compSymbol || undefined,
        quickplay: quickplaySymbol || undefined,
        vsDr: vsDrSymbol || undefined,
        duel: duelSymbol || undefined,
        tags: tagsVal || undefined,
        stun: stunVal || undefined,
      } : undefined,
    };

    weapons[normalized] = weaponData;
    
    if (!variants[baseNormalized]) {
      variants[baseNormalized] = [];
    }
    if (!variants[baseNormalized].some(v => v.name === weaponName)) {
      variants[baseNormalized].push(weaponData);
    }

    if (!weapons[baseNormalized]) {
      weapons[baseNormalized] = weaponData;
    }

    categoryWeapons.push(weaponData);
  }

  categoryWeapons.sort((a, b) => {
    const rA = parseInt(a.rank, 10);
    const rB = parseInt(b.rank, 10);
    return (isNaN(rA) ? 999 : rA) - (isNaN(rB) ? 999 : rB);
  });

  const catKey = categoryName || 'Other';
  if (!categories[catKey]) {
    categories[catKey] = [];
  }
  categories[catKey].push(...categoryWeapons);
}

async function buildPvEDatabase() {
  console.log('\n--- Building PvE Database ---');
  const tabs = await fetchHtmlViewMetadata(AEGIS_PVE_SHEET_ID);
  console.log(`Discovered ${Object.keys(tabs).length} tabs for PvE`);

  const weapons = {};
  const variants = {};
  const categories = {};
  const armor = {};
  const armorAegis = {};

  for (const tabName of PVE_WEAPON_TABS) {
    const gid = tabs[tabName];
    console.log(`Fetching PvE [${tabName}] (gid: ${gid || 'unknown'})...`);
    const rows = await fetchTabRows(AEGIS_PVE_SHEET_ID, tabName, gid);
    parseWeaponRows(rows, tabName, weapons, variants, categories);
  }

  // Set Bonuses
  const setBonusesGid = tabs['Set Bonuses'];
  if (setBonusesGid) {
    console.log(`Fetching PvE [Set Bonuses] (gid: ${setBonusesGid})...`);
    const setBonusRows = await fetchTabRows(AEGIS_PVE_SHEET_ID, 'Set Bonuses', setBonusesGid);
    if (setBonusRows.length >= 2) {
      let setHeaderIdx = 0;
      for (let r = 0; r < Math.min(setBonusRows.length, 5); r++) {
        if (setBonusRows[r].some(c => c.toLowerCase() === 'set' || c.toLowerCase() === 'set name')) {
          setHeaderIdx = r;
          break;
        }
      }
      const sHeader = setBonusRows[setHeaderIdx].map(h => h.trim().toLowerCase());
      const sNameIdx = sHeader.findIndex(h => h === 'set' || h === 'set name');
      const sBonusIdx = sHeader.findIndex(h => h === 'bonus' || h === 'bonus name');
      const sPcsIdx = sHeader.findIndex(h => h === 'pcs');
      const sDescIdx = sHeader.findIndex(h => h.includes('description'));
      const sTrigIdx = sHeader.findIndex(h => h.includes('trigger'));
      const sEffIdx = sHeader.findIndex(h => h.includes('effect'));
      const sTierIdx = sHeader.findIndex(h => h === 'tier');

      for (let r = setHeaderIdx + 1; r < setBonusRows.length; r++) {
        const row = setBonusRows[r];
        const rawSetName = (row[sNameIdx] ?? '').trim();
        if (!rawSetName || rawSetName.toLowerCase() === 'set' || rawSetName.toLowerCase() === 'set name') continue;

        const cleanSetName = rawSetName.split('\n')[0].replace(/\s+(2|4)\s*pcs\.?$/i, '').trim();
        const source = rawSetName.split('\n')[1] ? rawSetName.split('\n')[1].trim() : '';
        const setKey = cleanSetName.toLowerCase();

        if (!armorAegis[setKey]) {
          armorAegis[setKey] = {
            setName: cleanSetName,
            piece2Name: 'None',
            piece2Desc: 'No 2-piece set bonus listed.',
            piece2Numbers: '',
            piece2Rating: 'F',
            piece4Name: 'None',
            piece4Desc: 'No 4-piece set bonus listed.',
            piece4Numbers: '',
            piece4Rating: 'F',
            source: source,
            sourceType: 'Activity',
          };
        }

        const setObj = armorAegis[setKey];
        const bonusName = (row[sBonusIdx] ?? '').trim();
        const pcs = (row[sPcsIdx] ?? '').trim();
        const desc = (row[sDescIdx] ?? '').trim();
        const trigger = (row[sTrigIdx] ?? '').trim();
        const effect = (row[sEffIdx] ?? '').trim();
        const tier = (row[sTierIdx] ?? '').trim();

        if (pcs === '2') {
          setObj.piece2Name = bonusName;
          setObj.piece2Desc = desc;
          setObj.piece2Numbers = `Trigger: ${trigger} | Effect: ${effect}`;
          setObj.piece2Rating = tier;
        } else if (pcs === '4') {
          setObj.piece4Name = bonusName;
          setObj.piece4Desc = desc;
          setObj.piece4Numbers = `Trigger: ${trigger} | Effect: ${effect}`;
          setObj.piece4Rating = tier;
        }
      }
    }
  }

  // LowCo Armor
  try {
    console.log(`Fetching LowCo Armor (gid: ${LOWCO_ARMOR_GID})...`);
    const lowcoRows = await fetchTabRows(LOWCO_ARMOR_SHEET_ID, 'Armor', LOWCO_ARMOR_GID);
    if (lowcoRows.length >= 3) {
      for (let r = 2; r < lowcoRows.length; r++) {
        const row = lowcoRows[r];
        let offset = 0;
        if (/^\d+$/.test((row[0] || '').trim()) && row.length >= 12) {
          offset = 1;
        }
        const setName = (row[offset + 0] ?? '').trim();
        if (!setName || setName === 'Set Name' || setName === 'Set Pick List' || setName.toLowerCase().includes('notes:')) continue;
        if ((row[offset + 1] ?? '').trim() === 'Name') continue;

        const armorData = {
          setName,
          piece2Name: (row[offset + 1] ?? '').trim(),
          piece2Desc: (row[offset + 2] ?? '').trim(),
          piece2Numbers: (row[offset + 3] ?? '').trim(),
          piece2Rating: (row[offset + 4] ?? '').trim(),
          piece4Name: (row[offset + 5] ?? '').trim(),
          piece4Desc: (row[offset + 6] ?? '').trim(),
          piece4Numbers: (row[offset + 7] ?? '').trim(),
          piece4Rating: (row[offset + 8] ?? '').trim(),
          source: (row[offset + 9] ?? '').trim(),
          sourceType: (row[offset + 10] ?? '').trim(),
        };
        armor[setName.toLowerCase().trim()] = armorData;
      }
    }
  } catch (e) {}

  for (const [key, aegisData] of Object.entries(armorAegis)) {
    const lowcoData = armor[key];
    if (lowcoData) {
      if (lowcoData.source) aegisData.source = lowcoData.source;
      if (lowcoData.sourceType) aegisData.sourceType = lowcoData.sourceType;
    }
  }

  // Shopping list
  const shoppingGid = tabs['Shopping List'];
  let shopping = { items: [], byName: {}, alternativesMap: {} };
  if (shoppingGid) {
    console.log(`Fetching PvE [Shopping List] (gid: ${shoppingGid})...`);
    const shoppingRows = await fetchTabRows(AEGIS_PVE_SHEET_ID, 'Shopping List', shoppingGid);
    shopping = parseShoppingList(shoppingRows);
  }

  console.log(`✓ PvE Database built: ${Object.keys(weapons).length} weapons, ${shopping.items.length} shopping items.`);
  return { weapons, variants, categories, armor, armorAegis, shopping };
}

async function buildPvPDatabase() {
  console.log('\n--- Building PvP Database ---');
  const tabs = await fetchHtmlViewMetadata(FINNALD_PVP_SHEET_ID);
  console.log(`Discovered ${Object.keys(tabs).length} tabs for PvP`);

  const weapons = {};
  const variants = {};
  const categories = {};
  const armor = {};
  const armorAegis = {};

  // Fetch Legendary Weapons
  const legGid = tabs['Legendary Weapons'];
  if (legGid) {
    console.log(`Fetching PvP [Legendary Weapons] (gid: ${legGid})...`);
    const legRows = await fetchTabRows(FINNALD_PVP_SHEET_ID, 'Legendary Weapons', legGid);
    parseWeaponRows(legRows, 'Legendary Weapons', weapons, variants, categories);
  }

  // Fetch Exotic Weapons
  const exoticGid = tabs['Exotic Weapons'];
  if (exoticGid) {
    console.log(`Fetching PvP [Exotic Weapons] (gid: ${exoticGid})...`);
    const exoticRows = await fetchTabRows(FINNALD_PVP_SHEET_ID, 'Exotic Weapons', exoticGid);
    parseWeaponRows(exoticRows, 'Exotic Weapons', weapons, variants, categories);
  }

  // Also check if any archetype tabs exist
  for (const tabName of PVE_WEAPON_TABS) {
    const gid = tabs[tabName];
    if (gid && tabName !== 'Exotic Weapons') {
      console.log(`Fetching PvP [${tabName}] (gid: ${gid})...`);
      const rows = await fetchTabRows(FINNALD_PVP_SHEET_ID, tabName, gid);
      parseWeaponRows(rows, tabName, weapons, variants, categories);
    }
  }

  // Set Bonuses
  const setBonusesGid = tabs['Set Bonuses'];
  if (setBonusesGid) {
    console.log(`Fetching PvP [Set Bonuses] (gid: ${setBonusesGid})...`);
    const setBonusRows = await fetchTabRows(FINNALD_PVP_SHEET_ID, 'Set Bonuses', setBonusesGid);
    if (setBonusRows.length >= 2) {
      let setHeaderIdx = 0;
      for (let r = 0; r < Math.min(setBonusRows.length, 5); r++) {
        if (setBonusRows[r].some(c => c.toLowerCase() === 'set name')) {
          setHeaderIdx = r;
          break;
        }
      }
      const sHeader = setBonusRows[setHeaderIdx].map(h => h.trim().toLowerCase());
      const sNameIdx = sHeader.indexOf('set name');
      const sBonusIdx = sHeader.indexOf('bonus name');
      const sPcsIdx = sHeader.indexOf('pcs');
      const sDescIdx = sHeader.indexOf('description');
      const sTrigIdx = sHeader.indexOf('trigger');
      const sEffIdx = sHeader.indexOf('effect');
      const sTierIdx = sHeader.indexOf('tier');

      for (let r = setHeaderIdx + 1; r < setBonusRows.length; r++) {
        const row = setBonusRows[r];
        const rawSetName = (row[sNameIdx] ?? '').trim();
        if (!rawSetName || rawSetName.toLowerCase() === 'set name') continue;

        const cleanSetName = rawSetName.replace(/\s+(2|4)\s*pcs\.?$/i, '').trim();
        const setKey = cleanSetName.toLowerCase();

        if (!armorAegis[setKey]) {
          armorAegis[setKey] = {
            setName: cleanSetName,
            piece2Name: '',
            piece2Desc: '',
            piece2Numbers: '',
            piece2Rating: '',
            piece4Name: '',
            piece4Desc: '',
            piece4Numbers: '',
            piece4Rating: '',
            source: '',
            sourceType: '',
          };
        }

        const setObj = armorAegis[setKey];
        const bonusName = (row[sBonusIdx] ?? '').trim();
        const pcs = (row[sPcsIdx] ?? '').trim();
        const desc = (row[sDescIdx] ?? '').trim();
        const trigger = (row[sTrigIdx] ?? '').trim();
        const effect = (row[sEffIdx] ?? '').trim();
        const tier = (row[sTierIdx] ?? '').trim();

        if (pcs === '2') {
          setObj.piece2Name = bonusName;
          setObj.piece2Desc = desc;
          setObj.piece2Numbers = `Trigger: ${trigger} | Effect: ${effect}`;
          setObj.piece2Rating = tier;
        } else if (pcs === '4') {
          setObj.piece4Name = bonusName;
          setObj.piece4Desc = desc;
          setObj.piece4Numbers = `Trigger: ${trigger} | Effect: ${effect}`;
          setObj.piece4Rating = tier;
        }
      }
    }
  }

  // Shopping list
  const shoppingGid = tabs['Shopping List'];
  let shopping = { items: [], byName: {}, alternativesMap: {} };
  if (shoppingGid) {
    console.log(`Fetching PvP [Shopping List] (gid: ${shoppingGid})...`);
    const shoppingRows = await fetchTabRows(FINNALD_PVP_SHEET_ID, 'Shopping List', shoppingGid);
    shopping = parseShoppingList(shoppingRows);
  }

  console.log(`✓ PvP Database built: ${Object.keys(weapons).length} weapons, ${shopping.items.length} shopping items.`);
  return { weapons, variants, categories, armor, armorAegis, shopping };
}

async function main() {
  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const pveDb = await buildPvEDatabase();
  const pvePath = path.join(dataDir, 'pve-database.json');
  fs.writeFileSync(pvePath, JSON.stringify(pveDb, null, 2), 'utf-8');
  console.log(`Saved: ${pvePath} (${(fs.statSync(pvePath).size / 1024).toFixed(1)} KB)`);

  const pvpDb = await buildPvPDatabase();
  const pvpPath = path.join(dataDir, 'pvp-database.json');
  fs.writeFileSync(pvpPath, JSON.stringify(pvpDb, null, 2), 'utf-8');
  console.log(`Saved: ${pvpPath} (${(fs.statSync(pvpPath).size / 1024).toFixed(1)} KB)`);

  console.log('\n✅ All databases successfully compiled and saved!');
}

main().catch(err => {
  console.error('Fatal error building databases:', err);
  process.exit(1);
});

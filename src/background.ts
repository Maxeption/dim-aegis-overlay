import { parseWishlist } from './parser';
import { AegisSheetDatabase, AegisSheetWeapon, AegisArmorSet, AegisShoppingDatabase, AegisShoppingItem } from './types';

const DEFAULT_URL =
  'https://raw.githubusercontent.com/charlesxcaliber/DIMAegisWeaponWishlist/main/MrCharlesWishlist_MRB_PPC2.txt';

const SYNC_ALARM_NAME = 'sync-wishlist-alarm';
const LGG_ROLL_APPRAISER_URL = 'https://www.light.gg/god-roll/roll-appraiser/';

/**
 * Fetches the wishlist from the configured URL, parses it, and caches it in local storage.
 *
 * @param url Optional override URL. If omitted, uses the configured URL from storage or the default.
 */
async function fetchAndCacheWishlist(url?: string): Promise<{ success: boolean; count?: number; error?: string }> {
  let targetUrl: string = url || '';

  if (!targetUrl) {
    const storage = await chrome.storage.local.get('wishlistUrl');
    targetUrl = storage.wishlistUrl || DEFAULT_URL;
  }

  // Update status to loading
  await chrome.storage.local.set({
    syncStatus: 'loading',
    syncError: null,
    wishlistUrl: targetUrl,
  });

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const parsedDb = parseWishlist(text);
    const parsedCount = Object.keys(parsedDb).length;

    // Fetch enhanced-to-normal perk mapping
    let enhancedToNormal: Record<number, number> = {};
    try {
      const mapResponse = await fetch(
        'https://raw.githubusercontent.com/DestinyItemManager/d2-additional-info/master/output/trait-to-enhanced-trait.json'
      );
      if (mapResponse.ok) {
        const normalToEnhanced = (await mapResponse.json()) as Record<string, number>;
        for (const [normalStr, enhanced] of Object.entries(normalToEnhanced)) {
          const normal = parseInt(normalStr, 10);
          if (!isNaN(normal) && enhanced) {
            enhancedToNormal[enhanced] = normal;
          }
        }
      }
    } catch (mapErr) {
      console.error('Failed to fetch enhanced perk mapping:', mapErr);
    }

    await chrome.storage.local.set({
      wishlistData: parsedDb,
      lastUpdated: Date.now(),
      syncStatus: 'success',
      syncError: null,
      parsedCount,
      enhancedToNormal,
    });

    console.log(`Wishlist sync complete. Parsed ${parsedCount} items from: ${targetUrl}`);
    return { success: true, count: parsedCount };
  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.error('Wishlist sync failed:', errMsg);

    await chrome.storage.local.set({
      syncStatus: 'error',
      syncError: errMsg,
    });

    return { success: false, error: errMsg };
  }
}

const SHEET_ID = '1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY';
const PVP_SHEET_ID = '1TVgtTRWNGEPi6OMlTLxXFSKUTi_ycwykhwuw8EW_jJ0';
const ARMOR_SHEET_ID = '14LnzOhmeXzKaSV3OR35pQJkclg6vLC4YmKtlKTctY3o';
const ARMOR_GID = '631213508';
const ALL_TABS = [
  'Autos', 'Bows', 'HCs', 'Pulses', 'Scouts', 'Sidearms', 'SMGs',
  'BGLs', 'Fusions', 'Glaives', 'Shotguns', 'Snipers',
  'Rocket Sidearms', 'Traces', 'HGLs', 'LFRs', 'LMGs', 'Rockets',
  'Swords', 'Other', 'Exotic Weapons',
];

function parseCSV(text: string): string[][] {
  const normalizedText = text.replace(/\r\n|\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
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

function normName(s: string): string {
  return (s ?? '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractVersionTag(name: string): string {
  const match = name.match(/(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)/i);
  return match ? match[1].toLowerCase() : '';
}

function stripEdition(name: string): string {
  return name
    .replace(/\s*\([^)]+\)\s*$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)\s+version$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)$/gi, '')
    .trim();
}

async function fetchSpreadsheetDatabase(sheetId: string, tabs: string[]): Promise<AegisSheetDatabase> {
  const weapons: Record<string, AegisSheetWeapon> = {};
  const variants: Record<string, AegisSheetWeapon[]> = {};
  const categories: Record<string, AegisSheetWeapon[]> = {};

  const promises = tabs.map(async (tab) => {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) return;

      const csvText = await res.text();
      if (csvText.trimStart().startsWith('<')) return;

      const rows = parseCSV(csvText);
      if (rows.length < 2) return;

      let headerRowIndex = 0;
      for (let r = 0; r < Math.min(rows.length, 3); r++) {
        if (rows[r].some(c => c.trim().toLowerCase() === 'name')) {
          headerRowIndex = r;
          break;
        }
      }

      const header = rows[headerRowIndex];
      const idx: Record<string, number> = {};
      header.forEach((col, i) => {
        idx[col.trim()] = i;
      });

      const getVal = (row: string[], keys: string[]) => {
        for (const k of keys) {
          const i = idx[k];
          if (i !== undefined) {
            return (row[i] ?? '').trim();
          }
        }
        return '';
      };

      const categoryWeapons: AegisSheetWeapon[] = [];

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

        const weaponData: AegisSheetWeapon = {
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
        if (!variants[baseNormalized].some((v: any) => v.name === weaponName)) {
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

      categories[tab] = categoryWeapons;
    } catch (tabErr: any) {
      console.warn(`[Aegis] Skipping tab "${tab}": ${tabErr.message}`);
    }
  });

  await Promise.all(promises);

  // Fetch LowCo armor sets sheet
  const armorUrl = `https://docs.google.com/spreadsheets/d/${ARMOR_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${ARMOR_GID}`;
  const armor: Record<string, AegisArmorSet> = {};
  try {
    const armorRes = await fetch(armorUrl, { credentials: 'omit' });
    if (armorRes.ok) {
      const armorCsvText = await armorRes.text();
      if (!armorCsvText.trimStart().startsWith('<')) {
        const armorRows = parseCSV(armorCsvText);
        if (armorRows.length >= 3) {
          for (let r = 2; r < armorRows.length; r++) {
            const row = armorRows[r];
            const setName = (row[0] ?? '').trim();
            if (!setName || setName === 'Set Name' || setName === 'Set Pick List' || setName.toLowerCase().includes('notes:')) {
              continue;
            }
            if ((row[1] ?? '').trim() === 'Name') continue;

            const armorData: AegisArmorSet = {
              setName,
              piece2Name: (row[1] ?? '').trim(),
              piece2Desc: (row[2] ?? '').trim(),
              piece2Numbers: (row[3] ?? '').trim(),
              piece2Rating: (row[4] ?? '').trim(),
              piece4Name: (row[5] ?? '').trim(),
              piece4Desc: (row[6] ?? '').trim(),
              piece4Numbers: (row[7] ?? '').trim(),
              piece4Rating: (row[8] ?? '').trim(),
              source: (row[9] ?? '').trim(),
              sourceType: (row[10] ?? '').trim(),
            };

            armor[setName.toLowerCase().trim()] = armorData;
          }
        }
      }
    }
  } catch (armorErr) {}

  // Fetch Set Bonuses tab from the spreadsheet
  const aegisArmorUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Set Bonuses')}`;
  const armorAegis: Record<string, AegisArmorSet> = {};
  try {
    const aegisArmorRes = await fetch(aegisArmorUrl, { credentials: 'omit' });
    if (aegisArmorRes.ok) {
      const csvText = await aegisArmorRes.text();
      const rows = parseCSV(csvText);
      if (rows.length >= 2) {
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (row.length < 12) continue;
          const rawSet = row[2] || '';
          if (!rawSet.trim()) continue;
          
          const parts = rawSet.split('\n');
          const setName = parts[0].trim();
          const source = parts[1] ? parts[1].trim() : '';
          const pcs = (row[5] || '').trim();
          const bonusName = (row[4] || '').trim();
          const trigger = (row[7] || '').trim();
          const effect = (row[8] || '').trim();
          const desc = (row[9] || '').trim();
          const tier = (row[11] || '').trim();

          const normalized = setName.toLowerCase().trim();
          if (!armorAegis[normalized]) {
            armorAegis[normalized] = {
              setName,
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

          const setObj = armorAegis[normalized];
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
  } catch (err) {}

  for (const [key, aegisData] of Object.entries(armorAegis)) {
    const lowcoData = armor[key];
    if (lowcoData) {
      if (lowcoData.source) aegisData.source = lowcoData.source;
      if (lowcoData.sourceType) aegisData.sourceType = lowcoData.sourceType;
    }
  }

  return { weapons, variants, categories, armor, armorAegis };
}

/**
 * Fetches and parses Aegis's "Shopping List" tab containing curated endgame chase weapons & armor.
 */
async function fetchShoppingListDatabase(sheetId: string): Promise<AegisShoppingDatabase> {
  const items: AegisShoppingItem[] = [];
  const byName: Record<string, AegisShoppingItem> = {};
  const alternativesMap: Record<string, { primaryName: string; role: string; priority: string; priorityNum: number }> = {};

  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Shopping List')}`;
    const res = await fetch(url, { credentials: 'omit' });
    if (res.ok) {
      const csvText = await res.text();
      if (!csvText.trimStart().startsWith('<')) {
        const rows = parseCSV(csvText);
        if (rows.length >= 2) {
          let headerRowIndex = 0;
          for (let r = 0; r < Math.min(rows.length, 3); r++) {
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
            const priority: 'high' | 'medium' | 'low' | 'niche' =
              rawPriority === 'high' || rawPriority === 'medium' || rawPriority === 'low' || rawPriority === 'niche'
                ? rawPriority
                : (priorityNum === 1 ? 'high' : priorityNum === 2 ? 'medium' : priorityNum === 3 ? 'low' : 'niche');

            const col1 = (row[col1Idx] || '').trim();
            const col2 = (row[col2Idx] || '').trim();
            const rawAlts = row[altIdx] || '';
            const alternatives = rawAlts
              .split(/[\/\n\\]+/)
              .map(a => a.trim())
              .filter(a => a && a.toLowerCase() !== 'n/a');

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
              rLow.includes('exotic') ||
              sLow.includes('rahool') ||
              sLow.includes('monument') ||
              sLow.includes('kiosk') ||
              nLow.includes('exotic');

            const item: AegisShoppingItem = {
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
            byName[rawName.toLowerCase().trim()] = item;

            for (const alt of alternatives) {
              const altNorm = normName(alt);
              alternativesMap[altNorm] = {
                primaryName: rawName,
                role,
                priority,
                priorityNum,
              };
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('DIM Aegis Overlay: Failed to fetch Shopping List database:', err);
  }

  return { items, byName, alternativesMap };
}

/**
 * Fetches Aegis (PvE) and Finnald (PvP) spreadsheet tabs, parses them, and caches the output databases in local storage.
 */
async function fetchAndCacheAegisSheet(): Promise<{ success: boolean; error?: string }> {
  try {
    const aegisSheetDbPvE = await fetchSpreadsheetDatabase(SHEET_ID, ALL_TABS);
    const pvpTabs = [...ALL_TABS, 'Legendary Weapons'];
    const aegisSheetDbPvP = await fetchSpreadsheetDatabase(PVP_SHEET_ID, pvpTabs);
    const aegisShoppingDb = await fetchShoppingListDatabase(SHEET_ID);

    const storage = await chrome.storage.local.get(['aegisMode']);
    const aegisMode = storage.aegisMode || 'pve';
    const activeDb = aegisMode === 'pvp' ? aegisSheetDbPvP : aegisSheetDbPvE;

    await chrome.storage.local.set({
      aegisSheetDbPvE,
      aegisSheetDbPvP,
      aegisSheetDb: activeDb,
      aegisShoppingDb,
      aegisSheetLastSync: Date.now(),
    });

    return { success: true };
  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.error('DIM Aegis Overlay: Failed to fetch/cache Aegis spreadsheet:', errMsg);
    return { success: false, error: errMsg };
  }
}

async function syncAllData(url?: string): Promise<{ success: boolean; count?: number; error?: string }> {
  if (url) {
    // For manual wishlist sync, fetch only the wishlist to be instant and bypass slower/rate-limited sheet fetches.
    return await fetchAndCacheWishlist(url);
  }
  const wlRes = await fetchAndCacheWishlist();
  const sheetRes = await fetchAndCacheAegisSheet();
  
  // Asynchronously trigger version check
  checkForExtensionUpdates().catch(() => {});

  return {
    success: wlRes.success && sheetRes.success,
    count: wlRes.count,
    error: wlRes.error || sheetRes.error,
  };
}

// Set up periodic sync alarm (every 24 hours / 1440 minutes)
chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 24 * 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('Periodic alarm triggered. Synchronizing wishlist and spreadsheet...');
    syncAllData();
  }
});

// Run sync immediately on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('DIM Aegis Overlay installed. Performing initial data sync...');
  syncAllData();
  checkForExtensionUpdates().catch(() => {});
});

// Check/sync on startup if cache is missing or expired (older than 24 hours)
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(['lastUpdated', 'wishlistData', 'aegisSheetDb']);
  const dayInMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (!data.wishlistData || !data.aegisSheetDb || !data.lastUpdated || now - data.lastUpdated > dayInMs) {
    console.log('Cache missing or expired. Performing startup sync...');
    syncAllData();
  }
  checkForExtensionUpdates().catch(() => {});
});

/**
 * Opens the Light.gg Roll Appraiser in a hidden (inactive) tab.
 * Waits for the content script to signal completion via chrome.storage,
 * then closes the tab automatically.
 *
 * The content script writes { lightggSyncStatus: 'done' } when grades
 * are collected (either via API intercept or DOM scraping).
 */
async function syncLightGGInBackground(): Promise<{ success: boolean; count?: number; error?: string }> {
  // Mark as syncing
  await chrome.storage.local.set({ lightggSyncStatus: 'syncing', lightggSyncError: null });

  return new Promise((resolve) => {
    let tabId: number | null = null;
    let storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function cleanup(success: boolean, count?: number, error?: string) {
      if (timeoutId) clearTimeout(timeoutId);
      if (storageListener) chrome.storage.onChanged.removeListener(storageListener);
      if (tabId !== null) {
        chrome.tabs.remove(tabId).catch(() => {}); // Close the hidden tab
        tabId = null;
      }
      const status = success ? 'done' : 'error';
      chrome.storage.local.set({ lightggSyncStatus: status, lightggSyncError: error || null });
      resolve({ success, count, error });
    }

    // Watch for the content script to write { lightggSyncStatus: 'done' }
    storageListener = (changes, area) => {
      if (area !== 'local') return;
      if (changes.lightggSyncStatus && changes.lightggSyncStatus.newValue === 'done') {
        chrome.storage.local.get('lightggData', (res) => {
          const count = Object.keys(res.lightggData || {}).length;
          console.log(`[DIM Aegis Overlay] Light.gg background sync complete. ${count} weapons graded.`);
          cleanup(true, count);
        });
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    // Safety timeout: close tab after 45 seconds regardless
    timeoutId = setTimeout(() => {
      console.warn('[DIM Aegis Overlay] Light.gg background sync timed out.');
      cleanup(false, undefined, 'Sync timed out after 45 seconds. Light.gg may require you to be logged in.');
    }, 45000);

    // Open the Roll Appraiser in a background tab (not active, not focused)
    chrome.tabs.create({ url: LGG_ROLL_APPRAISER_URL, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab.id) {
        cleanup(false, undefined, chrome.runtime.lastError?.message || 'Failed to open tab');
        return;
      }
      tabId = tab.id;
      console.log(`[DIM Aegis Overlay] Opened hidden Light.gg tab (id=${tabId}) for background sync.`);
    });
  });
}

// Helper to handle auto-resync when DIM is launched
async function handleDimLaunched() {
  const data = await chrome.storage.local.get(['lastUpdated']);
  const dayInMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (!data.lastUpdated || now - data.lastUpdated > dayInMs) {
    console.log('DIM launched and database cache is expired. Triggering background auto-resync...');
    const res = await syncAllData();
    if (res.success) {
      notifyDimTabsOfUpdate(res.count || 0);
    }
  }
}

function notifyDimTabsOfUpdate(updatedCount: number) {
  chrome.tabs.query({ url: '*://*.destinyitemmanager.com/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showToast',
          message: `Spreadsheets synced automatically (${updatedCount} weapons cached)`
        }).catch(() => {});
      }
    }
  });
}

// Listen for messages from settings popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'dimLaunched') {
    handleDimLaunched().catch(console.error);
    return false;
  }

  if (message.action === 'syncNow') {
    syncAllData(message.url)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async sendResponse
  }

  if (message.action === 'syncLightGG') {
    syncLightGGInBackground()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async sendResponse
  }

  if (message.action === 'syncSpreadsheets') {
    fetchAndCacheAegisSheet()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'checkUpdates') {
    checkForExtensionUpdates()
      .then(() => {
        chrome.storage.local.get(['updateAvailableVersion'], (res) => {
          const currentVersion = chrome.runtime.getManifest().version;
          if (res.updateAvailableVersion && isNewerVersion(res.updateAvailableVersion, currentVersion)) {
            sendResponse({ success: true, updateAvailable: true, version: res.updateAvailableVersion });
          } else {
            sendResponse({ success: true, updateAvailable: false, version: currentVersion });
          }
        });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

/**
 * Compares two semantic version strings. Returns true if latest > current.
 */
function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const latestNum = isNaN(l[i]) ? 0 : l[i];
    const currentNum = isNaN(c[i]) ? 0 : c[i];
    if (latestNum > currentNum) return true;
    if (latestNum < currentNum) return false;
  }
  return false;
}

/**
 * Checks GitHub repository for updates and flags storage if a new version is available.
 */
async function checkForExtensionUpdates() {
  console.log('DIM Aegis Overlay: Checking for updates on GitHub...');
  const repoUrl = 'https://raw.githubusercontent.com/Maxeption/dim-aegis-overlay/master/package.json';
  try {
    const response = await fetch(repoUrl);
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    const latestVersion = data.version;
    const currentVersion = chrome.runtime.getManifest().version;

    if (isNewerVersion(latestVersion, currentVersion)) {
      const storage = await chrome.storage.local.get(['updateAvailableVersion']);
      if (storage.updateAvailableVersion !== latestVersion) {
        await chrome.storage.local.set({
          updateAvailableVersion: latestVersion,
          updateBannerDismissed: false
        });
        console.log(`DIM Aegis Overlay: New version v${latestVersion} available!`);
      }
    } else {
      await chrome.storage.local.remove(['updateAvailableVersion', 'updateBannerDismissed']);
      console.log('DIM Aegis Overlay: Extension is up to date.');
    }
  } catch (err) {
    console.error('DIM Aegis Overlay: Failed to check for extension updates:', err);
  }
}


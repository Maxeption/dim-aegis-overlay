/**
 * DIM Aegis Overlay - MAIN World Content Script
 *
 * This script runs in the MAIN world context of the Destiny Item Manager page.
 * It has direct access to the page's DOM elements and React Fiber properties.
 *
 * It periodically scans the DOM for item tile elements, extracts the Bungie weapon
 * hash and socketed perk hashes/names from the React Fiber, and serializes them
 * into custom DOM data-attributes (`data-aegis-*`).
 *
 * This allows the ISOLATED world content script to read the data securely and perform
 * wishlist calculations and UI injections without needing direct React Fiber access.
 */

import { WEAPON_STAT_HASHES } from './weapon-stats';

interface PerkInfo {
  name: string;
  icon: string;
}

// Global registry of all seen perks, shared via a hidden DOM element
const globalRegistry: Record<number, PerkInfo> = {};

function sendDiagnosticLog(msg: string) {
  const event = new CustomEvent('aegis-diagnostic-log', { detail: msg });
  document.dispatchEvent(event);
}

// Global cache for weapon instances to store full perk sets (e.g. from popups)
const instanceCache: Record<string, { perkHashes: number[]; perksDataMap: Record<number, PerkInfo>; equippedMasterwork?: string }> = {};

// Manifest database state variables for fast offline lookups
let manifestDbName: string | null = null;
let itemStoreName: string | null = null;
let plugSetStoreName: string | null = null;
let statStoreName: string | null = null;
let manifestKeyvalStoreName = 'keyval';
const weaponNameToHash: Record<string, number> = {};
const itemSocketsCount: Record<number, number> = {};

// Promise to handle startup race conditions between indexing and content requests
let indexReadyResolve: (() => void) | null = null;
const indexReadyPromise = new Promise<void>((resolve) => {
  indexReadyResolve = resolve;
});
let indexBuilt = false;

/**
 * Queries DIM's local IndexedDB databases for a perk definition by its hash.
 * Traverses all stores and handles both key-lookup and nested dictionary formats.
 */
async function getPerkFromDB(hash: number): Promise<PerkInfo | null> {
  await indexReadyPromise;
  const definition = await getDefinitionByHash(hash, 'DestinyInventoryItemDefinition');
  if (definition?.displayProperties?.name) {
    return { name: definition.displayProperties.name, icon: definition.displayProperties.icon || '' };
  }
  try {
    const dbs = await indexedDB.databases();
    for (const dbInfo of dbs) {
      if (!dbInfo.name) continue;
      // Skip third-party/unrelated databases
      if (dbInfo.name.includes('google') || dbInfo.name.includes('chrome')) continue;

      const db = await new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open(dbInfo.name!);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!db) continue;

      for (const storeName of Array.from(db.objectStoreNames)) {
        try {
          const val = await new Promise<any>((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            
            // Try numeric key lookup
            const req1 = store.get(hash);
            req1.onsuccess = () => {
              if (req1.result) resolve(req1.result);
              else {
                // Try string key lookup
                const req2 = store.get(String(hash));
                req2.onsuccess = () => resolve(req2.result);
                req2.onerror = () => resolve(null);
              }
            };
            req1.onerror = () => resolve(null);
          });

          if (val) {
            // Case A: The store yields a direct definition object
            if (val.displayProperties && val.displayProperties.name) {
              db.close();
              return {
                name: val.displayProperties.name,
                icon: val.displayProperties.icon || '',
              };
            }
            
            // Case B: The store holds a single large manifest object mapping hashes to definitions
            if (typeof val === 'object') {
              const inner = val[hash] || val[String(hash)];
              if (inner && inner.displayProperties && inner.displayProperties.name) {
                db.close();
                return {
                  name: inner.displayProperties.name,
                  icon: inner.displayProperties.icon || '',
                };
              }
            }
          }
        } catch (e) {
          // Ignore store access errors
        }
      }
      db.close();
    }
  } catch (err) {
    console.debug('Aegis Overlay: IndexedDB search failed', err);
  }
  return null;
}

const cachedDictionaries: Record<string, any> = {};

async function getManifestDictionaryByKey(keyName: string): Promise<any | null> {
  if (cachedDictionaries[keyName]) return cachedDictionaries[keyName];
  if (!manifestDbName) return null;

  sendDiagnosticLog(`Loading manifest dictionary from key "${keyName}" into memory cache...`);
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(manifestDbName!);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  if (!db) return null;

  try {
    const tx = db.transaction(manifestKeyvalStoreName, 'readonly');
    const store = tx.objectStore(manifestKeyvalStoreName);
    const val = await new Promise<any>((resolve) => {
      const req = store.get(keyName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (val) {
      cachedDictionaries[keyName] = val;
      sendDiagnosticLog(`Loaded key "${keyName}" successfully (entries: ${Object.keys(val).length}).`);
      return val;
    }
  } catch (e) {
    sendDiagnosticLog(`Failed to load key "${keyName}": ${String(e)}`);
  } finally {
    db.close();
  }
  return null;
}

/**
 * Generic helper to fetch any definition by its hash from a specific store.
 */
async function getDefinitionByHash(hash: number, storeName: string): Promise<any | null> {
  // If we are using keyval store, resolve key name and look up in memory cache
  if (itemStoreName && itemStoreName.includes(':')) {
    let targetKey: string | null = null;
    if (storeName === 'DestinyInventoryItemDefinition') {
      targetKey = itemStoreName.slice(itemStoreName.indexOf(':') + 1);
    } else if (storeName === 'DestinyPlugSetDefinition' && plugSetStoreName) {
      targetKey = plugSetStoreName.slice(plugSetStoreName.indexOf(':') + 1);
    } else if (storeName === 'DestinyStatDefinition' && statStoreName) {
      targetKey = statStoreName.slice(statStoreName.indexOf(':') + 1);
    }

    if (targetKey) {
      const dict = await getManifestDictionaryByKey(targetKey);
      if (dict) {
        const table = dict[storeName] || dict[storeName.replace(/^Destiny|Definition$/g, '')] || dict;
        return table[hash] || table[String(hash)] || null;
      }
    }
    return null;
  }

  // Otherwise, query IndexedDB directly (for separate-store databases)
  if (!manifestDbName) return null;
  const db = await getSharedManifestDb(manifestDbName);
  if (!db) return null;

  try {
    const resolvedStore = storeName === 'DestinyInventoryItemDefinition' ? itemStoreName
      : storeName === 'DestinyPlugSetDefinition' ? plugSetStoreName : statStoreName;
    if (!resolvedStore) return null;
    const tx = db.transaction(resolvedStore, 'readonly');
    const store = tx.objectStore(resolvedStore);

    const val = await new Promise<any>((resolve) => {
      const req1 = store.get(hash);
      req1.onsuccess = () => {
        if (req1.result) resolve(req1.result);
        else {
          const req2 = store.get(String(hash));
          req2.onsuccess = () => resolve(req2.result);
          req2.onerror = () => resolve(null);
        }
      };
      req1.onerror = () => resolve(null);
    });

    if (val) {
      if (val.displayProperties || val.reusablePlugItems || val.socketEntries) {
        return val;
      }
      if (typeof val === 'object') {
        const inner = val[hash] || val[String(hash)];
        if (inner) return inner;
      }
    }
  } catch (e) {
    // If transaction failed due to closed or aborted connection, invalidate pool
    sharedManifestDb = null;
    sharedManifestDbName = null;
  }
  return null;
}

let sharedManifestDb: IDBDatabase | null = null;
let sharedManifestDbName: string | null = null;

async function getSharedManifestDb(dbName: string): Promise<IDBDatabase | null> {
  if (sharedManifestDb && sharedManifestDbName === dbName) {
    return sharedManifestDb;
  }
  if (sharedManifestDb) {
    try { sharedManifestDb.close(); } catch (_) {}
    sharedManifestDb = null;
  }

  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

  if (db) {
    db.onversionchange = () => {
      try { db.close(); } catch (_) {}
      if (sharedManifestDb === db) {
        sharedManifestDb = null;
        sharedManifestDbName = null;
      }
    };
    db.onclose = () => {
      if (sharedManifestDb === db) {
        sharedManifestDb = null;
        sharedManifestDbName = null;
      }
    };
    sharedManifestDb = db;
    sharedManifestDbName = dbName;
  }

  return db;
}

/**
 * Restores and parses possible perks for a given weapon by name from the Bungie manifest database.
 */
async function getWeaponPossiblePerksByName(weaponName: string): Promise<{
  barrels: string[];
  mags: string[];
  perk1s: string[];
  perk2s: string[];
  origins: string[];
  isFromManifest?: boolean;
} | null> {
  sendDiagnosticLog(`Received request for possible perks of "${weaponName}"...`);
  if (!indexBuilt) {
    sendDiagnosticLog(`Weapon index is not built yet. Deferring request for "${weaponName}"...`);
    await indexReadyPromise;
    sendDiagnosticLog(`Index resolved. Resuming request for "${weaponName}"...`);
  }

  const normName = weaponName.toLowerCase().trim();
  let hash = weaponNameToHash[normName];
  if (!hash) {
    const cleanName = normName
      .replace(/\s*\([^)]+\)\s*/g, ' ')
      .replace(/\s+(pantheon version|adept|timelost|harrowed|brave|reprised|reissued|sunset)\b/gi, '')
      .trim();
    hash = weaponNameToHash[cleanName];
  }
  if (!hash) {
    sendDiagnosticLog(`Error: Weapon "${weaponName}" not found in manifest index (Total weapons indexed: ${Object.keys(weaponNameToHash).length}).`);
    return null;
  }

  sendDiagnosticLog(`Found weapon "${weaponName}" hash in index: ${hash}. Fetching definition...`);

  if (!itemStoreName || !plugSetStoreName) {
    sendDiagnosticLog('Error: Manifest stores not initialized.');
    return null;
  }

  const weaponDef = await getDefinitionByHash(hash, 'DestinyInventoryItemDefinition');
  if (!weaponDef || !weaponDef.sockets || !weaponDef.sockets.socketEntries) {
    return null;
  }

  const possibleBarrels: string[] = [];
  const possibleMags: string[] = [];
  const possiblePerk1s: string[] = [];
  const possiblePerk2s: string[] = [];
  const possibleOrigins: string[] = [];
  let traitSocketsSeen = 0;

  for (const entry of weaponDef.sockets.socketEntries) {
    // Some sockets expose both a random-roll and a reusable plug set.  They are
    // alternatives for the same socket, so collect both before classifying it.
    const plugSetHashes = [...new Set([
      entry.randomizedPlugSetHash,
      entry.reusablePlugSetHash,
    ].filter((hash): hash is number => typeof hash === 'number' && hash > 0))];

    const plugSets: any[][] = [];
    let categoryDef: any = null;

    if (plugSetHashes.length > 0) {
      for (const plugSetHash of plugSetHashes) {
        const plugSetDef = await getDefinitionByHash(plugSetHash, 'DestinyPlugSetDefinition');
        const plugItems = plugSetDef?.reusablePlugItems;
        if (!Array.isArray(plugItems) || plugItems.length === 0) continue;
        plugSets.push(plugItems);
        if (!categoryDef) {
          categoryDef = await getDefinitionByHash(plugItems[0].plugItemHash, 'DestinyInventoryItemDefinition');
        }
      }
    } else {
      // Fallback for static/non-randomized sockets (like fixed origin traits or static perk columns)
      const plugItems = entry.reusablePlugItems;
      if (Array.isArray(plugItems) && plugItems.length > 0) {
        plugSets.push(plugItems);
        categoryDef = await getDefinitionByHash(plugItems[0].plugItemHash, 'DestinyInventoryItemDefinition');
      }

      if (entry.singleInitialItemHash) {
        const initialDef = await getDefinitionByHash(entry.singleInitialItemHash, 'DestinyInventoryItemDefinition');
        if (initialDef) {
          if (!categoryDef) {
            categoryDef = initialDef;
            plugSets.push([{ plugItemHash: entry.singleInitialItemHash }]);
          }
        }
      }
    }

    if (!categoryDef || plugSets.length === 0) continue;

    let slotCategory = detectPlugCategory(categoryDef);
    sendDiagnosticLog(`Socket entry: firstPlug="${categoryDef.displayProperties?.name}", categoryId="${categoryDef.plug?.plugCategoryIdentifier}", detectedCategory="${slotCategory}"`);

    if (slotCategory === 'trait') {
      traitSocketsSeen++;
      slotCategory = traitSocketsSeen === 1 ? 'perk1' : 'perk2';
      sendDiagnosticLog(`Mapped trait socket #${traitSocketsSeen} to category "${slotCategory}"`);
    }

    if (slotCategory === 'skip' || slotCategory === 'intrinsic' || !slotCategory) {
      sendDiagnosticLog(`Skipping socket category "${slotCategory}"`);
      continue;
    }

    // Query and categorize every plug from every set assigned to this socket.
    const perksDataMapToRegister: Record<number, PerkInfo> = {};
    for (const plugItems of plugSets) {
      for (const plugItem of plugItems) {
        const plugDef = await getDefinitionByHash(plugItem.plugItemHash, 'DestinyInventoryItemDefinition');
        if (!plugDef?.displayProperties?.name) continue;
        const name = plugDef.displayProperties.name;
        perksDataMapToRegister[plugItem.plugItemHash] = {
          name,
          icon: plugDef.displayProperties.icon || '',
        };

        if (slotCategory === 'barrel') {
          if (!possibleBarrels.includes(name)) possibleBarrels.push(name);
        } else if (slotCategory === 'mag') {
          if (!possibleMags.includes(name)) possibleMags.push(name);
        } else if (slotCategory === 'perk1') {
          if (!possiblePerk1s.includes(name)) possiblePerk1s.push(name);
        } else if (slotCategory === 'perk2') {
          if (!possiblePerk2s.includes(name)) possiblePerk2s.push(name);
        } else if (slotCategory === 'origin') {
          if (!possibleOrigins.includes(name)) possibleOrigins.push(name);
        }
      }
    }

    registerPerks(perksDataMapToRegister);
  }

  sendDiagnosticLog(`Finished possible perks for "${weaponName}". Barrels: ${possibleBarrels.length}, Mags: ${possibleMags.length}, Perk1s: ${possiblePerk1s.length}, Perk2s: ${possiblePerk2s.length}, Origins: ${possibleOrigins.length}`);

  return {
    barrels: possibleBarrels.sort(),
    mags: possibleMags.sort(),
    perk1s: possiblePerk1s.sort(),
    perk2s: possiblePerk2s.sort(),
    origins: possibleOrigins.sort(),
    isFromManifest: true,
  };
}

/**
 * Attaches a MutationObserver to the registry element to listen for on-demand perk name requests
 * and weapon-specific perk list requests.
 */
const observedRegistries = new WeakSet<HTMLElement>();

function setupRegistryObserver(registryEl: HTMLElement) {
  if (observedRegistries.has(registryEl)) return;
  observedRegistries.add(registryEl);
  const regObserver = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-request-hashes') {
        const hashesStr = registryEl.getAttribute('data-request-hashes');
        if (hashesStr) {
          // Clear request attribute to avoid loop triggers
          registryEl.removeAttribute('data-request-hashes');

          const hashes = hashesStr
            .split(',')
            .map((h) => parseInt(h.trim(), 10))
            .filter((h) => !isNaN(h));
          
          let updated = false;

          for (const hash of hashes) {
            // Only search if the name is not yet resolved
            if (!globalRegistry[hash] || globalRegistry[hash].name.includes('Perk #')) {
              const info = await getPerkFromDB(hash);
              if (info) {
                globalRegistry[hash] = info;
                updated = true;
              }
            }
          }

          if (updated) {
            registryEl.setAttribute('data-registry', JSON.stringify(globalRegistry));
          }
        }
      }

      if (mutation.type === 'attributes' && mutation.attributeName === 'data-request-weapon-hashes') {
        const requestStr = registryEl.getAttribute('data-request-weapon-hashes');
        if (requestStr) {
          registryEl.removeAttribute('data-request-weapon-hashes');
          await indexReadyPromise;
          let updated = false;
          for (const hash of new Set(requestStr.split(',').map(Number).filter(Number.isFinite))) {
            if (globalWeaponRegistry[hash]) continue;
            const definition = await getDefinitionByHash(hash, 'DestinyInventoryItemDefinition');
            if (definition?.displayProperties?.name) {
              globalWeaponRegistry[hash] = definition.displayProperties.name;
              updated = true;
            }
          }
          if (updated) flushWeaponRegistry();
        }
      }

      if (mutation.type === 'attributes' && mutation.attributeName === 'data-request-weapon-perks') {
        const requestStr = registryEl.getAttribute('data-request-weapon-perks');
        if (requestStr) {
          registryEl.removeAttribute('data-request-weapon-perks');
          let weaponNames: string[] = [];
          try { weaponNames = JSON.parse(requestStr); } catch { /* ignore malformed requests */ }
          const results = [];
          for (const weaponName of [...new Set(weaponNames)].filter(Boolean)) {
            const possible = await getWeaponPossiblePerksByName(weaponName);
            results.push({ name: weaponName, possible, error: possible ? undefined : 'Unable to read weapon perks from the DIM manifest.' });
          }
          registryEl.setAttribute('data-weapon-perks-response', JSON.stringify({ results }));
        }
      }
    }
  });

  regObserver.observe(registryEl, {
    attributes: true,
    attributeFilter: ['data-request-hashes', 'data-request-weapon-hashes', 'data-request-weapon-perks'],
  });
  for (const attribute of ['data-request-hashes', 'data-request-weapon-hashes', 'data-request-weapon-perks']) {
    const pending = registryEl.getAttribute(attribute);
    if (pending) registryEl.setAttribute(attribute, pending);
  }
}



/**
 * Updates the global perk registry DOM element with newly seen perks.
 * Serializing the entire registry on every scan pass is expensive and floods
 * the isolated-world observer with huge JSON.parse jobs, so flushes are
 * throttled to a trailing write at most once per second.
 */
let registryFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushRegistry() {
  registryFlushTimer = null;
  const registryEl = document.getElementById('aegis-global-perk-registry');
  if (registryEl) {
    registryEl.setAttribute('data-registry', JSON.stringify(globalRegistry));
  }
}

function scheduleRegistryFlush() {
  if (registryFlushTimer) return;
  registryFlushTimer = setTimeout(flushRegistry, 1000);
}

function registerPerks(perksMap: Record<number, PerkInfo>) {
  let updated = false;
  for (const [hashStr, info] of Object.entries(perksMap)) {
    const hash = Number(hashStr);
    if (!globalRegistry[hash] && info.name && !info.name.includes('Unknown')) {
      globalRegistry[hash] = info;
      updated = true;
    }
  }

  let registryEl = document.getElementById('aegis-global-perk-registry');
  if (!registryEl) {
    registryEl = document.createElement('div');
    registryEl.id = 'aegis-global-perk-registry';
    registryEl.style.display = 'none';
    document.body.appendChild(registryEl);
    setupRegistryObserver(registryEl);
    updated = true; // Force initial sync
  }

  if (updated) {
    scheduleRegistryFlush();
  }
}


/**
 * Finds the React Fiber node associated with a DOM element.
 * The React fiber key name is stable per session, so cache it after the
 * first lookup to avoid allocating the full key array on every call.
 */
let cachedFiberKey: string | null = null;

function findReactFiber(el: HTMLElement): any {
  if (cachedFiberKey) {
    const fiber = (el as any)[cachedFiberKey];
    if (fiber) return fiber;
  }
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
  );
  if (key) cachedFiberKey = key;
  return key ? (el as any)[key] : null;
}

/**
 * Extracts the item object from a fiber node's props.
 * Returns the item if it has a `hash` property, otherwise null.
 */
function extractItemFromFiberProps(props: any): any {
  if (!props) return null;
  // Direct item prop
  if (props.item && typeof props.item === 'object' && 'hash' in props.item) {
    return props.item;
  }
  // dimItem prop (alternate naming used in some DIM components)
  if (props.dimItem && typeof props.dimItem === 'object' && 'hash' in props.dimItem) {
    return props.dimItem;
  }
  // Children wrapper pattern
  if (props.children && props.children.props) {
    const childProps = props.children.props;
    if (childProps.item && typeof childProps.item === 'object' && 'hash' in childProps.item) {
      return childProps.item;
    }
    if (childProps.dimItem && typeof childProps.dimItem === 'object' && 'hash' in childProps.dimItem) {
      return childProps.dimItem;
    }
  }
  return null;
}

/**
 * Traverses the React Fiber tree (up AND down) to locate the component containing the 'item' prop.
 */
function findItemInFiber(fiber: any): any {
  // --- Phase 1: Search UPWARD via curr.return ---
  let curr = fiber;
  let depth = 0;
  while (curr && depth < 40) {
    // Stop upward traversal if this component represents a plug/socket/mod
    if (curr.memoizedProps) {
      const p = curr.memoizedProps;
      if (p.plug || p.socket || p.socketInfo || p.socketDef || p.plugItem || p.mod || p.isPlug || p.isSocket) {
        return null;
      }
    }
    if (curr.pendingProps) {
      const p = curr.pendingProps;
      if (p.plug || p.socket || p.socketInfo || p.socketDef || p.plugItem || p.mod || p.isPlug || p.isSocket) {
        return null;
      }
    }

    const item =
      extractItemFromFiberProps(curr.memoizedProps) ||
      extractItemFromFiberProps(curr.pendingProps) ||
      extractItemFromFiberProps(curr.stateNode?.props);
    if (item) return item;
    curr = curr.return;
    depth++;
  }

  // --- Phase 2: Search DOWNWARD via child/sibling traversal (BFS) ---
  // Sometimes the fiber is a wrapper and the item prop is on a child component
  const queue: any[] = [fiber];
  const visited = new Set<any>();
  let bfsDepth = 0;
  while (queue.length > 0 && bfsDepth < 80) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);

    const item =
      extractItemFromFiberProps(node.memoizedProps) ||
      extractItemFromFiberProps(node.pendingProps) ||
      extractItemFromFiberProps(node.stateNode?.props);
    if (item) return item;

    if (node.child) queue.push(node.child);
    if (node.sibling) queue.push(node.sibling);
    bfsDepth++;
  }

  return null;
}


/**
 * Returns the slot category for a plug definition using multiple signals.
 * Primary: plug.plugCategoryIdentifier (most stable Bungie API field)
 * Fallback: itemTypeDisplayName (human-readable but locale-dependent)
 * Returns: 'barrel' | 'mag' | 'origin' | 'trait' | 'intrinsic' | 'skip' | ''
 */
const detectPlugCategory = (def: any): string => {
  if (!def) return '';

  // --- Primary signal: plugCategoryIdentifier ---
  // e.g. "weapon_barrel", "weapon_magazine", "weapon_perks_0", "frames"
  const catId = (def.plug?.plugCategoryIdentifier || '').toLowerCase();
  if (catId) {
    // Barrels / Scopes (all weapon types, including exotic)
    if (catId.startsWith('weapon_barrel') || catId.startsWith('weapon_scope') ||
        catId.startsWith('bow_string') || catId.startsWith('sword_blade') ||
        catId.startsWith('sword_guard') || catId.includes('_barrel') || catId.includes('_scope')) {
      return 'barrel';
    }
    // Magazines / Batteries / Arrows (all weapon types)
    if (catId.startsWith('weapon_magazine') || catId.startsWith('weapon_battery') ||
        catId.startsWith('bow_arrow') || catId.startsWith('grenade_launcher_barrel') ||
        catId.includes('_magazine') || catId.includes('_battery') || catId.includes('_arrow')) {
      return 'mag';
    }
    // Intrinsic frame / exotic perk (skip from Chase List)
    if (catId === 'frames' || catId === 'intrinsics' || catId.startsWith('weapon_intrinsic') ||
        catId.startsWith('exotic_intrinsic') || catId.includes('_intrinsic') || catId === 'exotic_weapon') {
      const typeName = (def.itemTypeDisplayName || '').toLowerCase();
      if (typeName.includes('perk') || (typeName.includes('trait') && !typeName.includes('intrinsic'))) {
        return 'trait';
      }
      return 'intrinsic';
    }
    // Masterworks, mods, shaders, ornaments — not user-selectable perks
    if (catId.startsWith('weapon_masterwork') || catId === 'shader' ||
        catId.startsWith('mods_') || catId.includes('_mod') || catId.startsWith('ornaments') ||
        catId.startsWith('ghost_') || catId.startsWith('armor_')) {
      return 'skip';
    }
    // Origin traits (enhancements.season_*, origin_trait_*, etc.)
    if (catId.startsWith('enhancements.') || catId.includes('origin_trait') ||
        catId.includes('_origin') || catId.startsWith('origin')) {
      return 'origin';
    }
    // Weapon perks / traits (weapon_perks_0, weapon_perks_1, weapon_perks_tier2_*, etc.)
    if (catId.startsWith('weapon_perks') || catId.startsWith('weapon_perk') ||
        catId.includes('_perks') || catId.includes('_perk') || catId === 'word_perks') {
      return 'trait';
    }
  }

  // --- Fallback: itemTypeDisplayName ---
  // Note: Destiny 2 uses "Weapon Perk" (not "Trait") for random-roll perks
  const typeName = (def.itemTypeDisplayName || '').toLowerCase();
  if (typeName) {
    if (typeName.includes('barrel') || typeName.includes('scope') || typeName.includes('bowstring') ||
        typeName.includes('sword blade') || typeName.includes('sword guard')) return 'barrel';
    if (typeName.includes('magazine') || typeName.includes('battery') ||
        typeName.includes('arrow') || typeName.includes('blade') || typeName.includes('guard')) return 'mag';
    if (typeName.includes('origin')) return 'origin';
    if (typeName.includes('intrinsic') || typeName.includes('weapon frame') ||
        typeName === 'exotic weapon') return 'intrinsic';
    if (typeName.includes('masterwork') || typeName === 'shader') return 'skip';
    // "Weapon Perk" and "Weapon Trait" and similar → trait column
    if (typeName.includes('perk') || typeName.includes('trait')) return 'trait';
  }

  return ''; // Unknown — will be skipped for Chase List, but still tracked for scoring
};

/**
 * Scans a DOM element for item properties in its React Fiber and writes them to attributes.
 */
function processElement(el: HTMLElement) {
  try {
    // Exclude sub-elements inside popups, controls, or toolbars (e.g. tag selectors, stat rows, socket plugs, action buttons)
    const isPopupContainer = el.matches('[class*="ItemPopup"], [class*="item-popup"], .item-popup');
    if (!isPopupContainer) {
      const isSubElement = el.matches(`
        [class*="tag"], [class*="Tag"],
        [class*="control"], [class*="Control"],
        [class*="stat"], [class*="Stat"],
        [class*="socket"], [class*="Socket"],
        [class*="button"], [class*="Button"],
        [class*="action"], [class*="Action"],
        [class*="toolbar"], [class*="Toolbar"],
        button, svg, path
      `);
      if (isSubElement) {
        return;
      }
    }

    // Skip if any ancestor element is already annotated for an item.
    // This prevents double-annotating nested elements (e.g. a container div
    // AND its inner item tile both matching our selectors), which causes
    // content.ts to call removeBadge() on the inner element and delete
    // the badge that was just injected by the outer element's processing.
    if (el.parentElement?.closest('[data-aegis-item-hash]')) {
      return;
    }

    const fiber = findReactFiber(el);
    if (!fiber) return;

    const item = findItemInFiber(fiber);
    if (!item || !item.hash) return;

    // Verify that this element actually represents the item by matching the icon image src.
    // This prevents annotating mod/socket slots that climb up to the parent item in the fiber tree.
    // Skip this check for main popup containers, which contain various sub-images (emblems, stats, class icons).
    if (!isPopupContainer) {
      const imgEl = el.querySelector('img');
      if (imgEl && item.icon) {
        const imgPath = imgEl.getAttribute('src') || '';
        const iconPath = item.icon.toLowerCase();
        const iconFilename = iconPath.split('/').pop();
        if (iconFilename && !imgPath.toLowerCase().includes(iconFilename)) {
          return;
        }
      }
    }

    // Check if this item is a weapon or armor.
    const isWeapon =
      item.weapon === true ||
      item.bucket?.inWeapons === true ||
      item.itemCategoryHashes?.includes(1) ||
      (item.sockets && item.typeName?.toLowerCase().includes('weapon'));

    const isArmor =
      item.bucket?.inArmor === true ||
      (item.bucket && item.bucket.sort === 'Armor') ||
      item.itemCategoryHashes?.includes(20) ||
      ['helmet', 'gauntlets', 'chest armor', 'leg armor', 'class item'].some((t) => item.typeName?.toLowerCase().includes(t));

    if (!isWeapon && !isArmor) return;

    if (isArmor) {
      const newHash = String(item.hash);
      el.setAttribute('data-aegis-item-hash', newHash);
      el.setAttribute('data-aegis-item-name', item.name || 'Unknown Armor');
      el.setAttribute('data-aegis-item-type', 'armor');
      const instanceId = item.id;
      if (instanceId) {
        el.setAttribute('data-aegis-instance-id', String(instanceId));
      }

      // Extract armor socketed perks / intrinsic archetype
      const armorPerks: string[] = [];
      if (item.sockets && item.sockets.allSockets) {
        for (const s of item.sockets.allSockets) {
          const name = s?.plugged?.plugDef?.displayProperties?.name;
          if (name && !name.toLowerCase().includes('shader') && !name.toLowerCase().includes('ornament') && !name.toLowerCase().includes('energy')) {
            armorPerks.push(name);
          }
        }
      }
      if (armorPerks.length > 0) {
        el.setAttribute('data-aegis-armor-perks', JSON.stringify(armorPerks));
      }

      // Extract base stats if available
      if (item.stats && Array.isArray(item.stats)) {
        const statsMap: Record<string, number> = {};
        for (const st of item.stats) {
          const statName = st.stat?.displayProperties?.name || st.name || '';
          if (statName) {
            statsMap[statName.toLowerCase().trim()] = st.base ?? st.value ?? 0;
          }
        }
        el.setAttribute('data-aegis-armor-stats', JSON.stringify(statsMap));
      }

      // Clear weapon-specific attributes
      el.removeAttribute('data-aegis-perk-hashes');
      el.removeAttribute('data-aegis-perks-data');
      el.removeAttribute('data-aegis-active-perk-hashes');
      return;
    }

    let perkHashes: number[] = [];
    let activePerkHashes: number[] = []; // Only currently plugged perks
    let perksDataMap: Record<number, PerkInfo> = {};

    // Equipped Masterwork stat name (e.g. "Range", "Handling")
    let equippedMasterwork: string = '';

    // Categorized possible perks extracted directly from the React Fiber socket data.
    // perk1s = column 3 (first trait column), perk2s = column 4 (second trait column)
    const possibleBarrels: string[] = [];
    const possibleMags: string[] = [];
    const possiblePerk1s: string[] = [];
    const possiblePerk2s: string[] = [];
    const possibleOrigins: string[] = [];
    let traitSocketsSeen = 0; // Counts how many trait-type sockets we've processed

    // Read sockets to extract active and optional perks
    if (item.sockets && item.sockets.allSockets) {
      for (const socket of item.sockets.allSockets) {
        if (!socket) continue;

        // Determine the socket category from the reference plug (plugged or first option)
        const referenceDef = socket.plugged?.plugDef ?? socket.plugOptions?.[0]?.plugDef;
        let slotCategory = detectPlugCategory(referenceDef);

        // --- Detect equipped Masterwork via socket (Strategy 2 pre-check, handled after loop) ---
        // We keep a coarse early-detect here for the specific slot only

        // Assign trait sockets to perk1 (column 3) or perk2 (column 4) by order of appearance
        if (slotCategory === 'trait') {
          traitSocketsSeen++;
          slotCategory = traitSocketsSeen === 1 ? 'perk1' : 'perk2';
        }

        const slotNames: string[] = [];

        // 1. Current plugged perk
        if (socket.plugged && socket.plugged.plugDef) {
          const def = socket.plugged.plugDef;
          if (def.hash) {
            perkHashes.push(def.hash);
            activePerkHashes.push(def.hash);
            perksDataMap[def.hash] = {
              name: def.displayProperties?.name || 'Unknown Perk',
              icon: def.displayProperties?.icon || '',
            };
            const plugName = def.displayProperties?.name || '';
            if (plugName && slotCategory && slotCategory !== 'skip' && slotCategory !== 'intrinsic') {
              slotNames.push(plugName);
            }
          }
        }

        // 2. All selectable plug options (includes all possible barrel, mag, and trait options)
        if (socket.plugOptions) {
          for (const opt of socket.plugOptions) {
            if (opt.plugDef && opt.plugDef.hash) {
              const def = opt.plugDef;
              if (!perkHashes.includes(def.hash)) {
                perkHashes.push(def.hash);
              }
              perksDataMap[def.hash] = {
                name: def.displayProperties?.name || 'Unknown Perk',
                icon: def.displayProperties?.icon || '',
              };
              const plugName = def.displayProperties?.name || '';
              if (plugName && slotCategory && slotCategory !== 'skip' && slotCategory !== 'intrinsic') {
                if (!slotNames.includes(plugName)) slotNames.push(plugName);
              }
            }
          }
        }

        // Assign slot names to the correct category bucket
        if (slotNames.length > 0) {
          if (slotCategory === 'barrel') {
            slotNames.forEach(n => { if (!possibleBarrels.includes(n)) possibleBarrels.push(n); });
          } else if (slotCategory === 'mag') {
            slotNames.forEach(n => { if (!possibleMags.includes(n)) possibleMags.push(n); });
          } else if (slotCategory === 'perk1') {
            slotNames.forEach(n => { if (!possiblePerk1s.includes(n)) possiblePerk1s.push(n); });
          } else if (slotCategory === 'perk2') {
            slotNames.forEach(n => { if (!possiblePerk2s.includes(n)) possiblePerk2s.push(n); });
          } else if (slotCategory === 'origin') {
            slotNames.forEach(n => { if (!possibleOrigins.includes(n)) possibleOrigins.push(n); });
          }
        }
      }
    }

    // === Strategy 1: item.masterworkInfo — DIM surfaces this directly on the item object ===
    // DIM stores masterwork info in item.masterworkInfo.statName (e.g. "Range", "Handling")
    if (item.masterworkInfo) {
      // statName is the clean stat name (e.g. "Reload Speed", "Range", "Handling")
      // — use it directly without stripping since it won't contain "masterwork"
      const mwStatName =
        item.masterworkInfo.statName ||
        item.masterworkInfo.stat?.displayProperties?.name ||
        item.masterworkInfo.name ||
        item.masterworkInfo.typeName ||
        '';
      if (mwStatName) {
        // Strip "masterwork(ed)" as a whole word only (word boundary prevents mid-word cuts)
        equippedMasterwork = mwStatName
          .replace(/\bmasterwork(?:ed|s)?\b\s*:?\s*/gi, '')
          .replace(/:\s*/g, '')
          .trim();
      }
    }

    // === Strategy 2: Socket scan — look for weapon_masterwork* category ===
    if (!equippedMasterwork && item.sockets && item.sockets.allSockets) {
      for (const socket of item.sockets.allSockets) {
        if (!socket || !socket.plugged?.plugDef) continue;
        const def = socket.plugged.plugDef;
        const catId = (def.plug?.plugCategoryIdentifier || '').toLowerCase();
        const typeName = (def.itemTypeDisplayName || '').toLowerCase();
        // Match weapon masterwork or generic masterwork sockets
        if (catId.startsWith('weapon_masterwork') ||
            catId.includes('masterwork') ||
            typeName.includes('masterwork')) {
          const mwName = (def.displayProperties?.name || '').trim();
          if (mwName) {
            equippedMasterwork = mwName
              .replace(/\bmasterwork(?:ed|s)?\b\s*:?\s*/gi, '')
              .replace(/:\s*/g, '')
              .trim();
          }
          if (equippedMasterwork) break;
        }
      }
    }

    // === Normalize full D2 stat names to match sheet abbreviations ===
    // DIM uses "Reload Speed" but sheets typically say "Reload"; "Blast Radius" → stays, etc.

    // First: strip any "Tier N" prefix (present when statName is null for partial MW)
    // e.g. "tier 1stability" → "stability", "Tier 10Reload Speed" → "Reload Speed"
    equippedMasterwork = equippedMasterwork
      .replace(/\btier\s*\d+\s*/gi, '')
      .trim();

    const mwNormMap: Record<string, string> = {
      'reload speed': 'Reload',
      'reload': 'Reload',
      'charge time': 'Charge Time',
      'draw time': 'Draw Time',
      'blast radius': 'Blast Radius',
      'projectile speed': 'Velocity',
      'swing speed': 'Swing Speed',
      'range': 'Range',
      'handling': 'Handling',
      'stability': 'Stability',
      'velocity': 'Velocity',
      'impact': 'Impact',
    };
    const mwLower = equippedMasterwork.toLowerCase();
    if (mwNormMap[mwLower]) {
      equippedMasterwork = mwNormMap[mwLower];
    }

    console.debug(
      `[Aegis MW] ${item.name}: equipped="${equippedMasterwork}"`,
      'masterworkInfo:', item.masterworkInfo
    );

    // Instance ID cache logic (handles async loading and popup-to-grid sync)
    const instanceId = item.id;
    if (instanceId) {
      // If we scanned a complete perk list (>3 perks indicates full perks loaded)
      if (perkHashes.length > 3) {
        instanceCache[instanceId] = {
          perkHashes: [...perkHashes],
          perksDataMap: { ...perksDataMap },
          equippedMasterwork,
        };
      } else if (instanceCache[instanceId]) {
        // If current element lacks perks but we have it in cache, populate it!
        const cached = instanceCache[instanceId];
        for (const hash of cached.perkHashes) {
          if (!perkHashes.includes(hash)) {
            perkHashes.push(hash);
          }
        }
        Object.assign(perksDataMap, cached.perksDataMap);
        // Restore MW from cache if we didn't detect one directly
        if (!equippedMasterwork && cached.equippedMasterwork) {
          equippedMasterwork = cached.equippedMasterwork;
        }
      }
    }

    // Register all parsed perks in the global dictionary
    registerPerks(perksDataMap);

    const newHash = String(item.hash);
    const newPerks = perkHashes.join(',');

    const existingHash = el.getAttribute('data-aegis-item-hash');
    const existingPerks = el.getAttribute('data-aegis-perk-hashes');

    // Write categorized possible perks for the Chase List BEFORE the early-return check.
    // We always update this when we have meaningful data, regardless of whether the
    // perkHashes have changed (e.g. popup has more categorized data than a tile).
    if (possiblePerk1s.length > 0 || possiblePerk2s.length > 0 || possibleBarrels.length > 0) {
      const possiblePerksData = {
        barrels: possibleBarrels.sort(),
        mags: possibleMags.sort(),
        perk1s: possiblePerk1s.sort(),
        perk2s: possiblePerk2s.sort(),
        origins: possibleOrigins.sort(),
      };
      el.setAttribute('data-aegis-weapon-possible-perks', JSON.stringify(possiblePerksData));
    }

    // Always write the MW attribute before the early-return check so it's
    // never skipped on re-scans where only the hash/perks are unchanged.
    if (equippedMasterwork) {
      el.setAttribute('data-aegis-masterwork', equippedMasterwork);
    } else {
      el.removeAttribute('data-aegis-masterwork');
    }

    // Optimization: Avoid re-triggering content.ts if no scoring-relevant data changed
    if (existingHash === newHash && existingPerks === newPerks) {
      return;
    }

    // Set attributes for the isolated world content script to read
    el.setAttribute('data-aegis-item-hash', newHash);
    el.setAttribute('data-aegis-item-name', item.name || 'Unknown Weapon');
    el.setAttribute('data-aegis-perk-hashes', newPerks);
    el.setAttribute('data-aegis-perks-data', JSON.stringify(perksDataMap));
    el.setAttribute('data-aegis-active-perk-hashes', activePerkHashes.join(','));
    if (instanceId) {
      el.setAttribute('data-aegis-instance-id', String(instanceId));
    }

  } catch (e) {
    console.debug('Aegis Overlay: Element scan failed', e);
  }
}


const SELECTORS = [
  '[id^="item-"]',
  '[class*="StoreItem"]',
  '[class*="InventoryItem"]',
  '[class*="ItemTile"]',
  '[class*="item-tile"]',
  '.item',
  '.item-tile',
  '[class*="ItemPopup"]',
  '[class*="item-popup"]',
  '.item-popup',
].join(',');

/**
 * Queries the document for potential item elements and processes them.
 */
function scanPage() {
  const candidates = document.querySelectorAll<HTMLElement>(SELECTORS);
  for (let i = 0; i < candidates.length; i++) {
    processElement(candidates[i]);
  }
}

// 1. Periodic scanning to catch any missed updates (fallback only — the
// MutationObserver below handles the vast majority of DOM changes)
setInterval(scanPage, 10000);

// 2. Immediate scan on DOM modifications using MutationObserver.
// Mutations are batched and processed once per animation frame to avoid
// running selector queries + fiber walks for every single mutation record.
const pendingNodes: HTMLElement[] = [];
let scanScheduled = false;

function flushPendingNodes() {
  scanScheduled = false;
  const nodes = pendingNodes.splice(0, pendingNodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.isConnected) continue;
    if (node.matches && node.matches(SELECTORS)) {
      processElement(node);
    }
    const children = node.querySelectorAll<HTMLElement>(SELECTORS);
    children.forEach(processElement);
  }
}

const observer = new MutationObserver((mutations) => {
  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i];
    if (mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          pendingNodes.push(node);
        }
      });
    }
  }
  if (pendingNodes.length > 0 && !scanScheduled) {
    scanScheduled = true;
    requestAnimationFrame(flushPendingNodes);
  }
});

async function initManifestDatabase() {
  let retries = 0;
  const maxRetries = 15;

  const tryConnect = async (): Promise<boolean> => {
    try {
      const dbs = await indexedDB.databases();
      const dbNames = new Set<string>();
      for (const dbInfo of dbs) {
        if (dbInfo.name) dbNames.add(dbInfo.name);
      }

      const lang = (navigator.language || 'en').split('-')[0].toLowerCase();
      const fallbacks = [
        `destiny2-manifest-${lang}`,
        `destiny2-manifest-${navigator.language.toLowerCase()}`,
        'destiny2-manifest-en',
        'destiny2-manifest-en-us',
        'destiny2-manifest',
        'dim-manifest',
        'keyval-store',
        'localforage',
        'dim',
        'destiny-manifest'
      ];
      for (const f of fallbacks) {
        dbNames.add(f);
      }

      sendDiagnosticLog(`Scanning databases: ${Array.from(dbNames).join(', ')}`);

      for (const name of dbNames) {
        if (name.includes('google') || name.includes('chrome')) continue;

        sendDiagnosticLog(`Opening database "${name}"...`);
        const db = await new Promise<IDBDatabase | null>((resolve) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (!db) {
          sendDiagnosticLog(`Failed to open database "${name}".`);
          continue;
        }

        const storeNames = Array.from(db.objectStoreNames);
        sendDiagnosticLog(`Database "${name}" has stores: ${storeNames.join(', ')}`);
        
        // Case A: Separate store per definition type
        const itemStore = storeNames.find(s => s.includes('DestinyInventoryItemDefinition'));
        if (itemStore) {
          manifestDbName = name;
          itemStoreName = itemStore;
          plugSetStoreName = storeNames.find(s => s.includes('DestinyPlugSetDefinition')) || null;
          statStoreName = storeNames.find(s => s.includes('DestinyStatDefinition')) || null;
          db.close();
          sendDiagnosticLog(`Bound separate-stores manifest database "${manifestDbName}". Item: ${itemStoreName}, PlugSet: ${plugSetStoreName}`);
          return true;
        }

        // Case B: Unified key-value store containing everything
        const keyvalStore = storeNames.find(s => s === 'keyval' || s === 'keyval-store');
        if (keyvalStore) {
          sendDiagnosticLog(`Checking keyval store "${keyvalStore}" for manifest keys...`);
          const keys = await new Promise<string[]>((resolve) => {
            try {
              const tx = db.transaction(keyvalStore, 'readonly');
              const store = tx.objectStore(keyvalStore);
              const req = store.getAllKeys();
              req.onsuccess = () => resolve(req.result.map(String));
              req.onerror = () => resolve([]);
            } catch (e) {
              resolve([]);
            }
          });

          sendDiagnosticLog(`Keys in "${keyvalStore}": ${keys.slice(0, 15).join(', ')} (total: ${keys.length})`);
          
          const itemKey = keys.find(k => k === 'd2-manifest-InventoryItem') || keys.find(k => k.includes('InventoryItem'));
          const plugSetKey = keys.find(k => k === 'd2-manifest-PlugSet') || keys.find(k => k.includes('PlugSet'));
          const statKey = keys.find(k => k === 'd2-manifest-Stat') || keys.find(k => /(?:^|[-.])(?:Destiny)?Stat(?:Definition)?$/.test(k));

          if (itemKey) {
            manifestDbName = name;
            itemStoreName = `${keyvalStore}:${itemKey}`;
            plugSetStoreName = plugSetKey ? `${keyvalStore}:${plugSetKey}` : null;
            statStoreName = statKey ? `${keyvalStore}:${statKey}` : null;
            manifestKeyvalStoreName = keyvalStore;
            db.close();
            sendDiagnosticLog(`Bound keyval manifest database "${manifestDbName}" with itemKey "${itemKey}" and plugSetKey "${plugSetKey}".`);
            return true;
          }
        }
        db.close();
      }
    } catch (e) {
      sendDiagnosticLog(`Error scanning databases: ${String(e)}`);
      console.error('Aegis Overlay: Error scanning databases', e);
    }
    return false;
  };

  const scan = async () => {
    const success = await tryConnect();
    if (success) {
      try {
        await buildWeaponIndex();
        const stats: Record<number, string> = {};
        for (const hash of new Set(Object.values(WEAPON_STAT_HASHES))) {
          const definition = await getDefinitionByHash(hash, 'DestinyStatDefinition');
          if (definition?.displayProperties?.name) stats[hash] = definition.displayProperties.name;
        }
        initRegistryEl().setAttribute('data-stats', JSON.stringify(stats));
      } finally {
        indexBuilt = true;
        if (indexReadyResolve) indexReadyResolve();
      }
    } else if (retries < maxRetries) {
      retries++;
      sendDiagnosticLog(`Retrying manifest database connection (attempt ${retries}/${maxRetries})...`);
      setTimeout(scan, 1000);
    } else {
      sendDiagnosticLog('Failed to find manifest database after max retries.');
      indexBuilt = true;
      if (indexReadyResolve) indexReadyResolve();
    }
  };

  scan();
}

const globalWeaponRegistry: Record<number, string> = {};

function flushWeaponRegistry() {
  let weaponRegEl = document.getElementById('aegis-global-weapon-registry');
  if (!weaponRegEl) {
    weaponRegEl = document.createElement('div');
    weaponRegEl.id = 'aegis-global-weapon-registry';
    weaponRegEl.style.display = 'none';
    document.body.appendChild(weaponRegEl);
  }
  weaponRegEl.setAttribute('data-registry', JSON.stringify(globalWeaponRegistry));
}

async function buildWeaponIndex() {
  if (!manifestDbName || !itemStoreName) return;

  sendDiagnosticLog(`Starting weapon & perk indexing. itemStoreName: "${itemStoreName}"...`);

  // 1. If it's a key-value store, load the entire manifest dictionary into memory first
  if (itemStoreName.includes(':')) {
    const itemKeyName = itemStoreName.slice(itemStoreName.indexOf(':') + 1);
    const dict = await getManifestDictionaryByKey(itemKeyName);
    if (dict) {
      sendDiagnosticLog('Loaded cached manifest dictionary from keyval store. Building weapon & perk indexes...');
      // Find the items table
      const itemsTable = dict.DestinyInventoryItemDefinition || dict.InventoryItem || dict;
      for (const [hashStr, item] of Object.entries(itemsTable)) {
        const itemObj = item as any;
        if (itemObj && itemObj.displayProperties && itemObj.displayProperties.name) {
          const isWeapon =
            itemObj.itemType === 3 || // DestinyItemType.Weapon
            (itemObj.itemCategoryHashes && itemObj.itemCategoryHashes.includes(1)) ||
            (itemObj.sockets && itemObj.itemTypeDisplayName?.toLowerCase().includes('weapon'));
          const hash = itemObj.hash || Number(hashStr);
          const name = itemObj.displayProperties.name.trim();

          if (isWeapon) {
            const key = name.toLowerCase();
            const existingHash = weaponNameToHash[key];
            const newSocketCount = itemObj.sockets?.socketEntries?.length || 0;
            if (!existingHash || newSocketCount >= (itemSocketsCount[existingHash] || 0)) {
              weaponNameToHash[key] = hash;
              itemSocketsCount[hash] = newSocketCount;
            }
            globalWeaponRegistry[hash] = name;
          } else if (itemObj.plug || itemObj.itemCategoryHashes?.includes(59) || itemObj.itemType === 19) {
            const icon = itemObj.displayProperties.icon || '';
            if (name && !name.includes('Unknown')) {
              globalRegistry[hash] = { name, icon };
            }
          }
        }
      }
      sendDiagnosticLog(`Indexed ${Object.keys(weaponNameToHash).length} weapons and ${Object.keys(globalRegistry).length} perks.`);
      indexBuilt = true;
      if (indexReadyResolve) indexReadyResolve();
      flushRegistry();
      flushWeaponRegistry();
      return;
    }
  }

  // 2. Otherwise, scan the separate IndexedDB store
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(manifestDbName!);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  if (!db) return;

  try {
    const tx = db.transaction(itemStoreName, 'readonly');
    const store = tx.objectStore(itemStoreName);
    const req = store.openCursor();
    
    await new Promise<void>((resolve) => {
      req.onsuccess = (e) => {
        const cursor = (e.target as any).result;
        if (cursor) {
          const val = cursor.value;
          if (val && typeof val === 'object') {
            // Case B: Single large dictionary containing all definitions (fallback)
            if (!val.displayProperties && Object.keys(val).length > 100) {
              for (const [hashStr, item] of Object.entries(val)) {
                const itemObj = item as any;
                if (itemObj && itemObj.displayProperties && itemObj.displayProperties.name) {
                  const isWeapon =
                    itemObj.itemType === 3 ||
                    (itemObj.itemCategoryHashes && itemObj.itemCategoryHashes.includes(1)) ||
                    (itemObj.sockets && itemObj.itemTypeDisplayName?.toLowerCase().includes('weapon'));
                  const hash = itemObj.hash || Number(hashStr);
                  const name = itemObj.displayProperties.name.trim();

                  if (isWeapon) {
                    const key = name.toLowerCase();
                    const existingHash = weaponNameToHash[key];
                    const newSocketCount = itemObj.sockets?.socketEntries?.length || 0;
                    if (!existingHash || newSocketCount >= (itemSocketsCount[existingHash] || 0)) {
                      weaponNameToHash[key] = hash;
                      itemSocketsCount[hash] = newSocketCount;
                    }
                    globalWeaponRegistry[hash] = name;
                  } else if (itemObj.plug || itemObj.itemCategoryHashes?.includes(59) || itemObj.itemType === 19) {
                    const icon = itemObj.displayProperties.icon || '';
                    if (name && !name.includes('Unknown')) {
                      globalRegistry[hash] = { name, icon };
                    }
                  }
                }
              }
            } else if (val.displayProperties && val.displayProperties.name) {
              // Case A: Individual records per row
              const isWeapon =
                val.itemType === 3 ||
                (val.itemCategoryHashes && val.itemCategoryHashes.includes(1)) ||
                (val.sockets && val.itemTypeDisplayName?.toLowerCase().includes('weapon'));
              const hash = val.hash;
              const name = val.displayProperties.name.trim();

              if (isWeapon) {
                const key = name.toLowerCase();
                const existingHash = weaponNameToHash[key];
                const newSocketCount = val.sockets?.socketEntries?.length || 0;
                if (!existingHash || newSocketCount >= (itemSocketsCount[existingHash] || 0)) {
                  weaponNameToHash[key] = hash;
                  itemSocketsCount[hash] = newSocketCount;
                }
                globalWeaponRegistry[hash] = name;
              } else if (val.plug || val.itemCategoryHashes?.includes(59) || val.itemType === 19) {
                const icon = val.displayProperties.icon || '';
                if (name && !name.includes('Unknown')) {
                  globalRegistry[hash] = { name, icon };
                }
              }
            }
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch (e) {
    console.error('Aegis Overlay: Failed to build weapon index', e);
  } finally {
    db.close();
    indexBuilt = true;
    if (indexReadyResolve) {
      indexReadyResolve();
    }
    flushRegistry();
    flushWeaponRegistry();
  }
}

function initRegistryEl() {
  let registryEl = document.getElementById('aegis-global-perk-registry');
  if (!registryEl) {
    registryEl = document.createElement('div');
    registryEl.id = 'aegis-global-perk-registry';
    registryEl.style.display = 'none';
    document.body.appendChild(registryEl);
  }
  setupRegistryObserver(registryEl);
  if (!document.getElementById('aegis-global-weapon-registry')) flushWeaponRegistry();
  return registryEl;
}

// Attach window exporter function for 1-click manifest extraction
(window as any).aegisExportManifest = async function() {
  console.log('🚀 [DIM Aegis Overlay] Starting full Bungie manifest export from DIM...');
  try {
    const dbs = await indexedDB.databases();
    let targetDbName = manifestDbName;
    if (!targetDbName) {
      for (const d of dbs) {
        if (d.name && !d.name.includes('google') && !d.name.includes('chrome')) {
          targetDbName = d.name;
          break;
        }
      }
    }
    if (!targetDbName) {
      console.error('❌ Could not find DIM manifest database in IndexedDB.');
      return;
    }

    const db = await new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open(targetDbName!);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!db) {
      console.error('❌ Failed to open IndexedDB:', targetDbName);
      return;
    }

    let itemsTable: Record<string, any> = {};
    let plugSetsTable: Record<string, any> = {};
    let damageTypesTable: Record<string, any> = {};

    if (db.objectStoreNames.contains('keyval')) {
      const tx = db.transaction('keyval', 'readonly');
      const store = tx.objectStore('keyval');
      const keys = await new Promise<any[]>((res) => {
        const req = store.getAllKeys();
        req.onsuccess = () => res(req.result);
        req.onerror = () => res([]);
      });

      for (const k of keys) {
        const kStr = String(k);
        if (kStr.includes('DestinyInventoryItemDefinition') || kStr.includes('InventoryItem')) {
          const val = await new Promise<any>((res) => {
            const req = store.get(k);
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
          });
          if (val) Object.assign(itemsTable, val.DestinyInventoryItemDefinition || val.InventoryItem || val);
        } else if (kStr.includes('DestinyPlugSetDefinition') || kStr.includes('PlugSet')) {
          const val = await new Promise<any>((res) => {
            const req = store.get(k);
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
          });
          if (val) Object.assign(plugSetsTable, val.DestinyPlugSetDefinition || val.PlugSet || val);
        } else if (kStr.includes('DestinyDamageTypeDefinition') || kStr.includes('DamageType')) {
          const val = await new Promise<any>((res) => {
            const req = store.get(k);
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
          });
          if (val) Object.assign(damageTypesTable, val.DestinyDamageTypeDefinition || val.DamageType || val);
        }
      }
    }
    db.close();

    console.log(`✓ Loaded ${Object.keys(itemsTable).length} item definitions and ${Object.keys(plugSetsTable).length} plug set definitions.`);

    const DAMAGE_TYPE_NAMES: Record<number, string> = {
      1: 'Kinetic',
      2: 'Arc',
      3: 'Solar',
      4: 'Void',
      5: 'Raid',
      6: 'Stasis',
      7: 'Strand',
    };

    const AMMO_TYPE_NAMES: Record<number, string> = {
      1: 'Primary',
      2: 'Special',
      3: 'Heavy',
      0: 'Unknown',
    };

    function getPlugNamesFromSet(plugSetHash: number): string[] {
      const plugSet = plugSetsTable[plugSetHash] || plugSetsTable[String(plugSetHash)];
      if (!plugSet || !Array.isArray(plugSet.reusablePlugItems)) return [];
      const names: string[] = [];
      for (const entry of plugSet.reusablePlugItems) {
        if (!entry.plugItemHash) continue;
        const plug = itemsTable[entry.plugItemHash] || itemsTable[String(entry.plugItemHash)];
        if (plug && plug.displayProperties && plug.displayProperties.name) {
          const pName = plug.displayProperties.name.trim();
          const pLower = pName.toLowerCase();
          if (
            pName &&
            !pLower.includes('unknown') &&
            !pLower.startsWith('empty ') &&
            !pLower.startsWith('default ') &&
            !names.includes(pName)
          ) {
            names.push(pName);
          }
        }
      }
      return names;
    }

    const weapons: any[] = [];

    for (const [hashStr, item] of Object.entries(itemsTable)) {
      const itemObj = item as any;
      if (!itemObj.displayProperties || !itemObj.displayProperties.name) continue;
      const isWeapon =
        itemObj.itemType === 3 ||
        (itemObj.itemCategoryHashes && itemObj.itemCategoryHashes.includes(1)) ||
        (itemObj.sockets && itemObj.itemTypeDisplayName && itemObj.itemTypeDisplayName.toLowerCase().includes('weapon'));

      if (!isWeapon) continue;

      const hash = itemObj.hash || Number(hashStr);
      const name = itemObj.displayProperties.name.trim();
      if (!name || name.startsWith('Dummy') || name.startsWith('Test ') || name.toLowerCase().includes('classified')) {
        continue;
      }

      const icon = itemObj.displayProperties.icon ? `https://www.bungie.net${itemObj.displayProperties.icon}` : '';
      const watermark = itemObj.iconWatermark ? `https://www.bungie.net${itemObj.iconWatermark}` : (itemObj.iconWatermarkShelved ? `https://www.bungie.net${itemObj.iconWatermarkShelved}` : '');
      const typeName = itemObj.itemTypeDisplayName || 'Weapon';
      const tierName = itemObj.inventory?.tierTypeName || 'Legendary';
      const ammoType = AMMO_TYPE_NAMES[itemObj.equippingBlock?.ammoType] || 'Primary';

      const defaultDamageType = itemObj.defaultDamageType || 1;
      const damageTypeObj = damageTypesTable[itemObj.defaultDamageTypeId || defaultDamageType] || {};
      const damageType = DAMAGE_TYPE_NAMES[defaultDamageType] || damageTypeObj.displayProperties?.name || 'Kinetic';
      const damageIcon = damageTypeObj.displayProperties?.icon ? `https://www.bungie.net${damageTypeObj.displayProperties.icon}` : '';

      let rpm = '';
      if (itemObj.stats && itemObj.stats.stats) {
        const rpmStat = itemObj.stats.stats['428488797'] || itemObj.stats.stats['2961396640'] || itemObj.stats.stats['3871231066'];
        if (rpmStat && typeof rpmStat.value === 'number') {
          rpm = String(rpmStat.value);
        }
      }

      let archetype = '';
      const socketEntries = itemObj.sockets?.socketEntries || [];
      for (const socket of socketEntries) {
        if (socket.singleInitialItemHash) {
          const plug = itemsTable[socket.singleInitialItemHash] || itemsTable[String(socket.singleInitialItemHash)];
          if (plug && plug.itemTypeDisplayName && (plug.itemTypeDisplayName.includes('Frame') || plug.itemTypeDisplayName.includes('Intrinsic') || plug.itemTypeDisplayName.includes('Glaive'))) {
            archetype = plug.displayProperties?.name || plug.itemTypeDisplayName;
            break;
          }
        }
      }

      let col1Barrels: string[] = [];
      let col2Mags: string[] = [];
      let col3Perks: string[] = [];
      let col4Perks: string[] = [];
      let col5Origins: string[] = [];

      let traitColumnIndex = 0;

      for (const socket of socketEntries) {
        const plugSetHashes = [
          socket.randomizedPlugSetHash,
          socket.reusablePlugSetHash,
        ].filter((h): h is number => typeof h === 'number' && h > 0);

        let plugNames: string[] = [];
        for (const psHash of plugSetHashes) {
          plugNames.push(...getPlugNamesFromSet(psHash));
        }

        if (plugNames.length === 0 && Array.isArray(socket.reusablePlugItems)) {
          for (const rpi of socket.reusablePlugItems) {
            const plug = itemsTable[rpi.plugItemHash] || itemsTable[String(rpi.plugItemHash)];
            if (plug?.displayProperties?.name) {
              const pName = plug.displayProperties.name.trim();
              const pLower = pName.toLowerCase();
              if (
                pName &&
                !pLower.includes('unknown') &&
                !pLower.startsWith('empty ') &&
                !pLower.startsWith('default ') &&
                !plugNames.includes(pName)
              ) {
                plugNames.push(pName);
              }
            }
          }
        }

        if (plugNames.length === 0) continue;
        plugNames = [...new Set(plugNames)];

        const firstPlugHash = socket.randomizedPlugSetHash
          ? plugSetsTable[socket.randomizedPlugSetHash]?.reusablePlugItems?.[0]?.plugItemHash
          : (socket.reusablePlugItems?.[0]?.plugItemHash || socket.singleInitialItemHash);
        const firstPlug = firstPlugHash ? (itemsTable[firstPlugHash] || itemsTable[String(firstPlugHash)]) : null;
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
      if (allPerks.length === 0) continue; // Skip empty dummy entries

      const isCraftable = !!(itemObj.inventory?.recipeItemHash || itemObj.recipeItemHash);

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
        seasonName: itemObj.seasonHash ? `Season ${itemObj.seasonHash}` : null,
        sourceName: null,
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
    const nameGroups: Record<string, any[]> = {};
    for (const w of weapons) {
      const norm = w.name.toLowerCase().trim();
      if (!nameGroups[norm]) nameGroups[norm] = [];
      nameGroups[norm].push(w);
    }

    for (const group of Object.values(nameGroups)) {
      if (group.length > 1) {
        group.sort((a, b) => {
          // 1. Prefer weapons with real origin traits
          const aHasOrigins = a.origins.length > 0 ? 1 : 0;
          const bHasOrigins = b.origins.length > 0 ? 1 : 0;
          if (aHasOrigins !== bHasOrigins) return bHasOrigins - aHasOrigins;

          // 2. Prefer higher count of valid trait perks
          const aPerks = (a.perkColumns[0]?.length || 0) + (a.perkColumns[1]?.length || 0);
          const bPerks = (b.perkColumns[0]?.length || 0) + (b.perkColumns[1]?.length || 0);
          if (bPerks !== aPerks) return bPerks - aPerks;

          // 3. Fallback to newest hash
          return b.hash - a.hash;
        });

        group[0].superseded = false;
        for (let i = 1; i < group.length; i++) {
          group[i].superseded = true;
        }
      }
    }

    weapons.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`✅ [DIM Aegis Overlay] Extracted ${weapons.length} weapons with complete perk matrices! Downloading JSON...`);
    const blob = new Blob([JSON.stringify(weapons, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = 'manifest-weapons.json';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(blobUrl);
    console.log('🎉 Download completed! Replace data/manifest-weapons.json with the downloaded file.');
  } catch (err) {
    console.error('❌ Manifest export failed:', err);
  }
};

function startObserver() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    return;
  }
  
  // Initialize and observe the registry element immediately
  initRegistryEl();

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  scanPage();
  
  // Start IndexedDB manifest indexing in the background
  initManifestDatabase();
}
startObserver();


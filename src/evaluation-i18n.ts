import { AegisSheetDatabase, AegisSheetWeapon, AegisShoppingDatabase } from './types';

export interface EvaluationLocaleBundle {
  locale: string;
  schemaVersion: 1;
  entries: Record<string, string>;
}

interface EvaluationLocaleCacheEntry {
  bundle: EvaluationLocaleBundle | null;
  fetchedAt: number;
}

const EVALUATION_LOCALE_BASE_URL =
  'https://raw.githubusercontent.com/Maxeption/dim-aegis-overlay/master/data/locales';
const EVALUATION_LOCALE_CACHE_KEY = 'aegisEvaluationLocaleCache';
const EVALUATION_LOCALE_CACHE_TTL_MS = 60 * 60 * 1000;
const sourceTextHashCache = new Map<string, Promise<string>>();
const originalEvaluationText = new WeakMap<AegisSheetWeapon, { notes: string; description?: string }>();
const localizedSources = new WeakMap<AegisSheetWeapon, { source: string; translation: string }>();
let sourceTranslationCache = new Map<string, string>();
let roleTranslationCache = new Map<string, string>();
let activeLocaleBundle: EvaluationLocaleBundle | null | undefined;

export function getLocalizedSource(weapon: AegisSheetWeapon): string {
  const localized = localizedSources.get(weapon);
  return localized && localized.source === weapon.source ? localized.translation : weapon.source || '';
}

export function getLocalizedSourceText(source: string): string {
  if (!source) return '';
  return sourceTranslationCache.get(source.trim()) || sourceTranslationCache.get(source) || source;
}

export function getLocalizedRoleText(role: string, locale: string): string | undefined {
  return activeLocaleBundle?.locale === locale ? roleTranslationCache.get(role) : undefined;
}

function isValidLocale(locale: string): boolean {
  return /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(locale);
}

function isValidBundle(value: unknown, locale: string): value is EvaluationLocaleBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const bundle = value as Partial<EvaluationLocaleBundle>;
  if (
    bundle.schemaVersion !== 1 ||
    bundle.locale !== locale ||
    !bundle.entries ||
    typeof bundle.entries !== 'object' ||
    Array.isArray(bundle.entries)
  ) {
    return false;
  }
  for (const [key, entry] of Object.entries(bundle.entries)) {
    if (!/^[0-9a-f]{16}$/.test(key) || typeof entry !== 'string' || entry.trim().length === 0) {
      return false;
    }
  }
  return true;
}

async function withBundledEntries(bundle: EvaluationLocaleBundle): Promise<EvaluationLocaleBundle> {
  try {
    const response = await fetch(chrome.runtime.getURL(`data/locales/${encodeURIComponent(bundle.locale)}.json`));
    if (response.ok) {
      const bundled: unknown = await response.json();
      if (isValidBundle(bundled, bundle.locale)) {
        return { ...bundle, entries: { ...bundled.entries, ...bundle.entries } };
      }
    }
  } catch {
    // The remote bundle can be used without a bundled locale.
  }
  return bundle;
}

export async function fetchEvaluationLocale(
  locale: string,
  force = false
): Promise<EvaluationLocaleBundle | null> {
  if (locale === 'en' || !isValidLocale(locale)) return null;

  const stored = await chrome.storage.local.get(EVALUATION_LOCALE_CACHE_KEY);
  const cache = (stored[EVALUATION_LOCALE_CACHE_KEY] || {}) as Record<string, EvaluationLocaleCacheEntry>;
  const cached = cache[locale];

  if (!force && cached && cached.bundle && Date.now() - cached.fetchedAt < EVALUATION_LOCALE_CACHE_TTL_MS) {
    return withBundledEntries(cached.bundle);
  }

  // 1. Try remote CDN
  try {
    const url = `${EVALUATION_LOCALE_BASE_URL}/${encodeURIComponent(locale)}.json?_=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (response.ok) {
      const bundle = await response.json() as unknown;
      if (isValidBundle(bundle, locale)) {
        cache[locale] = { bundle, fetchedAt: Date.now() };
        await chrome.storage.local.set({ [EVALUATION_LOCALE_CACHE_KEY]: cache });
        return withBundledEntries(bundle);
      }
    }
  } catch (error) {
    console.warn(`DIM Aegis Overlay: Remote fetch failed for evaluation locale "${locale}".`, error);
  }

  // 2. Fallback to local extension bundled locale
  try {
    const localUrl = chrome.runtime.getURL(`data/locales/${encodeURIComponent(locale)}.json`);
    const localRes = await fetch(localUrl);
    if (localRes.ok) {
      const localBundle = await localRes.json() as unknown;
      if (isValidBundle(localBundle, locale)) {
        cache[locale] = { bundle: localBundle, fetchedAt: Date.now() };
        await chrome.storage.local.set({ [EVALUATION_LOCALE_CACHE_KEY]: cache });
        return localBundle;
      }
    }
  } catch (localErr) {
    console.warn(`DIM Aegis Overlay: Local bundled fallback failed for evaluation locale "${locale}".`, localErr);
  }

  return cached?.bundle || null;
}

async function sourceTextHash(text: string): Promise<string> {
  let hashPromise = sourceTextHashCache.get(text);
  if (!hashPromise) {
    hashPromise = crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((digest) => (
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16)
    ));
    sourceTextHashCache.set(text, hashPromise);
  }
  return hashPromise;
}

function databaseWeapons(database: AegisSheetDatabase): AegisSheetWeapon[] {
  const seen = new Set<AegisSheetWeapon>();
  const weapons: AegisSheetWeapon[] = [];
  const add = (weapon?: AegisSheetWeapon | null) => {
    if (weapon && typeof weapon === 'object' && !seen.has(weapon)) {
      seen.add(weapon);
      weapons.push(weapon);
    }
  };

  Object.values(database.weapons || {}).forEach(add);
  Object.values(database.variants || {}).flat().forEach(add);
  Object.values(database.categories || {}).flat().forEach(add);
  return weapons;
}

export function getOriginalEvaluationText(
  weapon: AegisSheetWeapon,
  field: 'notes' | 'description'
): string {
  return originalEvaluationText.get(weapon)?.[field] ?? weapon[field] ?? '';
}

/** Use the same source-text keys and fallback as weapon evaluations. */
export async function translateEvaluationText(source: string, bundle: EvaluationLocaleBundle | null): Promise<string> {
  if (!source || !bundle) return source;
  return bundle.entries[await sourceTextHash(source)] || source;
}

export async function applyEvaluationLocale(
  database: AegisSheetDatabase | null,
  bundle: EvaluationLocaleBundle | null,
  shoppingDbs?: (AegisShoppingDatabase | null | undefined)[]
): Promise<void> {
  if (activeLocaleBundle !== bundle) {
    activeLocaleBundle = bundle;
    sourceTranslationCache = new Map();
    roleTranslationCache = new Map();
  }
  const sourceCache = sourceTranslationCache;
  const roleCache = roleTranslationCache;
  if (!database && (!shoppingDbs || shoppingDbs.length === 0)) return;

  const translate = async (source: string): Promise<string> => {
    return translateEvaluationText(source, bundle);
  };

  const weapons = database ? databaseWeapons(database) : [];

  // Synchronously record original source snapshot for all weapons BEFORE starting async operations
  for (const weapon of weapons) {
    if (!originalEvaluationText.has(weapon)) {
      originalEvaluationText.set(weapon, {
        notes: weapon.notes || '',
        description: weapon.description,
      });
    }
  }

  await Promise.all(weapons.map(async (weapon) => {
    const source = originalEvaluationText.get(weapon)!;
    const sourceNotes = source.notes || '';
    const sourceDescription = source.description || '';
    weapon.notes = await translate(sourceNotes);
    weapon.description = sourceDescription ? await translate(sourceDescription) : undefined;
    const transSource = await translate(weapon.source || '');
    localizedSources.set(weapon, { source: weapon.source || '', translation: transSource });
    if (weapon.source && transSource && transSource !== weapon.source) {
      sourceCache.set(weapon.source.trim(), transSource);
      sourceCache.set(weapon.source, transSource);
    }
  }));

  // Also translate armor sets in database
  if (database) {
    const armorSets = [...Object.values(database.armor || {}), ...Object.values(database.armorAegis || {})];
    await Promise.all(armorSets.map(async (set) => {
      if (set.source) {
        const trans = await translate(set.source);
        if (trans && trans !== set.source) {
          sourceCache.set(set.source.trim(), trans);
          sourceCache.set(set.source, trans);
        }
      }
    }));
  }

  // Also translate shopping database sources
  if (shoppingDbs) {
    for (const sDb of shoppingDbs) {
      if (!sDb?.items) continue;
      await Promise.all(sDb.items.map(async (item) => {
        if (item.source) {
          const trans = await translate(item.source);
          if (trans && trans !== item.source) {
            sourceCache.set(item.source.trim(), trans);
            sourceCache.set(item.source, trans);
          }
        }
        if (item.role) {
          const translatedRole = await translate(item.role);
          if (translatedRole !== item.role) roleCache.set(item.role, translatedRole);
        }
      }));
    }
  }
}

import { AegisSheetDatabase, AegisSheetWeapon } from './types';

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

export async function fetchEvaluationLocale(
  locale: string,
  force = false
): Promise<EvaluationLocaleBundle | null> {
  if (locale === 'en' || !isValidLocale(locale)) return null;

  const stored = await chrome.storage.local.get(EVALUATION_LOCALE_CACHE_KEY);
  const cache = (stored[EVALUATION_LOCALE_CACHE_KEY] || {}) as Record<string, EvaluationLocaleCacheEntry>;
  const cached = cache[locale];

  if (!force && cached && cached.bundle && Date.now() - cached.fetchedAt < EVALUATION_LOCALE_CACHE_TTL_MS) {
    return cached.bundle;
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
        return bundle;
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

export async function applyEvaluationLocale(
  database: AegisSheetDatabase | null,
  bundle: EvaluationLocaleBundle | null
): Promise<void> {
  if (!database) return;

  const translate = async (source: string): Promise<string> => {
    if (!source || !bundle) return source;
    return bundle.entries[await sourceTextHash(source)] || source;
  };

  const weapons = databaseWeapons(database);

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
  }));
}

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
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Partial<EvaluationLocaleBundle>;
  return bundle.schemaVersion === 1
    && bundle.locale === locale
    && !!bundle.entries
    && typeof bundle.entries === 'object'
    && Object.entries(bundle.entries).every(([key, entry]) => (
      /^[0-9a-f]{16}$/.test(key) && typeof entry === 'string' && entry.trim().length > 0
    ));
}

export async function fetchEvaluationLocale(
  locale: string,
  force = false
): Promise<EvaluationLocaleBundle | null> {
  if (locale === 'en' || !isValidLocale(locale)) return null;

  const stored = await chrome.storage.local.get(EVALUATION_LOCALE_CACHE_KEY);
  const cache = (stored[EVALUATION_LOCALE_CACHE_KEY] || {}) as Record<string, EvaluationLocaleCacheEntry>;
  const cached = cache[locale];

  if (!force && cached && Date.now() - cached.fetchedAt < EVALUATION_LOCALE_CACHE_TTL_MS) {
    return cached.bundle;
  }

  try {
    const url = `${EVALUATION_LOCALE_BASE_URL}/${encodeURIComponent(locale)}.json?_=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (response.status === 404) {
      cache[locale] = { bundle: null, fetchedAt: Date.now() };
      await chrome.storage.local.set({ [EVALUATION_LOCALE_CACHE_KEY]: cache });
      return null;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const bundle = await response.json() as unknown;
    if (!isValidBundle(bundle, locale)) {
      throw new Error(`Invalid evaluation locale bundle for ${locale}`);
    }

    cache[locale] = { bundle, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [EVALUATION_LOCALE_CACHE_KEY]: cache });
    return bundle;
  } catch (error) {
    console.warn(`DIM Aegis Overlay: Failed to refresh evaluation locale "${locale}".`, error);
    return cached?.bundle || null;
  }
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
  const add = (weapon: AegisSheetWeapon) => {
    if (!seen.has(weapon)) {
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

  await Promise.all(databaseWeapons(database).map(async (weapon) => {
    let source = originalEvaluationText.get(weapon);
    if (!source) {
      source = { notes: weapon.notes, description: weapon.description };
      originalEvaluationText.set(weapon, source);
    }

    const sourceNotes = source.notes || '';
    const sourceDescription = source.description || '';
    weapon.notes = await translate(sourceNotes);
    weapon.description = sourceDescription ? await translate(sourceDescription) : undefined;
  }));
}

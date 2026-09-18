import { getCurrentLanguage, initLanguage, t } from './i18n';
import { HASH_TO_ENGLISH_PERK } from './canonical-hashes';
import { buildPerkRatingIndex, type PerkRatingsCache } from './perk-ratings';
import { translateEvaluationText, type EvaluationLocaleBundle } from './evaluation-i18n';

/** Publish only public perk ratings/settings to DIM's main world, once per change. */
export function initPerkAnalysisBridge() {
  let cache: PerkRatingsCache | undefined;
  let enabled = true;
  let byHash = buildPerkRatingIndex(cache, {});
  let request = 0;
  async function refresh() {
    const token = ++request;
    const locale = getCurrentLanguage();
    const source = buildPerkRatingIndex(cache, HASH_TO_ENGLISH_PERK);
    const bundle = locale === 'en' ? null : await new Promise<EvaluationLocaleBundle | null>(resolve => {
      chrome.runtime.sendMessage({ action: 'getEvaluationLocale', locale }, response => {
        resolve(chrome.runtime.lastError || !response?.success ? null : response.bundle || null);
      });
    });
    const translated = new Map<object, Promise<typeof source[number]>>();
    const entries = await Promise.all(Object.entries(source).map(async ([hash, rating]) => {
      let result = translated.get(rating);
      if (!result) {
        result = translateEvaluationText(rating.analysis, bundle).then(analysis => ({ ...rating, analysis }));
        translated.set(rating, result);
      }
      return [hash, await result] as const;
    }));
    // A slow locale request must not replace a newer language or ratings update.
    if (token !== request) return;
    byHash = Object.fromEntries(entries); publish();
  }
  function publish() {
    let node = document.getElementById('aegis-perk-analysis-data');
    if (!node) {
      node = document.createElement('script');
      (node as HTMLScriptElement).type = 'application/json';
      node.id = 'aegis-perk-analysis-data'; document.documentElement.append(node);
    }
    node.textContent = JSON.stringify({ enabled, byHash, labels: { rating: t('perkRatingLabel'), tier: t('perkRatingTier'), perks: t('perkRatingPerks'), origins: t('perkRatingOrigins'), selected: t('compareSelected'), selectable: t('selectable'), missing: t('missing') } });
    document.dispatchEvent(new Event('aegis-perk-analysis-updated'));
  }
  chrome.storage.local.get(['aegisPerkRatings', 'aegisPerkAnalysisEnabled', 'aegisLanguage'], result => {
    initLanguage(result.aegisLanguage);
    cache = result.aegisPerkRatings; enabled = result.aegisPerkAnalysisEnabled !== false;
    void refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.aegisPerkRatings && !changes.aegisPerkAnalysisEnabled && !changes.aegisLanguage)) return;
    if (changes.aegisLanguage) initLanguage(changes.aegisLanguage.newValue);
    if (changes.aegisPerkRatings) {
      cache = changes.aegisPerkRatings.newValue;
    }
    if (changes.aegisPerkAnalysisEnabled) { enabled = changes.aegisPerkAnalysisEnabled.newValue !== false; publish(); }
    if (changes.aegisLanguage || changes.aegisPerkRatings) void refresh();
  });
}

import { initLanguage, t } from './i18n';
import { HASH_TO_ENGLISH_PERK } from './canonical-hashes';
import { buildPerkRatingIndex, type PerkRatingsCache } from './perk-ratings';

/** Publish only public perk ratings/settings to DIM's main world, once per change. */
export function initPerkAnalysisBridge() {
  let cache: PerkRatingsCache | undefined;
  let enabled = true;
  let byHash = buildPerkRatingIndex(cache, {});
  function publish() {
    let node = document.getElementById('aegis-perk-analysis-data');
    if (!node) {
      node = document.createElement('script');
      (node as HTMLScriptElement).type = 'application/json';
      node.id = 'aegis-perk-analysis-data'; document.documentElement.append(node);
    }
    node.textContent = JSON.stringify({ enabled, byHash, labels: { rating: t('perkRatingLabel'), tier: t('perkRatingTier'), perks: t('perkRatingPerks'), origins: t('perkRatingOrigins') } });
    document.dispatchEvent(new Event('aegis-perk-analysis-updated'));
  }
  chrome.storage.local.get(['aegisPerkRatings', 'aegisPerkAnalysisEnabled', 'aegisLanguage'], result => {
    initLanguage(result.aegisLanguage);
    cache = result.aegisPerkRatings; enabled = result.aegisPerkAnalysisEnabled !== false;
    byHash = buildPerkRatingIndex(cache, HASH_TO_ENGLISH_PERK); publish();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.aegisPerkRatings && !changes.aegisPerkAnalysisEnabled && !changes.aegisLanguage)) return;
    if (changes.aegisLanguage) initLanguage(changes.aegisLanguage.newValue);
    if (changes.aegisPerkRatings) {
      cache = changes.aegisPerkRatings.newValue;
      byHash = buildPerkRatingIndex(cache, HASH_TO_ENGLISH_PERK);
    }
    if (changes.aegisPerkAnalysisEnabled) enabled = changes.aegisPerkAnalysisEnabled.newValue !== false;
    publish();
  });
}

import { refreshOptionDescriptions } from './compact-options';
import { updateOptionsPreview, renderOptionsPreview } from './options-preview';
import { refreshOptionHighlights, revealOption } from './options-motion';
import { initGradeSettings } from './grade-settings';
import { normalizeGradeSettings } from './grading';
import { setGradeColors, setBadgeColor, resolveBadgeColor, resolveTileGlow } from './grade-colors';
import { initLanguage, t, localizeElements } from './i18n';
import { LocalStorageSchema, AegisMode } from './types';
import { normalizeBadgeSize, normalizeBadgeVisibility, type BadgeCategory, type BadgeVisibility } from './badge-presentation';

function localizePopup(storedLang?: string) {
  initLanguage(storedLang);
  localizeElements();
}

const DEFAULT_URL =
  'https://raw.githubusercontent.com/charlesxcaliber/DIMAegisWeaponWishlist/main/MrCharlesWishlist_MRB_PPC2.txt';

document.addEventListener('DOMContentLoaded', () => {
  const refreshGradeLanguage = initGradeSettings();
  const urlInput = document.getElementById('wishlist-url') as HTMLInputElement;
  const syncBtn = document.getElementById('sync-button') as HTMLButtonElement;
  const syncStatus = document.getElementById('sync-status') as HTMLSpanElement;
  const lastUpdated = document.getElementById('last-updated') as HTMLSpanElement;
  const weaponsCount = document.getElementById('weapons-count') as HTMLSpanElement;
  const errorContainer = document.getElementById('error-container') as HTMLDivElement;
  const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;
  const lightggCount = document.getElementById('lightgg-count') as HTMLSpanElement;
  const lightggSyncBtn = document.getElementById('lightgg-sync-button') as HTMLButtonElement;
  const lightggClearBtn = document.getElementById('lightgg-clear-button') as HTMLButtonElement;
  const lightggSyncStatusRow = document.getElementById('lightgg-sync-status-row') as HTMLDivElement;
  const lightggSyncStatusText = document.getElementById('lightgg-sync-status-text') as HTMLSpanElement;

  // Function to refresh UI from storage
  function updateUI() {
    chrome.storage.local.get(
      [
        'aegisGradeSettings',
        'aegisGradeColors',
        'wishlistUrl',
        'lastUpdated',
        'parsedCount',
        'syncStatus',
        'syncError',
        'scoringSource',
        'lightggData',
        'lightggLastSync',
        'aegisLayoutSide',
        'aegisPerkOrder',
        'aegisDbMode',
        'aegisMode',
        'aegisTwoTier',
        'aegisTwoTierColors',
        'aegisBadgeColor',
        'aegisMaxTierGlow',
        'aegisTileGlow',
        'aegisBadgePosition',
        'aegisBadgeStyle',
        'aegisUpgradeStyle',
        'aegisBadgeScale',
        'aegisBadgeSize',
        'aegisBadgeVisibility',
        'aegisFadeHover',
        'aegisGradeDisplayMode',
        'aegisHoverEnabled',
        'aegisCompactPerksMatrix',
        'aegisPopupSummaryMode',
        'aegisAutoMaxHeight',
        'aegisTooltipWidthMode',
        'aegisTooltipWidth',
        'aegisArmorSource',
        'aegisLanguage',
        'updateAvailableVersion',
        'updateBannerDismissed',
        'lastSeenChangelogVersion'
      ],
      (res: any) => {
        localizePopup(res.aegisLanguage);
        refreshGradeLanguage?.();
        setGradeColors(normalizeGradeSettings(res.aegisGradeSettings, res.aegisGradeColors));
        const badgeColor = resolveBadgeColor(res.aegisBadgeColor, res.aegisTwoTierColors);
        setBadgeColor(res.aegisTwoTier === true ? badgeColor : 'perk');

        // Auto-show Changelog Modal once for new version updates
        const currentVer = chrome.runtime.getManifest().version;
        if (res.lastSeenChangelogVersion !== currentVer) {
          const changelogModal = document.getElementById('changelog-modal');
          if (changelogModal) {
            changelogModal.classList.remove('hidden');
          }
        }

        // Handle Extension Update warning banner
        const updateBanner = document.getElementById('extension-update-banner') as HTMLDivElement;
        const newVersionText = document.getElementById('new-version-text') as HTMLElement;
        if (updateBanner && newVersionText) {
          const currentVersion = chrome.runtime.getManifest().version;
          if (res.updateAvailableVersion && res.updateAvailableVersion !== currentVersion && !res.updateBannerDismissed) {
            newVersionText.textContent = `v${res.updateAvailableVersion}`;
            updateBanner.classList.remove('hidden');
          } else {
            updateBanner.classList.add('hidden');
          }
        }

        // Set URL input
        urlInput.value = res.wishlistUrl || DEFAULT_URL;

        // Set Last Updated time
        if (res.lastUpdated) {
          lastUpdated.textContent = new Date(res.lastUpdated).toLocaleString();
        } else {
          lastUpdated.textContent = 'Never';
        }

        // Set Weapons Count
        weaponsCount.textContent = (res.parsedCount || 0).toLocaleString();

        // Set Light.gg Graded Count
        const lggData = res.lightggData || {};
        if (lightggCount) {
          lightggCount.textContent = Object.keys(lggData).length.toLocaleString();
        }

        // Set Light.gg Last Synced time
        const lggLastUpdated = document.getElementById('lightgg-last-updated') as HTMLSpanElement;
        if (lggLastUpdated) {
          if (res.lightggLastSync) {
            lggLastUpdated.textContent = new Date(res.lightggLastSync).toLocaleString();
          } else {
            lggLastUpdated.textContent = 'Never';
          }
        }

        // Handle Light.gg cache age warning banner
        const warningBanner = document.getElementById('lightgg-sync-warning') as HTMLDivElement;
        if (warningBanner) {
          const hasGrades = Object.keys(lggData).length > 0;
          const dayInMs = 24 * 60 * 60 * 1000;
          const isOutdated = res.lightggLastSync && (Date.now() - res.lightggLastSync > 2 * dayInMs);
          
          if (hasGrades && isOutdated) {
            warningBanner.classList.remove('hidden');
          } else {
            warningBanner.classList.add('hidden');
          }
        }

        // Set Language dropdown input and selection
        const langVal = res.aegisLanguage || 'auto';
        const langLabels: Record<string, string> = {
          auto: '🌐 Auto (DIM / Browser)',
          en: '🇺🇸 English',
          es: '🇪🇸 Español',
          ko: '🇰🇷 한국어',
          ja: '🇯🇵 日本語',
          'zh-CHS': '🇨🇳 简体中文',
          'zh-CHT': '🇹🇼 繁體中文'
        };
        const langInput = document.getElementById('language-select-input') as HTMLInputElement;
        if (langInput) {
          langInput.value = langLabels[langVal] || langLabels.auto;
        }
        const langOptions = document.querySelectorAll('#aegis-language-options .aegis-combobox-option');
        langOptions.forEach(opt => {
          if (opt.getAttribute('data-value') === langVal) {
            opt.classList.add('selected');
          } else {
            opt.classList.remove('selected');
          }
        });

        // Set Scoring Source segmented control
        const sourceVal = res.scoringSource || 'aegis';
        const sourceSegmented = document.getElementById('scoring-source-segmented');
        if (sourceSegmented) {
          sourceSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === sourceVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
          const dbToggleGroup = document.getElementById('aegis-db-toggle-group');
          if (dbToggleGroup) {
            if (sourceVal === 'lightgg') {
              revealOption(dbToggleGroup, false);
            } else {
              revealOption(dbToggleGroup, true);
            }
          }
        }

        // Set Aegis DB Mode buttons & Spreadsheet Mode visibility
        const dbModeVal = res.aegisDbMode || 'both';
        const segmentedControl = document.getElementById('aegis-db-segmented');
        if (segmentedControl) {
          segmentedControl.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === dbModeVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
          const aegisModeGroup = document.getElementById('aegis-mode-toggle-group');
          if (aegisModeGroup) {
            if (dbModeVal === 'wishlist' || sourceVal === 'lightgg') {
              revealOption(aegisModeGroup, false);
            } else {
              revealOption(aegisModeGroup, true);
            }
          }
        }

        // Set Aegis Mode (PvE vs PvP) segmented control
        const aegisModeVal = res.aegisMode || 'pve';
        const aegisModeSegmented = document.getElementById('aegis-mode-segmented');
        if (aegisModeSegmented) {
          aegisModeSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === aegisModeVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Layout segmented control
        const layoutVal = res.aegisLayoutSide || 'side';
        const layoutSegmented = document.getElementById('aegis-layout-segmented');
        if (layoutSegmented) {
          layoutSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === layoutVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Recommended Perks Order segmented control
        const perkOrderVal = res.aegisPerkOrder || 'sheet';
        const perkOrderSegmented = document.getElementById('aegis-perk-order-segmented');
        if (perkOrderSegmented) {
          perkOrderSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === perkOrderVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Two-Tier segmented control
        const twoTierColorsGroup = document.getElementById('aegis-two-tier-options');
        if (twoTierColorsGroup) revealOption(twoTierColorsGroup, res.aegisTwoTier === true);
        document.querySelectorAll<HTMLButtonElement>('#aegis-badge-color-segmented button').forEach(button => {
          const active = button.dataset.value === badgeColor;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        const tileGlow = document.getElementById('aegis-tile-glow') as HTMLSelectElement | null;
        if (tileGlow) tileGlow.value = resolveTileGlow(res.aegisTileGlow, res.aegisMaxTierGlow);
        const twoTierVal = res.aegisTwoTier ? 'true' : 'false';
        const twoTierSegmented = document.getElementById('aegis-two-tier-segmented');
        if (twoTierSegmented) {
          twoTierSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === twoTierVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Badge Position segmented control
        const badgePosVal = res.aegisBadgePosition || 'bottom-left';
        const badgePosSegmented = document.getElementById('aegis-badge-position-segmented');
        if (badgePosSegmented) {
          badgePosSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === badgePosVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Badge Style segmented control
        const badgeStyleVal = res.aegisBadgeStyle || 'classic';
        const badgeStyleSegmented = document.getElementById('aegis-badge-style-segmented');
        if (badgeStyleSegmented) {
          badgeStyleSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === badgeStyleVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Upgrade Style segmented control
        const upgradeStyleVal = (res.aegisUpgradeStyle === 'triangle' || res.aegisUpgradeStyle === 'chevron' || res.aegisUpgradeStyle === 'none') ? res.aegisUpgradeStyle : 'circle';
        const upgradeStyleSegmented = document.getElementById('aegis-upgrade-style-segmented');
        if (upgradeStyleSegmented) {
          upgradeStyleSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === upgradeStyleVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Badge Scale Slider
        const badgeScaleVal = typeof res.aegisBadgeScale === 'number' ? res.aegisBadgeScale : 100;
        const scaleSlider = document.getElementById('aegis-badge-scale-slider') as HTMLInputElement;
        const scaleValueText = document.getElementById('badge-scale-value');
        if (scaleSlider) {
          scaleSlider.value = badgeScaleVal.toString();
        }
        if (scaleValueText) {
          scaleValueText.textContent = `${badgeScaleVal}%`;
        }
        document.documentElement.style.setProperty('--aegis-badge-scale', (badgeScaleVal / 100).toString());
        const badgeSize = normalizeBadgeSize(res.aegisBadgeSize);
        (document.getElementById('aegis-badge-size-slider') as HTMLInputElement).value = String(badgeSize);
        document.getElementById('badge-size-value')!.textContent = `${badgeSize}%`;
        document.documentElement.style.setProperty('--aegis-badge-size', String(badgeSize / 100));
        const visibility = normalizeBadgeVisibility(res.aegisBadgeVisibility);
        document.querySelectorAll<HTMLElement>('[data-badge-category]').forEach(group => {
          group.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
            const active = visibility[group.dataset.badgeCategory as BadgeCategory] === button.dataset.value;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
          });
        });

        updateOptionsPreview(res);

        revealOption(document.getElementById('aegis-badge-position-group')!, badgeStyleVal !== 'notch' && badgeStyleVal !== 'footer');

        // Set Aegis Fade on Hover segmented control
        const fadeHoverVal = res.aegisFadeHover === true ? 'true' : 'false';
        const fadeHoverSegmented = document.getElementById('aegis-fade-hover-segmented');
        if (fadeHoverSegmented) {
          const fadeHoverGroup = fadeHoverSegmented.closest<HTMLElement>('.input-group');
          if (fadeHoverGroup) revealOption(fadeHoverGroup, badgeStyleVal !== 'footer');
          fadeHoverSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === fadeHoverVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Grade Display Mode segmented control (equipped, dual, potential)
        const gradeDisplayVal = res.aegisGradeDisplayMode || 'equipped';
        const gradeDisplaySegmented = document.getElementById('aegis-grade-display-segmented');
        if (gradeDisplaySegmented) {
          gradeDisplaySegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === gradeDisplayVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Hover Enabled segmented control
        const hoverEnabledVal = res.aegisHoverEnabled !== false ? 'true' : 'false';
        const hoverEnabledSegmented = document.getElementById('aegis-hover-enabled-segmented');
        if (hoverEnabledSegmented) {
          hoverEnabledSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === hoverEnabledVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis 2-Column Perks Matrix segmented control
        const matrixVal = res.aegisCompactPerksMatrix === true ? 'true' : 'false';
        const matrixSegmented = document.getElementById('aegis-matrix-segmented');
        if (matrixSegmented) {
          matrixSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === matrixVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Popup Summary Mode segmented control
        const popupSummaryVal = res.aegisPopupSummaryMode || 'full';
        const popupSummarySegmented = document.getElementById('aegis-popup-summary-segmented');
        if (popupSummarySegmented) {
          popupSummarySegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === popupSummaryVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Auto Max-Height segmented control
        const autoMaxHeightVal = res.aegisAutoMaxHeight !== false ? 'true' : 'false';
        const autoMaxHeightSegmented = document.getElementById('aegis-auto-max-height-segmented');
        if (autoMaxHeightSegmented) {
          autoMaxHeightSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === autoMaxHeightVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Tooltip Width Mode segmented control
        const tooltipWidthModeVal = res.aegisTooltipWidthMode || 'fixed';
        revealOption(document.getElementById('aegis-tooltip-width-slider-group')!, tooltipWidthModeVal === 'fixed');
        const tooltipWidthModeSegmented = document.getElementById('aegis-tooltip-width-mode-segmented');
        if (tooltipWidthModeSegmented) {
          tooltipWidthModeSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === tooltipWidthModeVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Tooltip Width Slider
        const tooltipWidthVal = typeof res.aegisTooltipWidth === 'number' ? res.aegisTooltipWidth : 280;
        const widthSlider = document.getElementById('aegis-tooltip-width-slider') as HTMLInputElement;
        const widthValText = document.getElementById('tooltip-width-value');
        if (widthSlider) {
          widthSlider.value = tooltipWidthVal.toString();
        }
        if (widthValText) {
          widthValText.textContent = `${tooltipWidthVal}px`;
        }

        // Set Aegis Armor Source segmented control
        const armorSourceVal = res.aegisArmorSource || 'lowco';
        const armorSourceSegmented = document.getElementById('aegis-armor-source-segmented');
        if (armorSourceSegmented) {
          const armorAegisBtn = armorSourceSegmented.querySelector<HTMLButtonElement>('button[data-value="aegis"]');
          if (armorAegisBtn) {
            const heading = armorAegisBtn.querySelector('span')!;
            if (aegisModeVal === 'pvp') {
              heading.textContent = t('inlineFinnald');
              armorAegisBtn.title = t('armorFinnald');
            } else if (aegisModeVal === 'both') {
              heading.textContent = t('sourceBoth');
              armorAegisBtn.title = t('armorDual');
            } else {
              heading.textContent = t('inlineAegis');
              armorAegisBtn.title = t('armorAegis');
            }
          }
          armorAegisBtn?.setAttribute('aria-label', armorAegisBtn.title);
          armorSourceSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === armorSourceVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Update status text and classes
        const status = res.syncStatus || 'success';
        syncStatus.className = 'status-value';
        errorContainer.classList.add('hidden');

        if (status === 'loading') {
          syncStatus.textContent = 'Syncing...';
          syncStatus.classList.add('status-loading');
          setLoadingState(true);
        } else if (status === 'error') {
          syncStatus.textContent = 'Failed';
          syncStatus.classList.add('status-error');
          setLoadingState(false);

          if (res.syncError) {
            errorMessage.textContent = res.syncError;
            errorContainer.classList.remove('hidden');
          }
        } else {
          syncStatus.textContent = 'Synced';
          syncStatus.classList.add('status-success');
          setLoadingState(false);
        }
        refreshOptionDescriptions();
        refreshOptionHighlights();
      }
    );
  }

  // Handle Language dropdown toggle and selection
  const langDropdown = document.getElementById('aegis-language-dropdown');
  const langMenu = document.getElementById('aegis-language-menu');
  if (langDropdown && langMenu) {
    langDropdown.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const option = target.closest('.aegis-combobox-option') as HTMLElement;
      if (option) {
        const val = option.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisLanguage: val }, () => {
            langDropdown.classList.remove('active');
            langMenu.classList.add('hidden');
            updateUI();
          });
        }
      } else {
        const isHidden = langMenu.classList.contains('hidden');
        if (isHidden) {
          langDropdown.classList.add('active');
          langMenu.classList.remove('hidden');
        } else {
          langDropdown.classList.remove('active');
          langMenu.classList.add('hidden');
        }
      }
    });

    // Dismiss language menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!langDropdown.contains(e.target as Node)) {
        langDropdown.classList.remove('active');
        langMenu.classList.add('hidden');
      }
    });
  }

  // Handle Scoring Source segmented control click
  const sourceSegmented = document.getElementById('scoring-source-segmented');
  if (sourceSegmented) {
    sourceSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ scoringSource: val }, () => {
            updateUI();
          });
        }
      }
    });
  }

  // Handle DB Mode segmented control click
  const segmentedControl = document.getElementById('aegis-db-segmented');
  if (segmentedControl) {
    segmentedControl.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisDbMode: val }, () => {
            updateUI();
          });
        }
      }
    });
  }

  // Handle Aegis Mode (PvE vs PvP vs Both) segmented control click
  const aegisModeSegmented = document.getElementById('aegis-mode-segmented');
  if (aegisModeSegmented) {
    aegisModeSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value') as AegisMode | null;
        if (val) {
          chrome.storage.local.get(
            ['aegisSheetDbPvE', 'aegisSheetDbPvP', 'aegisShoppingDbPvE', 'aegisShoppingDbPvP'],
            (res: Pick<LocalStorageSchema, 'aegisSheetDbPvE' | 'aegisSheetDbPvP' | 'aegisShoppingDbPvE' | 'aegisShoppingDbPvP'>) => {
              const activeDb = val === 'pvp' ? (res.aegisSheetDbPvP || res.aegisSheetDbPvE) : (res.aegisSheetDbPvE || res.aegisSheetDbPvP);
              const activeShoppingDb = val === 'pvp' ? (res.aegisShoppingDbPvP || res.aegisShoppingDbPvE) : (res.aegisShoppingDbPvE || res.aegisShoppingDbPvP);
              const updateObj: Partial<LocalStorageSchema> = { aegisMode: val };
              if (activeDb) {
                updateObj.aegisSheetDb = activeDb;
              }
              if (activeShoppingDb) {
                updateObj.aegisShoppingDb = activeShoppingDb;
              }

              // Automatically switch tooltip width mode to fit-content (auto) in dual mode, and reset to fixed in single mode
              if (val === 'both') {
                updateObj.aegisTooltipWidthMode = 'auto';
              } else {
                updateObj.aegisTooltipWidthMode = 'fixed';
              }

              chrome.storage.local.set(updateObj, () => {
                updateUI();
              });
            }
          );
        }
      }
    });
  }

  // Handle Layout segmented control click
  const layoutSegmented = document.getElementById('aegis-layout-segmented');
  if (layoutSegmented) {
    layoutSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisLayoutSide: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis layout changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle Recommended Perks Order segmented control click
  const perkOrderSegmented = document.getElementById('aegis-perk-order-segmented');
  if (perkOrderSegmented) {
    perkOrderSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisPerkOrder: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis perk order changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle 2-Column Perks Matrix segmented control click
  const matrixSegmented = document.getElementById('aegis-matrix-segmented');
  if (matrixSegmented) {
    matrixSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisCompactPerksMatrix: val === 'true' }, () => {
            updateUI();
          });
        }
      }
    });
  }

  // Handle Aegis Popup Summary Mode segmented control click
  const popupSummarySegmented = document.getElementById('aegis-popup-summary-segmented');
  if (popupSummarySegmented) {
    popupSummarySegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisPopupSummaryMode: val }, () => {
            updateUI();
          });
        }
      }
    });
  }

  // Handle Auto Max-Height segmented control click
  const autoMaxHeightSegmented = document.getElementById('aegis-auto-max-height-segmented');
  if (autoMaxHeightSegmented) {
    autoMaxHeightSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisAutoMaxHeight: val === 'true' }, () => {
            updateUI();
          });
        }
      }
    });
  }

  // Handle Tooltip Width Mode segmented control click
  const tooltipWidthModeSegmented = document.getElementById('aegis-tooltip-width-mode-segmented');
  if (tooltipWidthModeSegmented) {
    tooltipWidthModeSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisTooltipWidthMode: val }, () => {
            updateUI();
          });
        }
      }
    });
  }

  // Handle Tooltip Width Slider input & change
  const widthSlider = document.getElementById('aegis-tooltip-width-slider') as HTMLInputElement;
  const widthValText = document.getElementById('tooltip-width-value');
  if (widthSlider) {
    widthSlider.addEventListener('input', () => {
      const val = parseInt(widthSlider.value, 10);
      if (widthValText) {
        widthValText.textContent = `${val}px`;
      }
    });

    widthSlider.addEventListener('change', () => {
      const val = parseInt(widthSlider.value, 10);
      chrome.storage.local.set({ aegisTooltipWidth: val, aegisTooltipWidthMode: 'fixed' }, () => {
        updateUI();
      });
    });
  }

  // Handle Two-Tier segmented control click
  const twoTierSegmented = document.getElementById('aegis-two-tier-segmented');
  if (twoTierSegmented) {
    twoTierSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisTwoTier: val === 'true' }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Two-Tier grade changed to: ${val === 'true'}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle Badge Position segmented control click
  const badgePosSegmented = document.getElementById('aegis-badge-position-segmented');
  if (badgePosSegmented) {
    badgePosSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisBadgePosition: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Badge Position changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  document.querySelectorAll<HTMLButtonElement>('#aegis-badge-color-segmented button').forEach(button => {
    button.addEventListener('click', () => {
      chrome.storage.local.set({ aegisBadgeColor: resolveBadgeColor(button.dataset.value) }, updateUI);
    });
  });

  const tileGlow = document.getElementById('aegis-tile-glow') as HTMLSelectElement | null;
  tileGlow?.addEventListener('change', () => {
    chrome.storage.local.set({ aegisTileGlow: resolveTileGlow(tileGlow.value) }, updateUI);
  });

  // Handle Badge Style segmented control click
  const badgeStyleSegmented = document.getElementById('aegis-badge-style-segmented');
  if (badgeStyleSegmented) {
    badgeStyleSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisBadgeStyle: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Badge Style changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle Upgrade Style segmented control click
  const upgradeStyleSegmented = document.getElementById('aegis-upgrade-style-segmented');
  if (upgradeStyleSegmented) {
    upgradeStyleSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisUpgradeStyle: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Upgrade Style changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  document.querySelectorAll<HTMLElement>('[data-badge-category]').forEach(group => {
    group.addEventListener('click', async event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]');
      if (!button) return;
      const stored = await chrome.storage.local.get(['aegisBadgeVisibility']);
      const visibility = normalizeBadgeVisibility(stored.aegisBadgeVisibility);
      visibility[group.dataset.badgeCategory as BadgeCategory] = button.dataset.value as BadgeVisibility;
      await chrome.storage.local.set({ aegisBadgeVisibility: visibility });
    });
  });
  const sizeSlider = document.getElementById('aegis-badge-size-slider') as HTMLInputElement;
  sizeSlider.addEventListener('input', () => {
    const value = normalizeBadgeSize(Number(sizeSlider.value));
    document.getElementById('badge-size-value')!.textContent = `${value}%`;
    document.documentElement.style.setProperty('--aegis-badge-size', String(value / 100));
    chrome.storage.local.set({ aegisBadgeSize: value });
  });

  // Handle Badge Scale Slider
  const scaleSlider = document.getElementById('aegis-badge-scale-slider') as HTMLInputElement;
  const scaleValueText = document.getElementById('badge-scale-value');
  if (scaleSlider) {
    scaleSlider.addEventListener('input', () => {
      const val = parseInt(scaleSlider.value, 10) || 100;
      if (scaleValueText) {
        scaleValueText.textContent = `${val}%`;
      }
      document.documentElement.style.setProperty('--aegis-badge-scale', (val / 100).toString());
    });

    scaleSlider.addEventListener('change', () => {
      const val = parseInt(scaleSlider.value, 10) || 100;
      chrome.storage.local.set({ aegisBadgeScale: val }, () => {
        console.log(`[DIM Aegis Overlay] Aegis Badge Scale changed to: ${val}%`);
        updateUI();
      });
    });
  }

  // Handle Fade on Hover segmented control click
  const fadeHoverSegmented = document.getElementById('aegis-fade-hover-segmented');
  if (fadeHoverSegmented) {
    fadeHoverSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisFadeHover: val === 'true' }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Fade Hover changed to: ${val === 'true'}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle Grade Display Mode segmented control click (equipped, dual, potential)
  const gradeDisplaySegmented = document.getElementById('aegis-grade-display-segmented');
  if (gradeDisplaySegmented) {
    gradeDisplaySegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisGradeDisplayMode: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Grade Display Mode changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle Aegis Hover Enabled segmented control click
  const hoverEnabledSegmented = document.getElementById('aegis-hover-enabled-segmented');
  if (hoverEnabledSegmented) {
    hoverEnabledSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisHoverEnabled: val === 'true' }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Hover Enabled changed to: ${val === 'true'}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle Armor Source segmented control click
  const armorSourceSegmented = document.getElementById('aegis-armor-source-segmented');
  if (armorSourceSegmented) {
    armorSourceSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisArmorSource: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Armor Source changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  function setLoadingState(loading: boolean) {
    if (loading) {
      syncBtn.disabled = true;
      urlInput.disabled = true;
      syncBtn.querySelector('.spinner')?.classList.remove('hidden');
      const textEl = syncBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Syncing...';
    } else {
      syncBtn.disabled = false;
      urlInput.disabled = false;
      syncBtn.querySelector('.spinner')?.classList.add('hidden');
      const textEl = syncBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Sync Wishlist';
    }
  }

  // Handle Extension Update banner dismiss click
  const updateBannerDismissBtn = document.getElementById('update-banner-dismiss');
  if (updateBannerDismissBtn) {
    updateBannerDismissBtn.addEventListener('click', () => {
      chrome.storage.local.set({ updateBannerDismissed: true }, () => {
        const updateBanner = document.getElementById('extension-update-banner');
        if (updateBanner) {
          updateBanner.classList.add('hidden');
        }
      });
    });
  }

  const sheetsSyncStatusRow = document.getElementById('sheets-sync-status-row') as HTMLDivElement;
  const sheetsSyncStatusText = document.getElementById('sheets-sync-status-text') as HTMLSpanElement;

  // Sync spreadsheets button event listener
  const syncSheetsBtn = document.getElementById('sync-sheets-button') as HTMLButtonElement;
  if (syncSheetsBtn) {
    syncSheetsBtn.addEventListener('click', () => {
      syncSheetsBtn.disabled = true;
      syncSheetsBtn.querySelector('.spinner')?.classList.remove('hidden');
      const textEl = syncSheetsBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Syncing...';

      if (sheetsSyncStatusRow) sheetsSyncStatusRow.style.display = 'block';
      if (sheetsSyncStatusText) {
        sheetsSyncStatusText.textContent = '⏳ Syncing spreadsheets...';
        sheetsSyncStatusText.style.color = '#ffb300';
      }

      chrome.runtime.sendMessage({ action: 'syncSpreadsheets' }, (response) => {
        syncSheetsBtn.disabled = false;
        syncSheetsBtn.querySelector('.spinner')?.classList.add('hidden');
        if (textEl) textEl.textContent = 'Resync Spreadsheets';

        if (response && response.success) {
          if (sheetsSyncStatusText) {
            sheetsSyncStatusText.textContent = '✅ Spreadsheets synced successfully!';
            sheetsSyncStatusText.style.color = '#4caf50';
          }
          updateUI();
        } else {
          if (sheetsSyncStatusText) {
            const errMsg = response?.error || 'Unknown error';
            sheetsSyncStatusText.textContent = `❌ Sheets sync failed: ${errMsg}`;
            sheetsSyncStatusText.style.color = '#f44336';
          }
        }
      });
    });
  }

  // Version click listener to check for updates
  const updateCheckStatus = document.getElementById('update-check-status');
  const versionText = document.getElementById('version-text');
  if (versionText) {
    versionText.addEventListener('click', () => {
      versionText.style.opacity = '0.5';
      if (updateCheckStatus) {
        updateCheckStatus.textContent = 'Checking...';
        updateCheckStatus.style.color = '#88888d';
        updateCheckStatus.style.display = 'inline';
      }

      chrome.runtime.sendMessage({ action: 'checkUpdates' }, (response) => {
        versionText.style.opacity = '1';
        if (response && response.success) {
          if (response.updateAvailable) {
            if (updateCheckStatus) {
              updateCheckStatus.textContent = 'Update available!';
              updateCheckStatus.style.color = '#ffb300';
              updateCheckStatus.style.display = 'inline';
            }
            updateUI();
          } else {
            if (updateCheckStatus) {
              updateCheckStatus.textContent = 'Up to date';
              updateCheckStatus.style.color = '#4caf50';
              updateCheckStatus.style.display = 'inline';
              setTimeout(() => {
                updateCheckStatus.style.display = 'none';
              }, 3000);
            }
          }
        } else {
          if (updateCheckStatus) {
            updateCheckStatus.textContent = 'Check failed';
            updateCheckStatus.style.color = '#f44336';
            updateCheckStatus.style.display = 'inline';
          }
        }
      });
    });
  }

  // Initial UI update
  updateUI();

  // Sync button event listener
  syncBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();

    if (!url) {
      alert('Please enter a valid URL.');
      return;
    }

    setLoadingState(true);
    syncStatus.textContent = 'Syncing...';
    syncStatus.className = 'status-value status-loading';
    errorContainer.classList.add('hidden');

    const syncStatusBox = document.getElementById('sync-status');
    const syncStatusTextEl = document.getElementById('sync-status-text');
    if (syncStatusBox) syncStatusBox.classList.remove('hidden');
    if (syncStatusTextEl) {
      syncStatusTextEl.textContent = '⏳ Syncing wishlist...';
      syncStatusTextEl.style.color = '#ffb300';
    }

    chrome.runtime.sendMessage({ action: 'syncNow', url }, (response) => {
      // Small timeout to let storage propagate
      setTimeout(() => {
        setLoadingState(false);
        updateUI();
        if (response && response.success) {
          if (syncStatusTextEl) {
            syncStatusTextEl.textContent = '✅ Wishlist synced successfully!';
            syncStatusTextEl.style.color = '#4caf50';
          }
        } else {
          if (syncStatusTextEl) {
            const errMsg = response?.error || 'Unknown error';
            syncStatusTextEl.textContent = `❌ Wishlist sync failed: ${errMsg}`;
            syncStatusTextEl.style.color = '#f44336';
          }
        }
      }, 300);
    });
  });

  // Clear/Reset Wishlist button event listener
  const wishlistClearBtn = document.getElementById('wishlist-clear-button') as HTMLButtonElement;
  if (wishlistClearBtn) {
    wishlistClearBtn.addEventListener('click', () => {
      urlInput.value = DEFAULT_URL;
      chrome.storage.local.set(
        {
          wishlistUrl: DEFAULT_URL,
          wishlistData: {},
          syncStatus: 'success',
          syncError: ''
        },
        () => {
          updateUI();
          const syncStatusBox = document.getElementById('sync-status');
          const syncStatusTextEl = document.getElementById('sync-status-text');
          if (syncStatusBox) syncStatusBox.classList.remove('hidden');
          if (syncStatusTextEl) {
            syncStatusTextEl.textContent = `✅ ${t('wishlistCleared') || 'Wishlist cleared and reset to default.'}`;
            syncStatusTextEl.style.color = '#4caf50';
          }
        }
      );
    });
  }

  // ── Light.gg background sync button ──────────────────────────────────────
  function setLightGGLoading(loading: boolean) {
    if (!lightggSyncBtn) return;
    if (lightggClearBtn) lightggClearBtn.disabled = loading;
    if (loading) {
      lightggSyncBtn.disabled = true;
      lightggSyncBtn.querySelector('.spinner')?.classList.remove('hidden');
      const textEl = lightggSyncBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Syncing...';
      if (lightggSyncStatusRow) lightggSyncStatusRow.style.display = 'block';
      if (lightggSyncStatusText) {
        lightggSyncStatusText.textContent = '⏳ Opening Roll Appraiser in background...';
        lightggSyncStatusText.style.color = '#ffb300';
      }
    } else {
      lightggSyncBtn.disabled = false;
      lightggSyncBtn.querySelector('.spinner')?.classList.add('hidden');
      const textEl = lightggSyncBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Sync Grades';
    }
  }

  if (lightggSyncBtn) {
    lightggSyncBtn.addEventListener('click', () => {
      setLightGGLoading(true);
      chrome.runtime.sendMessage({ action: 'syncLightGG' }, (response) => {
        setLightGGLoading(false);
        if (lightggSyncStatusRow) lightggSyncStatusRow.style.display = 'block';
        if (response && response.success) {
          if (lightggSyncStatusText) {
            lightggSyncStatusText.textContent = `✅ Done! ${(response.count || 0).toLocaleString()} weapons graded.`;
            lightggSyncStatusText.style.color = '#4caf50';
          }
          updateUI();
        } else {
          if (lightggSyncStatusText) {
            const errMsg = (response && response.error) ? response.error : 'Unknown error';
            lightggSyncStatusText.textContent = `❌ ${errMsg}`;
            lightggSyncStatusText.style.color = '#f44336';
          }
        }
      });
    });
  }

  if (lightggClearBtn) {
    lightggClearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear your cached Light.gg weapon grades?')) {
        chrome.storage.local.set({ lightggData: {}, lightggLastSync: 0 }, () => {
          updateUI();
          if (lightggSyncStatusRow) lightggSyncStatusRow.style.display = 'block';
          if (lightggSyncStatusText) {
            lightggSyncStatusText.textContent = '🧹 Cache cleared successfully.';
            lightggSyncStatusText.style.color = '#4caf50';
          }
        });
      }
    });
  }

  // --- Changelog Modal Handlers ---
  const changelogModal = document.getElementById('changelog-modal') as HTMLDivElement | null;
  const openChangelogBtn = document.getElementById('open-changelog-btn') as HTMLButtonElement | null;
  const changelogCloseBtn = document.getElementById('changelog-close-btn') as HTMLButtonElement | null;
  const changelogAckBtn = document.getElementById('changelog-ack-btn') as HTMLButtonElement | null;

  const showChangelog = () => {
    if (changelogModal) changelogModal.classList.remove('hidden');
  };

  const hideChangelog = () => {
    if (changelogModal) changelogModal.classList.add('hidden');
    const currentVersion = chrome.runtime.getManifest().version;
    chrome.storage.local.set({ lastSeenChangelogVersion: currentVersion });
  };

  if (openChangelogBtn) openChangelogBtn.addEventListener('click', showChangelog);
  if (changelogCloseBtn) changelogCloseBtn.addEventListener('click', hideChangelog);
  if (changelogAckBtn) changelogAckBtn.addEventListener('click', hideChangelog);
  if (changelogModal) {
    changelogModal.addEventListener('click', (e) => {
      if (e.target === changelogModal) {
        hideChangelog();
      }
    });
  }


  // Listen for storage updates in real-time
  chrome.storage.onChanged.addListener((_changes, namespace) => {
    if (namespace === 'local') {
      if (_changes.aegisGradeColors && Object.keys(_changes).length === 1) {
        setGradeColors(normalizeGradeSettings(_changes.aegisGradeColors.newValue));
        renderOptionsPreview();
        return;
      }
      updateUI();
    }
  });
});

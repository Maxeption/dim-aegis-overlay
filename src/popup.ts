import { initLanguage, t } from './i18n';
import { LocalStorageSchema, AegisMode } from './types';

function localizePopup(storedLang?: string) {
  initLanguage(storedLang);
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key);
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      el.placeholder = t(key);
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key && el instanceof HTMLElement) {
      el.title = t(key);
    }
  });
}

const DEFAULT_URL =
  'https://raw.githubusercontent.com/charlesxcaliber/DIMAegisWeaponWishlist/main/MrCharlesWishlist_MRB_PPC2.txt';

document.addEventListener('DOMContentLoaded', () => {
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
        'aegisBadgePosition',
        'aegisBadgeStyle',
        'aegisBadgeScale',
        'aegisFadeHover',
        'aegisGradeDisplayMode',
        'aegisHoverEnabled',
        'aegisCompactPerksMatrix',
        'aegisInlineHeader',
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
              dbToggleGroup.style.display = 'none';
            } else {
              dbToggleGroup.style.display = 'block';
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
              aegisModeGroup.style.display = 'none';
            } else {
              aegisModeGroup.style.display = 'block';
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

        // Update Live Interactive Weapon Tile Preview
        const mockBadge = document.getElementById('mock-aegis-badge');
        if (mockBadge) {
          // Remove old position and style classes
          mockBadge.classList.remove('aegis-pos-bl', 'aegis-pos-tl', 'aegis-pos-tr', 'aegis-pos-br');
          mockBadge.classList.remove('aegis-style-classic', 'aegis-style-pill', 'aegis-style-notch');

          const posKey = badgePosVal.replace('bottom-left', 'bl').replace('top-left', 'tl').replace('top-right', 'tr').replace('bottom-right', 'br');
          mockBadge.classList.add(`aegis-pos-${posKey}`);
          mockBadge.classList.add(`aegis-style-${badgeStyleVal}`);

          const isTwoTier = res.aegisTwoTier === true;
          if (aegisModeVal === 'both') {
            mockBadge.classList.add('aegis-badge-split', 'aegis-badge-wide');
            const pveStr = isTwoTier ? 'SS+' : 'S+';
            const pvpStr = isTwoTier ? 'AA' : 'A';
            mockBadge.innerHTML = `<span class="aegis-split-half aegis-split-left aegis-badge-s">${pveStr}</span><span class="aegis-split-half aegis-split-right aegis-badge-a">${pvpStr}</span>`;
          } else {
            mockBadge.classList.remove('aegis-badge-split');
            mockBadge.textContent = isTwoTier ? 'SS+' : 'S+';
          }
        }

        const cornerTargets = document.querySelectorAll('.interactive-weapon-tile .corner-target');
        cornerTargets.forEach(target => {
          if (target.getAttribute('data-pos') === badgePosVal) {
            target.classList.add('active-corner');
          } else {
            target.classList.remove('active-corner');
          }
        });

        // Set Aegis Fade on Hover segmented control
        const fadeHoverVal = res.aegisFadeHover === true ? 'true' : 'false';
        const fadeHoverSegmented = document.getElementById('aegis-fade-hover-segmented');
        if (fadeHoverSegmented) {
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

        // Set Aegis Inline Header segmented control
        const inlineHeaderVal = res.aegisInlineHeader !== false ? 'true' : 'false';
        const inlineHeaderSegmented = document.getElementById('aegis-inline-header-segmented');
        if (inlineHeaderSegmented) {
          inlineHeaderSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === inlineHeaderVal) {
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

  // Handle Inline Header segmented control click
  const inlineHeaderSegmented = document.getElementById('aegis-inline-header-segmented');
  if (inlineHeaderSegmented) {
    inlineHeaderSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisInlineHeader: val === 'true' }, () => {
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

  // Handle Interactive Mockup Portrait Corner Hotspots click
  const interactiveTile = document.getElementById('interactive-weapon-tile');
  if (interactiveTile) {
    interactiveTile.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const hotspot = target.closest('.corner-target') as HTMLElement;
      if (hotspot) {
        const pos = hotspot.getAttribute('data-pos');
        if (pos) {
          chrome.storage.local.set({ aegisBadgePosition: pos }, () => {
            console.log(`[DIM Aegis Overlay] Interactive tile position set to: ${pos}`);
            updateUI();
          });
        }
      }
    });
  }

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
      updateUI();
    }
  });
});

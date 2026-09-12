import { GRADES, Grade, GradeRule, GradeSettings, defaultGradeSettings, defaultRules, normalizeGradeSettings, unreachableGrades } from './grading';
import { applyGradeColors, gradeGradient, defaultGradeColors as swatches } from './grade-colors';
import { safeSetInnerHTML } from './dom-utils';
import { t, getCurrentLanguage, localizeElements } from './i18n';
import { Hsv, hexToHsv, hsvToHex } from './color-picker';

const traitLabels: Record<GradeRule['traits'], string> = { both: 'traitsBoth', mixed: 'traitsMixed', one: 'traitsOne', available: 'traitsAvailable' };
const extraLabels: Record<GradeRule['extras'], string> = { none: 'none', mag: 'extraMagazine', barrel: 'barrel', either: 'extraEither', both: 'extraBoth' };
const defaultGuide: Record<Grade, string> = {
  'S+': 'guideSPlus', S: 'guideS',
  'A+': 'guideAPlus', A: 'guideA',
  'B+': 'guideBPlus', B: 'guideB',
  C: 'guideC', D: 'guideD', E: 'guideE', F: 'guideF',
};

export function initGradeSettings() {
  const root = document.getElementById('aegis-grade-settings');
  if (!root) return;
  const el = document.querySelector<HTMLElement>('.popup-main')!;
  let language = getCurrentLanguage();
  let rulesError: string | undefined;
  let colorsError: string | undefined;
  let saved = defaultGradeSettings();
  let draft = defaultGradeSettings();
  let selected: Grade = 'S';
  let context: 'pve' | 'pvp' = 'pve';
  let ruleWrites = 0;
  let colorWrites = 0;
  let scoringSource = 'aegis';
  let databaseMode = 'both';
  let hsv: Hsv = [0, 100, 100];
  const get = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector)!;
  const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => `<option value="${value}" data-i18n="${label}">${t(label)}</option>`).join('');
  safeSetInnerHTML(root, `
<section id="grade-colors-modal" class="grade-settings" aria-labelledby="grade-colors-modal-title"><div class="grade-editor-card"><div class="grade-editor-header"><h2 id="grade-colors-modal-title" class="grade-editor-title" data-i18n="customizeGradeColors">Customize Colors</h2></div><div class="grade-editor-body">
      <p class="description" data-color-status role="status"></p>
      <div class="grade-pills" role="group" data-i18n-aria-label="gradeToEdit" aria-label="Grade to edit">${GRADES.map(g => `<button type="button" class="aegis-badge-${g[0].toLowerCase()}" data-grade="${g}" data-aegis-grade="${g}" aria-pressed="false">${g}</button>`).join('')}</div>
      <div class="grade-color-fields">
        <div class="grade-color-preview" data-color role="img" data-i18n-aria-label="gradeColorSample" aria-label="Selected grade color"></div>
        <div class="grade-hex-field"><span aria-hidden="true">#</span><input type="text" data-hex maxlength="7" spellcheck="false" data-i18n-aria-label="gradeHexColor" aria-label="Selected grade hex color"></div>
      </div>
      <div class="grade-color-sliders">${['colorHue', 'colorSaturation', 'colorBrightness'].map((label, index) => `<div class="grade-color-slider"><input type="range" data-hsv="${index}" min="0" max="${index === 0 ? 360 : 100}" step="1" data-i18n-aria-label="${label}" aria-label="${t(label)}"><div class="grade-hsv-field"><input type="number" data-hsv-value="${index}" min="0" max="${index === 0 ? 360 : 100}" step="1" required aria-label="${t(index === 0 ? 'colorFieldDegrees' : 'colorFieldPercent', { label: t(label) })}"><span aria-hidden="true">${index === 0 ? '°' : '%'}</span></div></div>`).join('')}</div>
      <div class="grade-actions grade-color-actions"><button type="button" class="btn btn-secondary" data-reset-color data-i18n="resetSelected">Reset selected</button><button type="button" class="btn btn-secondary" data-reset-colors data-i18n="resetAll">Reset all</button></div>
</div></div></section><section id="grade-rules-modal" class="grade-settings" aria-labelledby="grade-rules-modal-title"><div class="grade-editor-card"><div class="grade-editor-header grade-rules-header"><h2 id="grade-rules-modal-title" class="grade-editor-title" data-i18n="customizeGradingCriteria">Customize Grades</h2><div class="grade-profile-row">
        <label class="grade-check"><input type="checkbox" data-setting="separatePvp"> <span data-i18n="separatePvp">Separate PvP</span></label>
        <div class="segmented-control" data-context role="group" data-i18n-aria-label="gradeProfile" aria-label="Profile to edit"><button type="button" data-profile="pve" data-i18n="inlinePve" aria-pressed="true">PvE</button><button type="button" data-profile="pvp" data-i18n="inlinePvp" aria-pressed="false">PvP</button></div>
      </div></div><div class="grade-editor-body">
      <div class="grade-pills" role="group" data-i18n-aria-label="gradeToEdit" aria-label="Grade to edit">${GRADES.map(g => `<button type="button" class="aegis-badge-${g[0].toLowerCase()}" data-grade="${g}" data-aegis-grade="${g}" aria-pressed="false">${g}</button>`).join('')}</div>
      <div class="grade-summary-row"><label class="grade-check" data-i18n-title="includeGrade" title="Include this grade in scoring and the overview"><input type="checkbox" data-rule="enabled"> <span data-i18n="fadeHoverEnabled">Enabled</span></label><p class="description" data-rule-summary role="status"></p></div>
      <div class="grade-rule-fields" data-rule-fields>
        <label class="grade-rule-select" data-i18n-title="matchMainTraits" title="Match recommended main traits"><span data-i18n="mainTraits">Main traits</span><select data-rule="traits">${options(traitLabels)}</select></label>
        <label class="grade-rule-select" data-i18n-title="matchBarrelMag" title="Match the recommended barrel and magazine"><span data-i18n="barrelMag">Barrel / mag</span><select data-rule="extras">${options(extraLabels)}</select></label>
        <div class="grade-rule-checks">
          <label class="grade-check" data-i18n-title="originEquipped" title="Recommended origin trait equipped"><input type="checkbox" data-rule="origin"> <span data-i18n="origin">Origin</span></label>
          <label class="grade-check" data-i18n-title="masterworkCriterion" title="Recommended masterwork matched; ignored when none is recommended"><input type="checkbox" data-rule="masterwork"> <span data-i18n="masterworkLabel">Masterwork</span></label>
        </div>
      </div>
      <p class="grade-warning" data-warning role="status" data-i18n-title="higherGradesFirst" title="Higher matching grades take priority"></p>
      <div class="grade-actions grade-color-actions"><button type="button" class="btn btn-secondary" data-reset-rule data-i18n-title="resetGradeTip" title="Reset this grade in the selected profile" data-i18n="resetSelected">Reset selected</button><button type="button" class="btn btn-secondary" data-reset-rules data-i18n-title="resetRulesTip" title="Reset all criteria, including both PvE and PvP" data-i18n="resetAll">Reset all</button></div>
      <p class="description" data-status role="status"></p>
</div></div></section>
  `);

  document.getElementById('options-Badges')!.append(root.querySelector('#grade-colors-modal')!);
  document.getElementById('options-Scoring')!.append(root.querySelector('#grade-rules-modal')!);
  root.remove();

  function ruleDescription(grade: Grade, rules: GradeSettings['pve']) {
    const defaults = defaultRules();
    if (JSON.stringify(rules) === JSON.stringify(defaults)) return t(defaultGuide[grade]);
    if (grade === 'F') return t('noGradeMatched');
    const rule = rules[grade];
    if (JSON.stringify(rule) === JSON.stringify(defaults[grade])) return t(defaultGuide[grade]);
    const traits = { both: t('guideBothTraits'), mixed: t('guideMixedTraits'), one: t('guideOneTrait'), available: t('guideE') };
    const extras = { none: '', mag: t('magazine'), barrel: t('barrel'), either: t('guideEitherExtra'), both: t('guideBothExtras') };
    return [traits[rule.traits], extras[rule.extras], rule.origin ? t('origin') : '', rule.masterwork ? t('masterwork') : ''].filter(Boolean).join(' + ');
  }

  function renderGuide() {
    const guide = document.getElementById('grade-scoring-guide');
    if (!guide) return;
    if (scoringSource === 'lightgg') {
      safeSetInnerHTML(guide, `<p class="tooltip-desc">${t('gradeGuideLightgg')}</p>`);
      applyGuideColors();
      return;
    }
    const defaults = defaultRules();
    const custom = rulesAvailable() && saved.rulesEnabled;
    const profiles = custom && saved.separatePvp ? [['PvE', saved.pve], ['PvP', saved.pvp]] as const
      : [['', custom ? saved.pve : defaults]] as const;
    const sourceNote = databaseMode === 'wishlist' ? 'gradeGuideWishlist' : custom && databaseMode === 'both' ? 'gradeGuideSheetOnly' : '';
    safeSetInnerHTML(guide, (sourceNote ? `<p class="tooltip-desc">${sourceNote === 'gradeGuideSheetOnly' ? `<em>${t(sourceNote)}</em>` : t(sourceNote)}</p>` : '') + profiles.map(([label, rules]) => {
      const unreachable = unreachableGrades(rules);
      return `${label ? `<p class="tooltip-desc">${label}</p>` : ''}<div class="tooltip-grid">${GRADES.filter(grade => grade === 'F' || rules[grade].enabled).map(grade => {
        const description = ruleDescription(grade, rules);
        return `<span class="grade-pill grade-${grade[0].toLowerCase()}-pill" data-aegis-grade="${grade}">${grade}</span><span${unreachable.includes(grade) ? ` title="${t('unreachableGradeTip')}"` : ''}>${description}</span>`;
      }).join('')}</div>`;
    }).join('') + (!custom
      ? `<span class="tooltip-note">${t('defaultTraitsNote')}</span>` : ''));
    applyGuideColors();
  }

  function applyGuideColors() {
    const guide = document.querySelector<HTMLElement>('.aegis-help-tooltip');
    if (guide) applyGradeColors(guide, saved);
  }

  function profile() { return draft[context === 'pvp' && draft.separatePvp ? 'pvp' : 'pve']; }
  function rulesAvailable() { return scoringSource !== 'lightgg' && databaseMode !== 'wishlist'; }
  function editableSettings(settings: GradeSettings) {
    return { ...structuredClone(settings), colors: settings.colorsEnabled ? { ...settings.colors } : {} };
  }
  function saveRules() {
    ruleWrites++;
    get('[data-status]').textContent = '';
    chrome.storage.local.set({ aegisGradeSettings: normalizeGradeSettings(draft) }, () => {
      ruleWrites--;
      const error = chrome.runtime.lastError;
      rulesError = error?.message;
      if (rulesError) get('[data-status]').textContent = t('saveRulesError', { error: rulesError });
    });
  }
  function saveColors() {
    const palette = { version: 1, colorsEnabled: draft.colorsEnabled, colors: { ...draft.colors } };
    colorWrites++;
    get('[data-color-status]').textContent = '';
    chrome.storage.local.set({ aegisGradeColors: palette }, () => {
      colorWrites--;
      const error = chrome.runtime.lastError;
      colorsError = error?.message;
      if (colorsError) get('[data-color-status]').textContent = t('saveColorsError', { error: colorsError });
    });
  }
  function renderColor(color: string) {
    for (const grade of GRADES) {
      if (draft.colors[grade]?.toLowerCase() === swatches[grade]) delete draft.colors[grade];
    }
    draft.colorsEnabled = Object.keys(draft.colors).length > 0;
    el.querySelectorAll<HTMLButtonElement>('#grade-colors-modal [data-grade]').forEach(button => {
      const grade = button.dataset.grade as Grade;
      const custom = !!draft.colors[grade];
      button.toggleAttribute('data-custom-color', custom);
      button.title = t(custom ? 'customColor' : 'defaultColor');
      button.setAttribute('aria-label', `${grade}: ${button.title}`);
    });
    get<HTMLButtonElement>('[data-reset-color]').disabled = !draft.colors[selected];
    get<HTMLButtonElement>('[data-reset-colors]').disabled = !draft.colorsEnabled;
    get('[data-color]').style.background = gradeGradient(color);
    get('[data-color]').setAttribute('aria-label', t('gradeColorValue', { grade: selected, color: color.toUpperCase() }));
    el.querySelectorAll<HTMLInputElement>('[data-hsv]').forEach(input => {
      const index = Number(input.dataset.hsv);
      input.value = String(hsv[index]);
      input.setAttribute('aria-valuetext', t(index === 0 ? 'colorDegrees' : 'colorPercent', { value: Math.round(hsv[index]) }));
      const field = get<HTMLInputElement>(`[data-hsv-value="${index}"]`);
      field.setAttribute('aria-label', t(index === 0 ? 'colorFieldDegrees' : 'colorFieldPercent', { label: t(['colorHue', 'colorSaturation', 'colorBrightness'][index]) }));
      if (document.activeElement !== field) field.value = String(Math.round(hsv[index]));
    });
    get('[data-hsv="1"]').style.background = `linear-gradient(to right, ${hsvToHex([hsv[0], 0, hsv[2]])}, ${hsvToHex([hsv[0], 100, hsv[2]])})`;
    get('[data-hsv="2"]').style.background = `linear-gradient(to right, #000000, ${hsvToHex([hsv[0], hsv[1], 100])})`;
  }
  function render() {
    get('#grade-rules-modal').hidden = !rulesAvailable();
    draft.rulesEnabled = draft.separatePvp || JSON.stringify(draft.pve) !== JSON.stringify(defaultRules());
    get<HTMLInputElement>('[data-setting="separatePvp"]').checked = draft.separatePvp;
    el.querySelectorAll<HTMLButtonElement>('[data-grade]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.grade === selected)); });
    const color = draft.colors[selected] || swatches[selected];
    hsv = hexToHsv(color, hsv);
    renderColor(color);
    get<HTMLInputElement>('[data-hex]').value = color.slice(1).toUpperCase();
    get<HTMLInputElement>('[data-hex]').setCustomValidity('');
    get('[data-context]').setAttribute('aria-disabled', String(!draft.separatePvp));
    el.querySelectorAll<HTMLButtonElement>('[data-profile]').forEach(button => {
      button.disabled = !draft.separatePvp;
      button.classList.toggle('active', button.dataset.profile === context);
      button.setAttribute('aria-pressed', String(button.dataset.profile === context));
    });
    const inactive = selected === 'F' || !profile()[selected].enabled;
    get('[data-rule-fields]').setAttribute('aria-disabled', String(inactive));
    get('[data-rule-summary]').textContent = ruleDescription(selected, profile());
    el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-rule]').forEach(input => {
      input.disabled = selected === 'F' || (inactive && input.dataset.rule !== 'enabled');
      if (selected === 'F') {
        if (input instanceof HTMLInputElement) input.checked = input.dataset.rule === 'enabled';
        else input.selectedIndex = -1;
        return;
      }
      const value = profile()[selected][input.dataset.rule as keyof GradeRule];
      if (input instanceof HTMLInputElement) input.checked = value as boolean;
      else input.value = value as string;
    });
    const defaults = defaultRules();
    const isCustom = (grade: Grade) => grade !== 'F' && JSON.stringify(profile()[grade]) !== JSON.stringify(defaults[grade]);
    el.querySelectorAll<HTMLButtonElement>('#grade-rules-modal [data-grade]').forEach(button => {
      const grade = button.dataset.grade as Grade;
      const custom = isCustom(grade);
      button.toggleAttribute('data-grade-inactive', grade !== 'F' && !profile()[grade].enabled);
      button.toggleAttribute('data-custom-rule', custom);
      button.title = t(grade === 'F' ? 'fallbackGrade' : custom ? 'customCriteria' : 'defaultCriteria');
      button.setAttribute('aria-label', `${grade}: ${button.title}`);
    });
    get<HTMLButtonElement>('[data-reset-rule]').disabled = !isCustom(selected);
    get<HTMLButtonElement>('[data-reset-rules]').disabled = !draft.separatePvp &&
      JSON.stringify(draft.pve) === JSON.stringify(defaults) && JSON.stringify(draft.pvp) === JSON.stringify(defaults);
    const unreachable = draft.rulesEnabled ? unreachableGrades(profile()) : [];
    get('[data-warning]').textContent = unreachable.length ? t('unreachableGrades', { grades: unreachable.join(', ') }) : '';
    applyGradeColors(el, draft);
  }
  get<HTMLInputElement>('[data-setting="separatePvp"]').addEventListener('change', event => {
    draft.separatePvp = (event.target as HTMLInputElement).checked;
    if (!draft.separatePvp) context = 'pve';
    render(); saveRules();
  });
  el.querySelectorAll<HTMLButtonElement>('[data-grade]').forEach(button => button.addEventListener('click', () => { selected = button.dataset.grade as Grade; render(); }));
  el.querySelectorAll<HTMLButtonElement>('[data-profile]').forEach(button => button.addEventListener('click', () => {
    context = button.dataset.profile as 'pve' | 'pvp';
    render();
  }));
  el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-rule]').forEach(input => input.addEventListener('change', () => {
    if (selected === 'F') return;
    const r = profile()[selected];
    if (input instanceof HTMLInputElement) r[input.dataset.rule as 'origin' | 'masterwork' | 'enabled'] = input.checked;
    else if (input.dataset.rule === 'traits') r.traits = input.value as GradeRule['traits'];
    else r.extras = input.value as GradeRule['extras'];
    render(); saveRules();
  }));
  el.querySelectorAll<HTMLInputElement>('[data-hsv-value]').forEach(input => input.addEventListener('blur', () => {
    input.value = String(Math.round(hsv[Number(input.dataset.hsvValue)]));
  }));
  el.querySelectorAll<HTMLInputElement>('[data-hsv], [data-hsv-value]').forEach(input => input.addEventListener('input', () => {
    if (!input.validity.valid) return;
    hsv[Number(input.dataset.hsv ?? input.dataset.hsvValue)] = input.valueAsNumber;
    const color = hsvToHex(hsv);
    draft.colors[selected] = color;
    get<HTMLInputElement>('[data-hex]').value = color.slice(1).toUpperCase();
    get<HTMLInputElement>('[data-hex]').setCustomValidity('');
    renderColor(color); applyGradeColors(el, draft); saveColors();
  }));
  get<HTMLInputElement>('[data-hex]').addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/#/g, '');
    const valid = /^[0-9a-f]{6}$/i.test(input.value);
    const color = `#${input.value.toLowerCase()}`;
    input.setCustomValidity(valid ? '' : t('invalidHex'));
    if (valid) { draft.colors[selected] = color; hsv = hexToHsv(color, hsv); renderColor(color); applyGradeColors(el, draft); saveColors(); }
    else get('[data-color-status]').textContent = t('invalidHexStatus');
  });
  get('[data-reset-color]').addEventListener('click', () => { delete draft.colors[selected]; render(); saveColors(); });
  get('[data-reset-colors]').addEventListener('click', () => { draft.colors = {}; render(); saveColors(); });
  get('[data-reset-rule]').addEventListener('click', () => {
    if (selected === 'F') return;
    profile()[selected] = defaultRules()[selected];
    render(); saveRules();
  });
  get('[data-reset-rules]').addEventListener('click', () => {
    draft.pve = defaultRules(); draft.pvp = defaultRules(); draft.separatePvp = false; context = 'pve';
    render(); saveRules();
  });
  localizeElements(el);
  chrome.storage.local.get(['aegisGradeSettings', 'aegisGradeColors', 'scoringSource', 'aegisDbMode'], res => {
    scoringSource = res.scoringSource || 'aegis';
    databaseMode = res.aegisDbMode || 'both';
    saved = normalizeGradeSettings(res.aegisGradeSettings, res.aegisGradeColors);
    draft = editableSettings(saved); render(); renderGuide();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.scoringSource || changes.aegisDbMode) {
      if (changes.scoringSource) scoringSource = changes.scoringSource.newValue || 'aegis';
      if (changes.aegisDbMode) databaseMode = changes.aegisDbMode.newValue || 'both';
      render(); renderGuide();
    }
    if (changes.aegisGradeSettings) {
      saved = { ...normalizeGradeSettings(changes.aegisGradeSettings.newValue), colors: saved.colors, colorsEnabled: saved.colorsEnabled };
      renderGuide();
      if (!ruleWrites) { draft = { ...editableSettings(saved), colors: draft.colors, colorsEnabled: draft.colorsEnabled }; render(); }
    }
    if (changes.aegisGradeColors) {
      saved = normalizeGradeSettings(saved, changes.aegisGradeColors.newValue ?? { version: 1 });
      applyGuideColors();
      if (!colorWrites && (draft.colorsEnabled !== saved.colorsEnabled || JSON.stringify(draft.colors) !== JSON.stringify(saved.colors))) {
        draft.colors = saved.colorsEnabled ? { ...saved.colors } : {}; render();
      }
    }
  });
  return () => {
    if (language === getCurrentLanguage()) return;
    language = getCurrentLanguage();
    const hex = get<HTMLInputElement>('[data-hex]');
    const invalidHex = hex.validity.customError;
    const hexValue = hex.value;
    localizeElements(el);
    render();
    renderGuide();
    if (rulesError) get('[data-status]').textContent = t('saveRulesError', { error: rulesError });
    if (colorsError) get('[data-color-status]').textContent = t('saveColorsError', { error: colorsError });
    if (invalidHex) {
      hex.value = hexValue;
      hex.setCustomValidity(t('invalidHex'));
      get('[data-color-status]').textContent = t('invalidHexStatus');
    }
  };

}

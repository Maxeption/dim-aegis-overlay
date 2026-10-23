const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const content = fs.readFileSync('src/content.ts', 'utf8');
const popup = fs.readFileSync('src/popup.ts', 'utf8');
const helper = fs.readFileSync('src/activity-mode.ts', 'utf8').replace(/^import.*$/m, '').replace('export function', 'function');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const sourceUpdate = content.slice(content.indexOf('    if (changes.scoringSource)'), content.indexOf('    if (changes.aegisLayoutSide)'));
const modeUpdate = content.slice(content.indexOf('    if (changes.aegisMode || changes.scoringSource)'), content.indexOf('    if (changes.aegisTwoTier)'));
const startup = content.slice(content.indexOf("  scoringSource = res.scoringSource"), content.indexOf('  aegisTwoTier = res.aegisTwoTier'));
assert.ok(sourceUpdate && modeUpdate && startup);
const createState = new Function('res', compile(`
  ${helper}
  let scoringSource, savedAegisMode, aegisMode, aegisLayoutSide, aegisPerkOrder, aegisDbMode, changed;
  let aegisShoppingDb, aegisSheetDb;
  const aegisShoppingDbPvE = { activity: 'pve' }, aegisShoppingDbPvP = { activity: 'pvp' };
  const aegisSheetDbPvE = { activity: 'pve' }, aegisSheetDbPvP = { activity: 'pvp' };
  const applyTooltipWidthStyles = () => {}, updateExplorerTitles = () => {};
  ${startup}
  return {
    get: () => ({ source: scoringSource, saved: savedAegisMode, active: aegisMode }),
    update: changes => { ${sourceUpdate} ${modeUpdate} },
  };
`));

// Exercise the actual source-selection handler and its storage change consumers.
const handlerStart = popup.indexOf('  // Handle Scoring Source segmented');
assert.ok(handlerStart > 0);
const sourceHandler = popup.slice(handlerStart, popup.indexOf('  // Handle DB Mode segmented', handlerStart));
for (const savedMode of ['pve', 'pvp', 'both']) {
  const saved = { scoringSource: 'aegis', aegisMode: savedMode };
  const state = createState(saved);
  let click;
  const chrome = { storage: { local: { set(values, callback) {
    const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));
    Object.assign(saved, values);
    state.update(changes);
    callback();
  } } } };
  const document = { getElementById: () => ({ addEventListener: (_event, callback) => { click = callback; } }) };
  new Function('chrome', 'document', 'updateUI', compile(sourceHandler))(chrome, document, () => {});
  click({ target: { tagName: 'BUTTON', getAttribute: () => 'lightgg' } });
  assert.equal(state.get().active, savedMode === 'both' ? 'pve' : savedMode);
  assert.equal(saved.aegisMode, savedMode, 'Changing sources preserves the Aegis preference');
  assert.deepEqual(createState(saved).get(), state.get(), 'Reload resolves the same hidden setting');
  const popupMode = popup.match(/^        const aegisModeVal = .*;$/m)?.[0];
  assert.ok(popupMode);
  const displayedMode = new Function('sourceVal', 'res', compile(`${helper}\n${popupMode}\nreturn aegisModeVal;`))('lightgg', saved);
  assert.equal(displayedMode, state.get().active, 'Settings labels agree with the content view');
  click({ target: { tagName: 'BUTTON', getAttribute: () => 'aegis' } });
  assert.equal(state.get().active, savedMode, 'Returning to Aegis restores the preference');
}
const state = createState({ scoringSource: 'lightgg', aegisMode: 'both' });
state.update({ aegisMode: { newValue: 'both' } });
assert.equal(state.get().active, 'pve', 'Mode updates cannot activate hidden Both mode');
state.update({ scoringSource: { newValue: 'aegis' }, aegisMode: { newValue: 'pvp' } });
assert.equal(state.get().active, 'pvp', 'Atomic source and mode updates use both new values');
state.update({ scoringSource: { newValue: 'lightgg' }, aegisMode: { newValue: 'both' } });
assert.equal(state.get().active, 'pve');
console.log('PASS: source switching, reloads, preference restoration, hidden settings labels, and atomic updates.');

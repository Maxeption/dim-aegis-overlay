const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const popup = fs.readFileSync('src/popup.ts', 'utf8');
const content = fs.readFileSync('src/content.ts', 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const handler = popup.slice(popup.indexOf('  // Handle Aegis Mode (PvE vs PvP vs Both)'), popup.indexOf('  // Handle Layout segmented'));
const start = content.indexOf('    if (changes.aegisMode || changes.scoringSource)');
assert.ok(start > 0);
const modeUpdate = content.slice(start, content.indexOf('    if (changes.aegisTwoTier)', start));

for (const width of ['auto', 'fixed']) {
  let click;
  const saved = { aegisTooltipWidthMode: width, aegisTooltipWidth: 340 };
  const chrome = { storage: { local: {
    get: (_keys, callback) => callback(saved),
    set: (values, callback) => { Object.assign(saved, values); callback(); },
  } } };
  const document = { getElementById: () => ({ addEventListener: (_event, callback) => { click = callback; } }) };
  new Function('chrome', 'document', 'updateUI', compile(handler))(chrome, document, () => {});
  for (const mode of ['both', 'pvp', 'pve']) {
    click({ target: { tagName: 'BUTTON', getAttribute: () => mode } });
    assert.equal(saved.aegisMode, mode);
    assert.equal(saved.aegisTooltipWidthMode, width, 'Changing mode must not overwrite stored width');
    assert.equal(saved.aegisTooltipWidth, 340);
    const active = new Function('changes', 'saved', compile(`
      let aegisMode = 'pve', savedAegisMode = 'pve', scoringSource = 'aegis', aegisTooltipWidthMode = saved.aegisTooltipWidthMode, changed = false;
      ${fs.readFileSync('src/activity-mode.ts', 'utf8').replace(/^import.*$/m, '').replace('export function', 'function')}
      let aegisShoppingDb, aegisShoppingDbPvP, aegisShoppingDbPvE, aegisSheetDb, aegisSheetDbPvP, aegisSheetDbPvE;
      const applyTooltipWidthStyles = () => {}, updateExplorerTitles = () => {};
      ${modeUpdate}
      return aegisTooltipWidthMode;
    `))({ aegisMode: { newValue: mode } }, saved);
    assert.equal(active, width, 'Mode storage events must preserve active width');
  }
  // Run the actual startup assignment against persisted values after a reload.
  const startup = content.match(/^  aegisTooltipWidthMode = res\.aegisTooltipWidthMode.*$/m)?.[0];
  assert.ok(startup);
  assert.equal(new Function('res', `let aegisTooltipWidthMode = 'fixed'; ${startup} return aegisTooltipWidthMode;`)(saved), width);
}
console.log('PASS: Auto and Fixed persist across PvE/PvP/Both mode changes, storage events, and startup restoration.');

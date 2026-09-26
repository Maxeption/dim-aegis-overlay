const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
const src = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const tree = ts.createSourceFile('i18n.ts', src('i18n.ts'), ts.ScriptTarget.Latest, true);
const declarations = tree.statements.flatMap(statement => statement.declarationList?.declarations || []);
const tables = declarations.find(declaration => declaration.name.text === 'translations').initializer;
const translations = Object.fromEntries(tables.properties.map(table => {
  const entries = table.initializer.properties.map(property => [property.name.text, property.initializer.text]);
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, 'Duplicate keys: ' + table.name.text);
  return [table.name.text, Object.fromEntries(entries)];
}));
const keys = new Set(['badgeColor', 'badgeColorPerk', 'badgeColorArchetype', 'badgeColorGradient', 'badgeMaxTierGlow', 'customPerkGrading']);
const settings = ts.createSourceFile('grade-settings.ts', src('grade-settings.ts'), ts.ScriptTarget.Latest, true);
function visit(node) {
  if (ts.isStringLiteral(node) && node.text in translations.en) keys.add(node.text);
  ts.forEachChild(node, visit);
}
visit(settings);
const html = fs.readFileSync(path.join(__dirname, '../public/popup.html'), 'utf8');
const guide = html.slice(html.indexOf('id="open-grade-colors-btn"'), html.indexOf('<main'));
for (const markup of [src('grade-settings.ts'), guide]) {
  for (const match of markup.matchAll(/data-i18n(?:-title|-aria-label|-alt|-html)?="([a-zA-Z]+)"/g)) keys.add(match[1]);
}
const placeholders = text => [...new Set(text.match(/\{\w+\}/g) || [])].sort();
for (const [lang, values] of Object.entries(translations)) for (const key of keys) {
  assert.ok(typeof values[key] === 'string' && values[key].trim(), `${lang}: missing ${key}`);
  assert.deepEqual(placeholders(values[key]), placeholders(translations.en[key]), `${lang}: placeholders in ${key}`);
}
console.log(`Passed: ${keys.size} customization translation keys in ${Object.keys(translations).length} languages; no duplicate keys or mismatched placeholders.`);

const vm = require('node:vm');
const modules = new Map();
const nameRequests = [];
function loadModule(name) {
  if (name === './i18n') return { t: key => key, getLocalizedArmorSetName: () => null };
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  const code = ts.transpileModule(src(name.replace('./', '') + '.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: loadModule,
    document: { getElementById: () => ({
      getAttribute: () => null,
      setAttribute: (attribute, value) => nameRequests.push([attribute, value]),
    }) },
  });
  return exports;
}
const names = loadModule('./hash-translator');
const display = loadModule('./localized-display');
const canonical = loadModule('./canonical-hashes');
const blankHash = canonical.CANONICAL_PERK_HASHES[''];
assert.ok(blankHash, 'Keep the empty canonical key as a regression fixture');
names.updateLocalizedRegistries({ [blankHash]: { name: '(숙련)', icon: '/shader.png' } }, { [blankHash]: '(숙련)' });
for (const input of ['', '   ', '---', '운명인도자', '운명인도자 (숙련)', '命運使者', 'フェイトブリンガー']) {
  assert.equal(names.getPerkHashFromEnglish(input), null, input);
  assert.equal(names.getWeaponHashFromEnglish(input), null, input);
  assert.equal(names.getLocalizedWeaponName(input), input, input);
}
const originalName = '운명인도자 (숙련)';
assert.ok(display.renderLocalizedName('weapon', originalName).endsWith(`>${originalName}</span>`));
const label = {
  textContent: originalName,
  getAttribute: key => ({ 'data-aegis-name-kind': 'weapon', 'data-aegis-name': originalName, 'data-aegis-name-fallback': originalName })[key],
  closest: () => null,
};
display.refreshLocalizedNames({ querySelectorAll: () => [label] });
assert.equal(label.textContent, originalName);
assert.equal(nameRequests.length, 0, 'Localized names must not request the empty-key shader');
const weaponHash = names.getWeaponHashFromEnglish('Fatebringer');
const perkHash = names.getPerkHashFromEnglish('Explosive Payload');
const armorHash = names.getWeaponHashFromEnglish('Celestial Nighthawk');
assert.ok(weaponHash && perkHash && armorHash);
names.updateLocalizedRegistries({
  [perkHash]: { name: '폭발 탄약', icon: '/perk.png' },
  [armorHash]: { name: '천공의 쏙독새', icon: '/armor.png' },
}, { [weaponHash]: '운명인도자' });
assert.equal(names.getLocalizedWeaponName('Fatebringer'), '운명인도자');
assert.equal(names.getLocalizedWeaponName(weaponHash), '운명인도자');
assert.equal(names.getLocalizedPerkName('Explosive Payload'), '폭발 탄약');
assert.equal(names.getLocalizedWeaponName('Celestial Nighthawk'), '천공의 쏙독새');
console.log('Passed: localized hover names survive initial rendering and refresh; English and hash lookups still work.');

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

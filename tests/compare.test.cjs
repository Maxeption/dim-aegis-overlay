const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
function load(name) {
  const file = path.resolve(__dirname, '../src', name + '.ts');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(load, module, module.exports);
  return module.exports;
}
const { getCompareItem } = load('compare-item');
const original = { id: '123', hash: 100, sockets: { active: 'old' } };
const preview = { ...original, sockets: { active: 'new' } };
const bucket = { __reactProps$test: { children: [{ props: { labels: [] } }, { props: { rows: [{ item: preview }] } }] } };
const element = { closest: () => bucket };
assert.equal(getCompareItem(element, original), preview);
assert.equal(original.sockets.active, 'old');
assert.equal(getCompareItem({ closest: () => null }, original), original);
assert.equal(getCompareItem({ closest: () => ({}) }, original), original);
assert.equal(getCompareItem(element, { id: 'other', hash: 100 }).id, 'other');
assert.equal(getCompareItem(element, { id: '123', hash: 200 }).hash, 200);
bucket.__reactProps$test.children[1].props.rows = [{ item: undefined }, { item: original }];
assert.equal(getCompareItem(element, preview), original);
bucket.__reactProps$test.children = [];
assert.equal(getCompareItem(element, original), original);
console.log('PASS: current Compare rows override stale tile props without modifying inventory items; missing rows, mismatched IDs/hashes, and non-Compare tiles retain the original item.');

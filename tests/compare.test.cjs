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
// A retained DOM props handle and tile fiber must not win over the committed tree.
const oldRoot = {}, newRoot = {};
const oldBucket = { return: oldRoot, memoizedProps: { children: [{ props: { rows: [{ item: original }] } }] } };
const newBucket = { return: newRoot, memoizedProps: { children: [{ props: { rows: [{ item: preview }] } }] } };
oldBucket.alternate = newBucket; newBucket.alternate = oldBucket;
oldRoot.alternate = newRoot; newRoot.alternate = oldRoot;
oldRoot.child = oldBucket; newRoot.child = newBucket;
oldRoot.stateNode = newRoot.stateNode = { current: newRoot };
bucket.__reactFiber$test = oldBucket;
bucket.__reactProps$test = oldBucket.memoizedProps;
assert.equal(getCompareItem(element, original), preview);
oldRoot.stateNode.current = oldRoot;
assert.equal(getCompareItem(element, preview), original);
newRoot.child = oldBucket; oldRoot.stateNode.current = newRoot;
assert.equal(getCompareItem(element, preview), original, 'shared child fibers retain the committed item');
console.log('PASS: current Compare rows override stale tile props without modifying inventory items; missing rows, mismatched IDs/hashes, and non-Compare tiles retain the original item.');

// Exercise the production routing boundaries without mounting DIM or scoring weapons.
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function declaration(file, name) {
  return file.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
    .find(node => node.name.getText(file) === name);
}
const content = ts.createSourceFile('content.ts', fs.readFileSync('src/content.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const attributes = new Function('return ' + declaration(content, 'ITEM_ATTRIBUTES').initializer.getText(content))();
const recommendationUpdates = [];
const queued = [];
const route = new Function('comparePerks', 'overviewPerks', 'withoutTileReorders', 'pendingProcessTargets',
  'return ' + compile(declaration(content, 'observer').initializer.arguments[0].getText(content)))(
  { observe: records => recommendationUpdates.push(records) }, { observe: records => recommendationUpdates.push(records) }, records => records, { add: item => queued.push(item) });
const popup = {}, nativePerk = {};
const previewAnnotations = [
  { type: 'attributes', attributeName: 'data-aegis-overview-active-perk-hashes', target: popup },
  { type: 'attributes', attributeName: 'data-aegis-overview-perk-hash', target: nativePerk },
];
route(previewAnnotations.filter(record => attributes.includes(record.attributeName)));
assert.deepEqual(recommendationUpdates, [previewAnnotations, previewAnnotations], 'Preview annotations still reach both recommendation observers');
assert.deepEqual(queued, [], 'Preview-only annotations never enter scoring or rebuild popup details');
route([{ type: 'attributes', attributeName: 'data-aegis-active-perk-hashes', target: popup }]
  .filter(record => attributes.includes(record.attributeName)));
assert.deepEqual(queued, [popup], 'Real equipped-perk updates retain item processing');

const main = ts.createSourceFile('main-world-content.ts', fs.readFileSync('src/main-world-content.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const scan = main.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'scheduleCompareScan');
const overlays = declaration(main, 'OVERLAY_SELECTOR').initializer.getText(main);
class RoutingElement {
  constructor(selectors, parentElement = null) { this.selectors = selectors; this.parentElement = parentElement; }
  matches(selector) { return this.selectors.includes(selector); }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (selector.split(',').some(part => node.matches(part.trim()))) return node;
    return null;
  }
}
const pendingNodes = new Set();
let frames = 0;
const schedule = new Function('Element', 'COMPARE_BUCKET_SELECTOR', 'pendingNodes', 'requestAnimationFrame', 'flushPendingNodes',
  compile(`let scanScheduled = false; const OVERLAY_SELECTOR = ${overlays}; ${scan.getText(main)};`) + 'return scheduleCompareScan;')(
  RoutingElement, 'compare', pendingNodes, () => { frames++; }, () => {});
const compareBucket = new RoutingElement(['compare']);
for (const owner of ['.aegis-compare-panel', '[data-aegis-compare-generated]', '.aegis-masterwork-recommendations', '.aegis-overview-footer', '.aegis-perk-layout-toggle']) {
  const target = new RoutingElement([], new RoutingElement([owner], compareBucket));
  for (const type of ['click', 'change']) schedule({ target, type });
}
assert.equal(frames, 0, 'Aegis-only interactions never schedule a Compare item scan');
const nativeTarget = new RoutingElement(['[data-aegis-compare-state]'], compareBucket);
schedule({ target: nativeTarget, type: 'click' });
schedule({ target: nativeTarget, type: 'change' });
assert.deepEqual([...pendingNodes], [compareBucket], 'Decorated native perk interactions still scan their Compare bucket');
assert.equal(frames, 1, 'Native changes retain frame coalescing');
console.log('PASS: Overview preview versus equipped-perk routing, Aegis-only interaction exclusion, and native Compare scan coalescing.');

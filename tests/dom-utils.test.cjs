const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpile(fs.readFileSync(path.join(__dirname, '../src/dom-utils.ts'), 'utf8'), {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
});

class MockNode {
  constructor(name = 'div') {
    this.name = name;
    this.parentElement = null;
    this.parentNode = null;
    this.isConnected = true;
    this.classList = new Set();
  }
  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.has(selector.slice(1));
    return false;
  }
}

class MockElement extends MockNode {}
class MockHTMLElement extends MockElement {}

function makeElement(className = '', parent = null) {
  const el = new MockHTMLElement();
  if (className) {
    className.split(/\s+/).forEach(c => el.classList.add(c));
  }
  if (parent) {
    el.parentElement = parent;
    el.parentNode = parent;
  }
  return el;
}

const context = {
  exports: {},
  require: (mod) => ({ applyGradeColors: () => {} }),
  HTMLElement: MockHTMLElement,
  Element: MockElement,
  Node: MockNode,
  Set,
  Map,
  Array,
};
vm.runInNewContext(source, context);
const { dimmingClassesChanged, outermostElements, withoutTileReorders } = context.exports;

// Test 1: outermostElements
{
  const root = makeElement('container');
  const child = makeElement('child', root);
  const grandchild = makeElement('grandchild', child);
  const disconnected = makeElement('orphan');
  disconnected.isConnected = false;
  const independent = makeElement('independent');

  // Disconnected element filtered out
  assert.deepEqual(outermostElements([disconnected]), []);

  // When parent, child, grandchild provided, only root is returned
  const nested = outermostElements([child, grandchild, root]);
  assert.equal(nested.length, 1);
  assert.equal(nested[0], root);

  // Independent elements kept
  const mixed = outermostElements([grandchild, independent, root]);
  assert.equal(mixed.length, 2);
  assert.ok(mixed.includes(root));
  assert.ok(mixed.includes(independent));
  assert.ok(!mixed.includes(grandchild));
}

// Test 2: withoutTileReorders
{
  const bucket1 = makeElement('sub-bucket');
  const bucket2 = makeElement('sub-bucket');
  const outsideBucket = makeElement('other-container');

  const tileA = makeElement('item-drag-container', bucket1);
  const tileB = makeElement('item-drag-container', bucket1);
  const tileC = makeElement('item-drag-container', bucket1);

  // Non-childList mutation is kept
  const attrMutation = { type: 'attributes', target: bucket1 };
  assert.equal(withoutTileReorders([attrMutation]).length, 1);

  // Mutation outside sub-bucket is kept
  const outsideMutation = {
    type: 'childList',
    target: outsideBucket,
    addedNodes: [tileA],
    removedNodes: [tileA],
  };
  assert.equal(withoutTileReorders([outsideMutation]).length, 1);

  // Reordering tiles within bucket1 (tileA and tileB removed then re-added to bucket1)
  const reorderMutations = [
    { type: 'childList', target: bucket1, addedNodes: [], removedNodes: [tileA] },
    { type: 'childList', target: bucket1, addedNodes: [], removedNodes: [tileB] },
    { type: 'childList', target: bucket1, addedNodes: [tileB], removedNodes: [] },
    { type: 'childList', target: bucket1, addedNodes: [tileA], removedNodes: [] },
  ];
  assert.deepEqual(withoutTileReorders(reorderMutations), []);

  // Removing an element (dismantling/transfer out) is NOT filtered out
  const removedTile = makeElement('item-drag-container', null);
  removedTile.isConnected = false;
  const removeMutation = [
    { type: 'childList', target: bucket1, addedNodes: [], removedNodes: [removedTile] },
  ];
  assert.equal(withoutTileReorders(removeMutation).length, 1);

  // Adding a new element is NOT filtered out
  const newTile = makeElement('item-drag-container', bucket1);
  const addMutation = [
    { type: 'childList', target: bucket1, addedNodes: [newTile], removedNodes: [] },
  ];
  assert.equal(withoutTileReorders(addMutation).length, 1);

  // Transferring a tile from bucket1 to bucket2 is NOT filtered out
  const transferredTile = makeElement('item-drag-container', bucket2);
  const transferMutations = [
    { type: 'childList', target: bucket1, addedNodes: [], removedNodes: [transferredTile] },
    { type: 'childList', target: bucket2, addedNodes: [transferredTile], removedNodes: [] },
  ];
  assert.equal(withoutTileReorders(transferMutations).length, 2);
}

// Scroll flags never change badge opacity. Real fades in the same observer delivery still count.
{
  const changed = (before, after, isBody = false) => dimmingClassesChanged(before, new Set(after.split(/\s+/).filter(Boolean)), isBody);
  assert.equal(changed(null, 'aegis-scrolling', true), false);
  assert.equal(changed('theme aegis-scrolling', 'theme', true), false);
  assert.equal(changed('theme', 'theme aegis-scrolling', true), false);
  assert.equal(changed('theme aegis-scrolling', 'theme dimmed', true), true);
  assert.equal(changed('theme dimmed', 'theme aegis-scrolling', true), true);
  assert.equal(changed('item', 'item aegis-gold-glow'), false);
  assert.equal(changed('item aegis-gold-glow', 'item dimmed'), true);
  assert.equal(changed('item dimmed', 'item aegis-gold-glow'), true);
  assert.equal(changed('theme', 'theme aegis-scrolling'), true, 'ignore the scroll flag only on body');
  assert.equal(changed(' dimmed   item ', 'item dimmed'), false, 'class ordering and whitespace do not change dimming');
}

console.log('Passed: hierarchy pruning, tile reorder filtering, and scroll/glow class changes without suppressing real fades.');

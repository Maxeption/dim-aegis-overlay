const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpile(fs.readFileSync(path.join(__dirname, '../src/item-queue.ts'), 'utf8'), {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
});

function harness(process) {
  let now = 0;
  const tasks = [], phases = [], batches = [];
  const context = {
    exports: {}, performance: { now: () => now },
    requestAnimationFrame: fn => tasks.push(fn), setTimeout: fn => tasks.push(fn),
    scrollX: 0, scrollY: 0, innerWidth: 800, innerHeight: 600,
  };
  vm.runInNewContext(source, context);
  const queue = context.exports.createItemQueue(item => {
    phases.push('write');
    now += 10;
    process(item);
  }, items => batches.push(Array.from(items)));
  const item = (id, top = 10) => ({
    id, isConnected: true, value: 0,
    getBoundingClientRect() {
      phases.push('read');
      return { top, bottom: top + 50, left: 0, right: 50, width: 50, height: 50 };
    },
  });
  const drain = () => { while (tasks.length) tasks.shift()(); };
  return { queue, item, tasks, phases, batches, drain };
}

{
  const processed = [], h = harness(item => processed.push([item.id, item.value]));
  const offscreen = h.item('offscreen', 2000), visible = h.item('visible');
  const changed = h.item('changed'), removed = h.item('removed');
  [offscreen, visible, changed, removed, visible].forEach(h.queue.add);
  assert.equal(h.tasks.length, 1);
  assert.equal(h.queue.hasWork(), true);
  h.tasks.shift()();
  assert.deepEqual(processed, [['visible', 0]]);
  assert.deepEqual(h.phases, ['read', 'read', 'read', 'read', 'write']);
  changed.value = 42;
  removed.isConnected = false;
  h.drain();
  assert.deepEqual(processed, [['visible', 0], ['changed', 42], ['offscreen', 0]]);
  assert.equal(h.queue.hasWork(), false);
  assert.equal(h.batches.flat().length, 3);
}

{
  const processed = [], h = harness(item => {
    if (item.id === 'failed') throw new Error('Failed item');
    processed.push(item.id);
  });
  h.queue.add(h.item('failed'));
  h.queue.add(h.item('survivor'));
  assert.throws(() => h.tasks.shift()(), /Failed item/);
  h.drain();
  assert.deepEqual(processed, ['survivor']);
  assert.equal(h.queue.hasWork(), false);
}

{
  const processed = [], h = harness(item => processed.push(item.id));
  const old = h.item('obsolete'), current = h.item('latest');
  h.queue.add(old);
  h.queue.clear();
  h.queue.add(current);
  h.drain();
  assert.deepEqual(processed, ['latest']);
  h.queue.add(old);
  h.queue.add(current);
  h.tasks.shift()(); // One item runs; supersede the unfinished slice.
  h.queue.clear();
  h.drain();
  assert.deepEqual(processed, ['latest', 'obsolete']);
  assert.equal(h.queue.hasWork(), false);
}

console.log('Passed: visible items first, yielding, deduplication, current values, cancellation, removed items, batch callbacks, and recovery after a failed item.');

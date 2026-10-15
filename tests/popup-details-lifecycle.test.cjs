const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/content.ts', 'utf8');
const file = ts.createSourceFile('content.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['cancelPopupDetails', 'trackPopupDetails'].map(name => {
  const node = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, name);
  return node.getText(file);
}).join('\n');
const inject = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'injectPopupSummary');
const bindTitle = inject.body.statements.find(node => ts.isIfStatement(node) && node.getText(file).includes('boundPopupTitles'));
assert.ok(bindTitle, 'Production title-click cleanup');
const resizeBinding = file.statements.find(node => ts.isExpressionStatement(node) && node.getText(file).includes("document.addEventListener('aegis-overview-resize'"));
assert.ok(resizeBinding, 'Production resize callback');
let next = 0, resize, hidden = 0;
const timers = new Map();
const cards = [];
const context = vm.createContext({
  setTimeout: callback => { timers.set(++next, callback); return next; },
  clearTimeout: id => timers.delete(id),
  hideTooltip: () => hidden++,
  document: {
    addEventListener: (_type, callback) => { resize = callback; },
    querySelectorAll: () => cards.filter(card => card.connected),
  },
});
const code = `let activeDetailsTimeout = null, repositionDetails = null;
  const boundPopupTitles = new WeakSet();
  ${functions}
  ${resizeBinding.getText(file)}
  function bind(titleEl) { ${bindTitle.getText(file)} }`;
vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
function fixture() {
  const card = { connected: true, remove() { this.connected = false; } };
  const popup = { isConnected: true, contains: candidate => candidate === card && card.connected };
  let attachments = 0;
  cards.push(card);
  const start = () => context.trackPopupDetails(popup, card, () => { attachments++; card.connected = true; });
  start();
  return { card, popup, start, attachments: () => attachments };
}

const current = fixture();
resize();
assert.equal(current.attachments(), 1, 'Visible card still responds to resizing');
const pending = [...timers.values()][0];
let click;
context.bind({ addEventListener: (_type, handler) => { click = handler; } });
click();
assert.equal(hidden, 1);
assert.equal(current.card.connected, true, 'Title navigation retains the card for restoration when Armory closes');
context.cancelPopupDetails();current.card.remove();
assert.equal(timers.size, 0, 'Replacing popup details cancels delayed positioning');
assert.equal(current.popup.isConnected, true, 'Old Overview remains connected during transition');
resize(); pending();
assert.equal(current.card.connected, false, 'Resize and an already queued callback cannot restore dismissed sidebar');
assert.equal(current.attachments(), 1);

const removed = fixture();
const removedCallback = [...timers.values()][0];
removed.card.remove(); resize(); removedCallback();
assert.equal(removed.attachments(), 0, 'Removing a card without clicking the title also prevents reattachment');

const previous = fixture();
const staleCallback = [...timers.values()][0];
const replacement = fixture();
staleCallback(); resize();
assert.equal(previous.attachments(), 0, 'New popup invalidates older positioning callbacks');
assert.equal(replacement.attachments(), 1, 'New popup can still reposition');
replacement.popup.isConnected = false; resize();
assert.equal(replacement.attachments(), 1, 'Detached popups cannot reposition');
console.log('PASS: Card replacement cancels popup positioning; removed cards, stale callbacks, and detached popups cannot restore the sidebar.');

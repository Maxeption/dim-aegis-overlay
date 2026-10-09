const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the actual initializer without loading the inventory content script.
const source = ts.createSourceFile('content.ts', fs.readFileSync(path.join(__dirname, '../src/content.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const initializer = source.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name?.text === 'initAegisExplorer') ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'explorerUi'))
).map(node => node.getText(source)).join('\n');

const elements = [];
const documentListeners = [];
let closeClicks = 0;
function element() {
  const classes = new Set();
  const listeners = new Map();
  const node = {
    isConnected: false,
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle: name => classes.has(name) ? classes.delete(name) : classes.add(name),
    },
    addEventListener: (type, callback) => listeners.set(type, callback),
    dispatch: (type, event) => listeners.get(type)?.(event),
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    remove() { this.isConnected = false; },
    click() {
      dispatch('click', { target: this });
    },
  };
  elements.push(node);
  return node;
}
function dispatch(type, event) {
  let stopped = false;
  event.stopPropagation = () => { stopped = true; };
  for (const listener of documentListeners.filter(listener => listener.type === type && listener.capture)) listener.callback(event);
  event.target.dispatch?.(type, event);
  if (!stopped) for (const listener of documentListeners.filter(listener => listener.type === type && !listener.capture)) listener.callback(event);
}
const menu = element();
const wrapper = element();
const document = {
  body: { appendChild: node => { node.isConnected = true; } },
  createElement() {
    const node = element();
    const close = element();
    const search = element();
    search.addEventListener('keydown', event => event.stopPropagation());
    const click = close.click;
    close.click = () => { closeClicks++; click.call(close); };
    node.querySelector = selector => ({ '.aegis-explorer-close': close, '.aegis-explorer-search-input': search })[selector] || null;
    return node;
  },
  querySelectorAll: selector => selector === '.aegis-combobox-menu' ? [menu] :
    selector === '.aegis-combobox-wrapper' ? [wrapper] :
    elements.filter(node => node.isConnected && ['aegis-fab', 'aegis-explorer-panel'].includes(node.className)),
  addEventListener: (type, callback, capture = false) => documentListeners.push({ type, callback, capture }),
  removeEventListener(type, callback, capture = false) {
    const index = documentListeners.findIndex(listener => listener.type === type && listener.callback === callback && listener.capture === capture);
    if (index >= 0) documentListeners.splice(index, 1);
  },
};
const context = vm.createContext({ document, aegisMode: 'pve', diagnosticLogs: [], t: key => key,
  getExplorerTitle: () => 'Explorer', populateFilters() {}, populateSourceFilter() {}, populateComboboxMenu() {}, renderResults() {},
});
vm.runInContext(ts.transpile(initializer, { target: ts.ScriptTarget.ES2020 }), context);
const init = () => { context.initAegisExplorer(); return vm.runInContext('explorerUi', context); };
let ui = init();
assert.equal(documentListeners.filter(listener => listener.type === 'keydown').length, 1);
assert.equal(documentListeners.find(listener => listener.type === 'keydown').capture, true, 'Escape must reach the listener before focused input handlers');

dispatch('keydown', { key: 'Escape', target: document.body });
assert.equal(closeClicks, 0, 'closed panel does not receive a close click');
ui.fab.click();
dispatch('keydown', { key: 'Enter', target: document.body });
assert.ok(ui.panel.classList.contains('open'), 'other keys leave the panel open');

for (const tab of ['explorer', 'shopping', 'chase']) {
  ui.panel.classList.add(`tab-${tab}`);
  for (const target of [document.body, ui.panel.querySelector('.aegis-explorer-search-input')]) {
    if (!ui.panel.classList.contains('open')) ui.fab.click();
    menu.classList.remove('hidden');
    wrapper.classList.add('active');
    dispatch('keydown', { key: 'Escape', target });
    assert.ok(!ui.panel.classList.contains('open'), `${tab} closes with Escape, including focused search`);
    assert.ok(menu.classList.contains('hidden'), 'existing close click also dismisses combobox menus');
    assert.ok(!wrapper.classList.contains('active'));
    const count = closeClicks;
    dispatch('keydown', { key: 'Escape', target });
    assert.equal(closeClicks, count, 'repeated Escape while closed is inert');
  }
  ui.panel.classList.remove(`tab-${tab}`);
}

assert.equal(init(), ui, 'connected Explorer initialization is idempotent');
for (let cycle = 0; cycle < 3; cycle++) {
  const oldUi = ui;
  oldUi.panel.remove();
  ui = init();
  assert.notEqual(ui, oldUi);
  assert.equal(documentListeners.filter(listener => listener.type === 'keydown').length, 1, 'replacement removes the old Escape listener');
  assert.equal(documentListeners.filter(listener => listener.type === 'click').length, 1, 'replacement retains existing click cleanup');
  oldUi.panel.classList.add('open');
  ui.fab.click();
  const count = closeClicks;
  dispatch('keydown', { key: 'Escape', target: ui.panel.querySelector('.aegis-explorer-search-input') });
  assert.equal(closeClicks, count + 1, 'only the current panel receives a close click');
  assert.ok(!ui.panel.classList.contains('open'));
  assert.ok(oldUi.panel.classList.contains('open'), 'stale panel is no longer handled');
}
console.log('Passed: Explorer Escape dismissal, focused search, tabs, closed/reopened panels, and listener cleanup.');

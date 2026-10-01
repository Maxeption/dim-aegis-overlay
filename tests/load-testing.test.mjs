import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getTestingExtensions, loadTesting } from '../scripts/load-testing.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-launcher-'));
const nativeWebSocket = globalThis.WebSocket;
try {
  const ids = { aegis: 'dim-aegis-overlay@maxeption.github.io', dimsum: 'dimsum@daphinicus.local' };
  for (const [key, id] of Object.entries(ids)) {
    fs.mkdirSync(path.join(root, key));
    fs.writeFileSync(path.join(root, key, 'manifest.json'), JSON.stringify({
      name: key, version: '1.0', browser_specific_settings: { gecko: { id } },
    }));
  }
  const config = { extensionDirectory: path.join(root, 'aegis'), launcher: {
    dimsumDirectory: path.join(root, 'dimsum'), profileDirectory: root, port: 47195,
  } };
  let calls, active;
  globalThis.WebSocket = class extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(raw) {
      const request = JSON.parse(raw);
      calls.push(request);
      let result = {};
      if (request.method === 'session.new') result = { capabilities: { 'moz:profile': root } };
      if (request.method === 'webExtension.install') result = { extension: ids[path.basename(request.params.extensionData.path)] };
      if (request.method === 'browsingContext.getTree') result = { contexts: [
        { context: 'dim', url: 'https://app.destinyitemmanager.com/' },
        { context: 'other', url: 'https://example.com/' },
      ] };
      if (request.method === 'script.evaluate') result = { result: { type: 'string', value: JSON.stringify(active) } };
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: request.id, type: 'success', result }) })));
    }
    close() { this.dispatchEvent(new Event('close')); }
  };
  for (const selection of ['aegis', 'dimsum', 'both']) {
    calls = [];
    const expected = selection === 'both' ? ['aegis', 'dimsum'] : [selection];
    active = Object.fromEntries(expected.map(key => [key, true]));
    const result = await loadTesting(config, selection);
    assert.deepEqual(result.extensions.map(extension => extension.key), expected);
    assert.deepEqual(calls.filter(call => call.method === 'webExtension.install').map(call => path.basename(call.params.extensionData.path)), expected);
    assert.deepEqual(calls.filter(call => call.method === 'browsingContext.reload').map(call => call.params.context), ['dim']);
    assert.deepEqual(result.warnings, [], 'Unselected extensions do not produce activation warnings');
    assert.equal(calls.filter(call => call.method === 'session.end').length, 1);
    assert.ok(!calls.some(call => call.method.includes('uninstall')));
  }
  const noAegis = { ...config, extensionDirectory: path.join(root, 'missing') };
  assert.equal(getTestingExtensions(noAegis, 'dimsum').length, 1, 'DIMSUM does not depend on Aegis files');
  const noDimsum = { ...config, launcher: { ...config.launcher, dimsumDirectory: undefined } };
  assert.equal(getTestingExtensions(noDimsum, 'aegis').length, 1, 'Aegis does not depend on DIMSUM files');
  assert.throws(() => getTestingExtensions(noDimsum, 'both'), /No testing directory/);
  assert.throws(() => getTestingExtensions(config, 'unknown'), /Choose/);
  fs.writeFileSync(path.join(root, 'dimsum', 'manifest.json'), '{}');
  assert.throws(() => getTestingExtensions(config, 'dimsum'), /not the dimsum/);
  assert.equal(getTestingExtensions(config, 'aegis').length, 1);
  console.log('PASS: each shortcut reloads only its selection, refreshes DIM once, preserves other tabs, and checks only selected extensions.');
} finally {
  globalThis.WebSocket = nativeWebSocket;
  const relative = path.relative(os.tmpdir(), root);
  if (relative.startsWith('aegis-launcher-') && !relative.includes(path.sep)) fs.rmSync(root, { recursive: true, force: true });
}

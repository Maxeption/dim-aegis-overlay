import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function connect(port, timeout = 3000) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local debugging port.');
  const socket = new WebSocket(`ws://127.0.0.1:${port}/session`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Zen debugging connection timed out.')); }, timeout);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Zen is not listening on the configured local debugging port.')); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.type === 'error') request.reject(new Error(`${message.error}: ${message.message}`));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Zen closed the debugging connection.'));
    }
    pending.clear();
  });
  return {
    command(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, 30000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

export function getTestingExtensions(config, selection = config.launcher.dimsumDirectory ? 'both' : 'aegis') {
  selection = selection.toLowerCase();
  if (!['aegis', 'dimsum', 'both'].includes(selection)) throw new Error('Choose aegis, dimsum, or both.');
  const targets = [
    { key: 'aegis', directory: config.extensionDirectory, extensionId: 'dim-aegis-overlay@maxeption.github.io' },
    { key: 'dimsum', directory: config.launcher.dimsumDirectory, extensionId: 'dimsum@daphinicus.local' },
  ];
  return targets.filter(target => selection === 'both' || selection === target.key).map(target => {
    if (!target.directory) throw new Error(`No testing directory configured for ${target.key}.`);
    const directory = fs.realpathSync(target.directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    if (manifest.browser_specific_settings?.gecko?.id !== target.extensionId) {
      throw new Error(`The configured folder is not the ${target.key} testing extension.`);
    }
    return { ...target, directory, name: manifest.name, version: manifest.version };
  });
}

export async function loadTesting(config, selection) {
  const extensions = getTestingExtensions(config, selection);
  const profile = fs.realpathSync(config.launcher.profileDirectory);
  const client = await connect(config.launcher.port);
  let sessionCreated = false;
  try {
    const session = await client.command('session.new', { capabilities: { alwaysMatch: { acceptInsecureCerts: false } } });
    sessionCreated = true;
    const actualProfile = session.capabilities['moz:profile'];
    if (!actualProfile || fs.realpathSync(actualProfile).toLowerCase() !== profile.toLowerCase()) {
      throw new Error('The debugging connection belongs to a different Zen profile; nothing was installed.');
    }
    for (const extension of extensions) {
      const result = await client.command('webExtension.install', {
        extensionData: { type: 'path', path: extension.directory }, 'moz:permanent': false,
      });
      if (result.extension !== extension.extensionId) throw new Error('Zen returned an unexpected extension ID.');
    }
    let refreshedTabs = 0;
    let foundDim = false;
    let openedDim = false;
    const warnings = [];
    const dimContexts = [];
    // Refresh only DIM, so its previous injected scripts/DOM cannot survive a reload.
    const { contexts } = await client.command('browsingContext.getTree', { maxDepth: 0 });
    for (const context of contexts) {
      let url;
      try { url = new URL(context.url); } catch { continue; }
      if (url.protocol !== 'https:' || !['app.destinyitemmanager.com', 'beta.destinyitemmanager.com'].includes(url.hostname)) continue;
      foundDim = true;
      dimContexts.push(context.context);
      try {
        await client.command('browsingContext.reload', { context: context.context, wait: 'none' });
        refreshedTabs++;
      } catch { warnings.push('A DIM tab could not refresh automatically. Refresh DIM manually.'); }
    }
    if (!foundDim) {
      try {
        // Reuse a lone startup tab; leave any other open pages alone.
        const blank = contexts.length === 1 && ['about:blank', 'about:newtab', 'about:home'].includes(contexts[0].url)
          ? contexts[0] : null;
        const target = blank || await client.command('browsingContext.create', { type: 'tab' });
        await client.command('browsingContext.navigate', {
          context: target.context, url: 'https://app.destinyitemmanager.com/', wait: 'none',
        });
        openedDim = true;
        dimContexts.push(target.context);
      } catch { warnings.push('DIM could not open automatically. Open DIM manually; the selected extensions are loaded.'); }
    }
    // An installed MV3 addon may still be waiting for the user's site-access grant.
    // Check page markers instead of reporting installation as proof of activation.
    const activation = [];
    for (const context of dimContexts) {
      let state = null;
      const deadline = Date.now() + 8000;
      do {
        try {
          const probe = await client.command('script.evaluate', {
            target: { context }, awaitPromise: false,
            expression: 'JSON.stringify({ready:document.readyState,aegis:!!document.getElementById("aegis-global-perk-registry")&&!!document.querySelector(".aegis-explorer-panel"),dimsum:document.documentElement.hasAttribute("data-dimsum-active")})',
          });
          if (probe.result?.type === 'string') state = JSON.parse(probe.result.value);
          if (extensions.every(extension => state?.[extension.key])) break;
        } catch { /* Navigation may still be replacing the document. */ }
        await new Promise(resolve => setTimeout(resolve, 500));
      } while (Date.now() < deadline);
      activation.push(state);
      if (extensions.some(extension => extension.key === 'aegis') && !state?.aegis) warnings.push('Aegis is installed, but its DIM scripts were not detected. If its button has a green dot, open Manage Extension > Permissions and data, enable access to DIM, then run this shortcut again.');
      if (extensions.some(extension => extension.key === 'dimsum') && !state?.dimsum) warnings.push('DIMSUM is installed, but its DIM script was not detected. Check its site access in Zen, then run this shortcut again.');
    }
    return { loadedAt: new Date().toISOString(), ...extensions[0], extensions, refreshedTabs, openedDim, activation, warnings: [...new Set(warnings)] };
  } finally {
    // End only our automation session, leaving the browser and temporary addon running.
    if (sessionCreated) await client.command('session.end').catch(() => {});
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const result = await loadTesting(config, process.argv[3]);
    fs.writeFileSync(path.join(path.dirname(config.extensionDirectory), 'last-load.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(`Loaded ${result.extensions.map(extension => `${extension.name} ${extension.version}`).join(' and ')}; ${result.openedDim ? 'opened DIM' : `refreshed ${result.refreshedTabs} DIM tab(s)`}.`);
    for (const warning of result.warnings) console.log(warning);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

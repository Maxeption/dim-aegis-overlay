import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of ['compare-browser.cjs', 'footer-browser.cjs', 'popup-layer-browser.cjs', 'version-pill-browser.cjs', 'perk-tooltip-lifecycle-browser.cjs', 'perk-tooltip-positioning.test.cjs']) {
  const result = spawnSync(process.execPath, [`tests/${file}`], {
    cwd: root, stdio: 'inherit', windowsHide: true, timeout: 60000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

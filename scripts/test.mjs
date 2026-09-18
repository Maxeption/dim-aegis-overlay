import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = fs.readdirSync(new URL('../tests/', import.meta.url))
  .filter(file => /\.test\.[cm]js$/.test(file) && file !== 'perk-tooltip-positioning.test.cjs')
  .sort().map(file => `tests/${file}`);
if (!process.argv.includes('--unit')) files.push('scripts/test-browser.mjs');
for (const file of files) {
  const result = spawnSync(process.execPath, [file], {
    cwd: root, stdio: 'inherit', windowsHide: true, timeout: 120000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

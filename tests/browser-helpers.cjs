const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium, firefox } = require('playwright');

async function launchBrowser() {
  const engine = process.env.BROWSER_ENGINE || 'chromium';
  assert.ok(['chromium', 'firefox'].includes(engine), 'BROWSER_ENGINE must be chromium or firefox');
  return (engine === 'firefox' ? firefox : chromium).launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
    ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}),
  });
}

async function bundle(entry, name) {
  const { build } = await import('vite');
  const result = await build({ configFile: false, publicDir: false, logLevel: 'error',
    resolve: { extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'] },
    build: { write: false, lib: { entry: path.resolve(entry), name, formats: ['iife'] } } });
  return (Array.isArray(result) ? result[0] : result).output[0].code;
}

async function runFixture(html, options = {}) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage(options);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent(html);
    await page.waitForFunction(() => /^(PASS|FAIL):/.test(document.querySelector('#result')?.textContent || ''), null, { timeout: 20000 });
    const result = await page.locator('#result').textContent();
    assert.deepEqual(errors, [], 'Browser fixture errors');
    assert.ok(result.startsWith('PASS:'), result);
    console.log(result);
  } finally {
    await browser.close();
  }
}

module.exports = { launchBrowser, bundle, runFixture };

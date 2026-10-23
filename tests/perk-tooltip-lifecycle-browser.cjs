const assert = require('node:assert/strict');
const { bundle, launchBrowser } = require('./browser-helpers.cjs');

(async () => {
  const script = await bundle('src/perk-rating-tooltips.ts', 'PerkTooltipFixture');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent(`<div data-aegis-compare-slot><button id="owner" data-aegis-compare-state="missing"
      style="position:fixed;left:300px;top:300px;width:30px;height:30px">Perk</button></div>
      <div id="tip" data-popper-placement="right" style="position:fixed;left:340px;top:300px;width:300px">
        <div><h2>Test perk</h2><h3><div><span>Trait</span></div></h3></div><p id="native">Native description</p>
      </div>
      <script id="aegis-perk-analysis-data" type="application/json">{"enabled":true,"byHash":{"42":{"tier":"S","rank":1,"tab":"Perks","analysis":"Rating analysis"}}}</script>`);
    await page.addScriptTag({ content: script });
    await page.waitForTimeout(100); // Let the initial viewport resize settle before hovering.
    await page.evaluate(() => {
      const owner = document.querySelector('#owner'), tip = document.querySelector('#tip');
      const control = { memoizedProps: { open: true, triggerRef: { current: owner },
        tooltip: { props: { def: { hash: 42, plug: {} } } } } };
      owner.__reactFiber$fixture = { return: control };
      tip.__reactFiber$fixture = { return: control };
      window.rewrites = 0;
      let hostCopies = new Set();
      // A host/another extension rebuilds the native card while preserving its
      // contents. Bound the reproduction so the old bug cannot crash this test.
      const host = new MutationObserver(records => {
        if (!records.some(record => [...record.addedNodes].some(node =>
          node instanceof Element && node.matches('.aegis-compare-rating-panel') && !hostCopies.has(node)))) return;
        if (++window.rewrites > 12) { host.disconnect(); return; }
        tip.innerHTML = tip.innerHTML;
        hostCopies = new Set(tip.querySelectorAll('.aegis-compare-rating-panel'));
      });
      host.observe(tip, { childList: true });
      window.stopHost = () => host.disconnect();
      PerkTooltipFixture.initPerkRatingTooltips();
      owner.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    });
    await page.waitForTimeout(250);
    const rewritten = await page.evaluate(() => ({ rewrites: window.rewrites,
      panels: document.querySelectorAll('.aegis-compare-rating-panel').length,
      statuses: document.querySelectorAll('.aegis-perk-tooltip-status').length }));
    assert.equal(rewritten.panels, 1, `Card replacement must not accumulate ratings: ${JSON.stringify(rewritten)}`);
    assert.equal(rewritten.statuses, 1, 'Card replacement must not accumulate status labels');
    assert.ok(rewritten.rewrites <= 2, 'Owned writes reach a fixed point after host replacement');
    await page.evaluate(() => {
      window.stopHost();
      window.mutations = 0;
      const bounded = new MutationObserver(records => {
        window.mutations += records.length;
        if (window.mutations > 100) {
          bounded.disconnect();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        }
      });
      bounded.observe(document.querySelector('#tip'), { childList: true, subtree: true });
      window.stopBounded = () => bounded.disconnect();
      PerkTooltipFixture.initPerkRatingTooltips();
      document.querySelector('#owner').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.aegis-compare-rating-panel').count(), 1, 'Repeated initialization has one owner');
    assert.ok(await page.evaluate(() => window.mutations < 20), 'Repeated initialization does not create an observer loop');
    assert.equal(await page.locator('#native').textContent(), 'Native description');
    await page.evaluate(() => {
      window.stopBounded();
      const node = document.querySelector('#aegis-perk-analysis-data');
      const data = JSON.parse(node.textContent);
      data.byHash[42].analysis = 'Changed analysis';
      node.textContent = JSON.stringify(data);
      document.dispatchEvent(new Event('aegis-perk-analysis-updated'));
    });
    await page.waitForFunction(() => document.querySelector('.aegis-compare-rating-panel p')?.textContent === 'Changed analysis');
    assert.equal(await page.locator('.aegis-compare-rating-panel').count(), 1);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    assert.equal(await page.locator('.aegis-compare-rating-panel, .aegis-perk-tooltip-status').count(), 0, 'Cleanup removes adopted markup');
    assert.deepEqual(errors, []);
    console.log('PASS: tooltip content replacement, repeated initialization, bounded mutations, data updates, and cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

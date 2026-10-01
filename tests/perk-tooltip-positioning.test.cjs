// Geometry checks against checked-in DIM PressTip CSS, standard before beta.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, bundle } = require('./browser-helpers.cjs');
const audit = process.env.DIM_AUDIT_ROOT || path.join(__dirname, 'fixtures/dim');
(async () => {
  const script = await bundle('src/perk-rating-tooltips.ts', 'PerkTooltipFixture');
  const browser = await launchBrowser();
  try {
    for (const channel of ['standard', 'beta']) {
      const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
      page.setDefaultTimeout(5000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => route.abort());
      await page.setContent('<html style="--header-height:40px"><body></body></html>');
      for (const file of fs.readdirSync(audit).filter(n => n.startsWith(channel + '-') && n.endsWith('.css'))) {
        await page.addStyleTag({ content: fs.readFileSync(path.join(audit, file), 'utf8') });
      }
      await page.addStyleTag({ content: fs.readFileSync('public/styles.css', 'utf8') });
      await page.addScriptTag({ content: `${script};window.exports=PerkTooltipFixture;` });
      await page.waitForTimeout(100); // Settle the initial viewport resize before observing first paint.
      await page.evaluate(channel => {
        const cls = (name, release) => channel === 'standard' ? release : `PressTip-m_${name}-${release}`;
        document.body.innerHTML = `<div id="owner" style="position:fixed;left:120px;top:395px;width:42px;height:42px"></div>
          <div id="tip" class="${cls('tooltip','SHtI4cRc')}" data-popper-placement="right" style="left:170px;top:340px;width:306px">
            <div><h2 style="margin:0;height:30px">Circle of Life</h2></div><div id="insight" style="height:100px">Community Insight</div><div id="arrow" class="${cls('arrow','qrCkcWym')}"></div>
          </div><script id="aegis-perk-analysis-data" type="application/json">{"enabled":true,"byHash":{"42":{"tier":"E","rank":127,"tab":"Perks","analysis":"A rating that expands the native tooltip after DIM has positioned its arrow."}}}</script>`;
        const owner = document.querySelector('#owner'), tip = document.querySelector('#tip'), arrow = document.querySelector('#arrow');
        owner.className = cls('control','JcXmq7TF');
        // The deployed Control props contract; no fabricated beta selectors.
        const control = { memoizedProps: { open:true, triggerRef:{ current:owner }, tooltip:{ props:{ plug:{ plugDef:{ hash:42,plug:{} } } } } } };
        owner.__reactFiber$fixture = { return:control };
        tip.__reactFiber$fixture = { return:control };
        arrow.style.top = `${owner.getBoundingClientRect().top + 21 - tip.getBoundingClientRect().top - tip.clientTop - 8}px`;
        window.nativeArrowTop = arrow.style.top;
        window.exports.initPerkRatingTooltips();
        owner.dispatchEvent(new PointerEvent('pointerover', { bubbles:true, pointerType:'mouse' }));
        window.hiddenBeforePositioning = getComputedStyle(tip).visibility === 'hidden';
        window.firstVisibleFrame = new Promise(resolve => {
          function sample() {
            if (getComputedStyle(tip).visibility === 'hidden') { requestAnimationFrame(sample); return; }
            resolve({ rated: !!tip.querySelector('.aegis-compare-rating-panel'), left: tip.style.left, top: tip.style.top });
          }
          requestAnimationFrame(sample);
        });
      }, channel);
      assert.equal(await page.evaluate(() => window.hiddenBeforePositioning), true, 'native position is hidden before expanded measurement');
      const firstFrame = await page.evaluate(() => window.firstVisibleFrame);
      assert.ok(firstFrame.rated && (firstFrame.left !== '170px' || firstFrame.top !== '340px'), 'first visible frame includes rating and expanded positioning');
      await page.waitForTimeout(100); // Let the initial viewport resize settle before hover.
      await page.locator('#owner').dispatchEvent('pointerover', { pointerType:'mouse' });
      const aligned = () => page.waitForFunction(() => {
        const a = document.querySelector('#arrow').getBoundingClientRect(), t = document.querySelector('#owner').getBoundingClientRect();
        const tip = document.querySelector('#tip'), r=tip.getBoundingClientRect();
        const vertical = ['top','bottom'].includes(tip.dataset.popperPlacement);
        const separate=r.bottom<=t.top-7.5 || r.top>=t.bottom+7.5 || r.right<=t.left-7.5 || r.left>=t.right+7.5;
        const error=vertical ? a.left+a.width/2-t.left-t.width/2 : a.top+a.height/2-t.top-t.height/2;
        return separate && Math.abs(error)<.3 && getComputedStyle(document.querySelector('#arrow')).visibility !== 'hidden';
      });
      await page.waitForSelector('.aegis-compare-rating-panel');
      await aligned();
      await page.evaluate(() => {
        const node = document.querySelector('#aegis-perk-analysis-data');
        const data = JSON.parse(node.textContent);
        data.labels = { rating: 'Valoración PvE', tier: 'Nivel {tier}', perks: 'Ventajas', origins: 'Rasgos de origen' };
        node.textContent = JSON.stringify(data);
        document.dispatchEvent(new Event('aegis-perk-analysis-updated'));
      });
      await page.waitForFunction(() => document.querySelector('.aegis-compare-rating-tier')?.textContent === 'Nivel E');
      assert.equal(await page.locator('.aegis-compare-rating-panel').getAttribute('aria-label'), 'Valoración PvE');
      assert.match(await page.locator('.aegis-compare-rating-heading').textContent(), /Ventajas/);
      assert.match(await page.locator('.aegis-compare-rating-panel p').textContent(), /A rating that expands/, 'source analysis remains unchanged');
      await aligned();
      await page.locator('#insight').evaluate(n => n.style.height = '170px');
      await aligned();
      await page.waitForTimeout(100); await aligned();
      assert.ok(await page.locator('#tip').evaluate(n => n.getBoundingClientRect().bottom <= 490.5), 'expanded card remains inside viewport');
      await page.evaluate(() => { document.querySelector('#arrow').style.top = '20px'; document.querySelector('#tip').style.top = '320px'; });
      await aligned(); // A later native positioning pass cannot leave a stale arrow.
      await page.evaluate(() => { document.querySelector('#owner').style.top = '410px'; });
      await aligned();
      // The old vertical clamp moved bottom/top cards directly over their owner.
      for (const [left,top] of [[300,120],[300,340],[5,240],[648,240]]) {
        await page.locator('#owner').evaluate((n,p)=>{n.style.left=p.left+'px';n.style.top=p.top+'px';}, {left,top});
        await aligned();
      }
      await page.evaluate(() => { document.querySelector('#insight').style.height = '650px'; document.querySelector('#owner').style.top = '5px'; });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#arrow')).visibility === 'hidden');
      await page.evaluate(() => { document.querySelector('#insight').style.height = '100px'; document.querySelector('#owner').style.top = '410px'; });
      await aligned();
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape' })));
      assert.equal(await page.locator('.aegis-compare-rating-panel').count(), 0);
      assert.equal(await page.locator('#tip').evaluate(n => n.style.translate), '', 'viewport adjustment is restored');
      assert.equal(await page.locator('#arrow').evaluate(n => n.style.top), '20px', 'restore the latest native arrow offset');
      // All native arrow orientations, corner impossibility, and later DIM writes.
      for (const side of ['right','left','top','bottom']) {
        await page.evaluate(side => {
          const tip = document.querySelector('#tip'), owner = document.querySelector('#owner'), arrow = document.querySelector('#arrow');
          owner.style.cssText = 'position:fixed;left:300px;top:240px;width:42px;height:42px';
          const x = side==='left' ? 80 : side==='right' ? 350 : 240;
          const y = side==='top' ? 70 : side==='bottom' ? 290 : 180;
          tip.dataset.popperPlacement=side; tip.style.cssText=`position:fixed;left:${x}px;top:${y}px;width:210px;height:160px`;
          // DIM's previous placement can leave BOTH inline offsets set. On a
          // side flip these conflict with CSS top/bottom or left/right and
          // stretch the empty triangle unless the old static-axis value clears.
          arrow.style.cssText = 'left:20px;top:63.5px';
          window.alignment = window.exports.alignPerkTooltipArrow(tip, owner); alignment.update();
        }, side);
        const result = await page.evaluate(side => {
          const a=document.querySelector('#arrow').getBoundingClientRect(), t=document.querySelector('#owner').getBoundingClientRect();
          return { error:['top','bottom'].includes(side) ? a.left+a.width/2-t.left-t.width/2 : a.top+a.height/2-t.top-t.height/2,
            visible:getComputedStyle(document.querySelector('#arrow')).visibility };
        }, side);
        assert.ok(Math.abs(result.error) < .3, `${channel} ${side} points at its owner`);
        assert.notEqual(result.visible, 'hidden');
        await page.evaluate(() => { document.querySelector('#arrow').style.top='37px'; alignment.destroy(); });
        assert.equal(await page.locator('#arrow').evaluate(n => n.style.top), '37px', 'cleanup does not undo a newer DIM write');
      }
      // Status headers remain independent of the optional rating panel.
      await page.evaluate(() => {
        document.querySelector('#owner').dispatchEvent(new PointerEvent('pointerout', { bubbles:true }));
        document.body.innerHTML = '<div data-aegis-compare-slot="mag"><div id="status-owner" data-aegis-compare-state="selectable" style="position:fixed;left:200px;top:200px;width:32px;height:32px"></div></div><div id="status-tip" data-popper-placement="right" style="position:fixed;left:250px;top:200px;width:200px"><div><h2>Example</h2><h3><div><span id="trait">Magazine</span></div></h3></div><p>Native description</p></div><script id="aegis-perk-analysis-data" type="application/json">{"enabled":false,"byHash":{}}</script>';
        const owner=document.querySelector('#status-owner'),tip=document.querySelector('#status-tip');
        const control={memoizedProps:{open:true,triggerRef:{current:owner},tooltip:{props:{plug:{plugDef:{hash:42,plug:{}}}}}}};
        owner.__reactFiber$status={return:control};tip.__reactFiber$status={return:control};
        document.dispatchEvent(new Event('aegis-perk-analysis-updated'));
        owner.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
      });
      await page.waitForSelector('.aegis-perk-tooltip-status');
      assert.equal(await page.locator('#trait').textContent(), 'MagazineSelectable');
      assert.equal(await page.locator('.aegis-compare-rating-panel').count(), 0);
      await page.evaluate(() => {
        const owner=document.querySelector('#status-owner');
        owner.parentElement.setAttribute('data-aegis-covered-by-armory','');
        document.dispatchEvent(new Event('aegis-popup-layer-changed'));
      });
      assert.equal(await page.locator('.aegis-perk-tooltip-status').count(),0,'Covered Overview removes tooltip decoration even while the owner remains mounted');
      await page.evaluate(() => {
        const owner=document.querySelector('#status-owner');
        owner.parentElement.removeAttribute('data-aegis-covered-by-armory');
        owner.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
      });
      await page.waitForSelector('.aegis-perk-tooltip-status');
      assert.equal(await page.locator('.aegis-perk-tooltip-status').evaluate(n=>getComputedStyle(n,'::before').color), 'rgb(143, 143, 148)');
      for(const [state,selected,label,color] of [['active',true,'Selected','rgb(46, 204, 113)'],['missing',false,'Missing','rgb(255, 154, 168)'],['selectable',false,'Selectable','rgb(128, 191, 255)']]) {
        await page.evaluate(({state,selected})=>{const owner=document.querySelector('#status-owner');owner.dataset.aegisCompareState=state;owner.toggleAttribute('data-aegis-compare-selected',selected);},{state,selected});
        await page.waitForFunction(label=>document.querySelector('.aegis-perk-tooltip-status')?.textContent===label,label);
        assert.equal(await page.locator('.aegis-perk-tooltip-status').evaluate(n=>getComputedStyle(n).color),color);
      }
      for(const selected of [false,true]) {
        await page.evaluate(selected=>{const owner=document.querySelector('#status-owner');owner.dataset.aegisCompareState='other';owner.toggleAttribute('data-aegis-compare-selected',selected);owner.dispatchEvent(new PointerEvent('pointerout',{bubbles:true}));owner.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));},selected);
        await page.waitForFunction(()=>!document.querySelector('.aegis-perk-tooltip-status'));
        assert.equal(await page.locator('#trait').textContent(),'Magazine','Gray perks have no status, including selected perks');
      }
      await page.evaluate(()=>document.querySelector('#status-owner').removeAttribute('data-aegis-compare-state'));
      await page.waitForFunction(()=>!document.querySelector('.aegis-perk-tooltip-status'));
      assert.equal(await page.locator('#trait').textContent(), 'Magazine', 'Disabling recommendations restores the native header');
      await page.evaluate(()=>{const owner=document.querySelector('#status-owner');owner.dispatchEvent(new PointerEvent('pointerout',{bubbles:true}));owner.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));});
      assert.equal(await page.locator('.aegis-perk-tooltip-status').count(),0,'Ordinary DIM perks have no recommendation status');
      assert.deepEqual(errors, []);
      console.log(`PASS: ${channel} native CSS; nonoverlapping rated cards, late content, native reposition, moving owner, edges, oversized card, all four arrows and cleanup.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });

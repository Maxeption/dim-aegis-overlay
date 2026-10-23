const fs = require('node:fs');
const ts = require('typescript');
const { runFixture } = require('./browser-helpers.cjs');
(async () => {
  const css = fs.readFileSync('public/styles.css', 'utf8');
  const sizing = ts.transpileModule(fs.readFileSync('src/footer-sizing.ts','utf8').replace(/export /g,''), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const html = `<!doctype html><meta charset="utf-8"><style>
    .inventory { display:flex; flex-wrap:wrap; gap:8px; width:600px }
    .item { --item-size:60px; position:relative; width:60px; height:76px;
      contain:strict; box-sizing:border-box; }
    .icon { width:60px; height:60px }
    ${css}
  </style><div class="inventory"></div><pre id="result"></pre><script>
    ${sizing}
    const results=[];
    function check(ok,label) { if(!ok) throw new Error(label); results.push(label); }
    function near(a,b,label) { check(Math.abs(a-b)<0.15,label+': '+a+' vs '+b); }
    async function run() { try {
      const inventory=document.querySelector('.inventory');
      for (let i=0;i<300;i++) {
        inventory.insertAdjacentHTML('beforeend','<div class="item-drag-container"><div class="item"><div class="icon"></div><div class="aegis-badge aegis-style-footer"><span class="aegis-grade-text">BS+</span></div></div></div>');
      }
      const tile=inventory.querySelector('.item'), badge=tile.querySelector('.aegis-badge');
      for (const gradeDisplay of ['equipped','dual','potential','equipped']) {
       document.documentElement.style.setProperty('--aegis-split-footer-height',gradeDisplay==='dual'?'25px':'16px');
       for (const mode of ['grade','split','color','split-color']) {
        badge.classList.toggle('aegis-badge-split',mode.includes('split'));
        badge.classList.toggle('aegis-color-only',mode.includes('color'));
        badge.innerHTML=mode.includes('split')
          ? '<span class="aegis-split-half"><span class="aegis-grade-text">BS+ / AS+</span></span><span class="aegis-split-half"><span class="aegis-grade-text">AS+ / BS+</span></span>'
          : '<span class="aegis-grade-text">BS+</span>';
        for (const scale of [0.7,1,1.3]) {
          document.documentElement.style.setProperty('--aegis-badge-scale',scale);
          // Exercise growing and shrinking without rebuilding any badges.
          for (const size of [1,1.5,0.7,1]) {
            document.documentElement.style.setProperty('--aegis-badge-size',size);
            const label=gradeDisplay+' '+mode+' text='+scale+' size='+size;
            const height=(mode.includes('color')?3:mode.includes('split')&&gradeDisplay==='dual'?25:16)*size;
            const t=tile.getBoundingClientRect(), b=badge.getBoundingClientRect();
            near(t.height,76+height,label+' reserved height');
            near(b.height,height,label+' badge height');
            near(b.width,t.width,label+' strip width');
            near(b.left,t.left,label+' left edge');
            near(b.bottom,t.bottom,label+' bottom edge');
            near(b.top,t.top+76,label+' clears native label');
            check(getComputedStyle(tile).contain==='strict',label+' native containment');
            check(getComputedStyle(badge).position==='absolute',label+' out of flow');
            near(tile.querySelector('.icon').getBoundingClientRect().height,60,label+' native icon unchanged');
          }
        }
      }
      }
      const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      badge.className='aegis-badge aegis-style-footer aegis-badge-split';
      badge.innerHTML='<div class="aegis-split-inner">'+['left','right'].map(side=>'<span class="aegis-split-half aegis-split-'+side+' aegis-split-transition"><span class="aegis-grade-text">SF➔S+</span></span>').join('')+'</div><span class="aegis-badge-upgrade-arrow">▲</span>';
      updateFooterSize(badge,true);
      for (const scale of [0.7,1,1.3]) for (const size of [0.7,1,1.5,1]) for (const upgrade of ['none','circle','triangle','chevron']) {
        document.documentElement.style.setProperty('--aegis-badge-scale',scale);
        document.documentElement.style.setProperty('--aegis-badge-size',size);
        const arrow=badge.querySelector('.aegis-badge-upgrade-arrow');
        arrow.className='aegis-badge-upgrade-arrow aegis-upgrade-'+upgrade;
        arrow.style.setProperty('display',upgrade==='none'?'none':'inline-flex','important');
        await frame();
        const label='adaptive dual text='+scale+' size='+size+' upgrade='+upgrade;
        for (const half of badge.querySelectorAll('.aegis-split-half')) {
          const range=document.createRange();range.selectNodeContents(half.querySelector('.aegis-grade-text'));
          const text=range.getBoundingClientRect(),bounds=half.getBoundingClientRect();
          check(text.top>=bounds.top-.2&&text.bottom<=bounds.bottom+.2&&text.left>=bounds.left-.2&&text.right<=bounds.right+.2,label+' complete grade remains visible: '+JSON.stringify({text:text.toJSON(),half:bounds.toJSON()}));
        }
        near(tile.getBoundingClientRect().height,76+badge.getBoundingClientRect().height,label+' reserves actual height');
        near(badge.getBoundingClientRect().top,tile.getBoundingClientRect().top+76,label+' clears native label');
        check(getComputedStyle(tile).contain==='strict',label+' preserves native containment');
      }
      updateFooterSize(badge,false);
      document.documentElement.style.setProperty('--aegis-split-footer-height','16px');
      document.documentElement.style.setProperty('--aegis-badge-size',1);
      await frame();
      near(badge.getBoundingClientRect().height,16,'leaving Dual restores compact strip');
      check(!tile.style.getPropertyValue('--aegis-measured-footer-height'),'leaving Dual releases measured space');
      badge.className='aegis-badge aegis-style-footer';
      badge.innerHTML='<span class="aegis-grade-text">BS+</span>';
      document.documentElement.style.setProperty('--aegis-badge-size',1);
      document.documentElement.style.setProperty('--aegis-badge-scale',1);
      // Footer and notch share slider semantics: text changes inside a fixed
      // strip, while badge size scales the strip and the text together.
      for (const style of ['footer','notch']) {
        badge.className='aegis-badge aegis-style-'+style;
        const fullHeight=tile.getBoundingClientRect().height;
        const dimensions=[];
        for (const scale of [0.7,1.3]) {
          document.documentElement.style.setProperty('--aegis-badge-scale',scale);
          near(tile.getBoundingClientRect().height,fullHeight,style+' text size leaves tile height unchanged');
          const range=document.createRange();
          range.selectNodeContents(badge.querySelector('.aegis-grade-text'));
          const textHeight=range.getBoundingClientRect().height;
          dimensions.push({textHeight,space:badge.getBoundingClientRect().height-textHeight});
        }
        check(dimensions[0].textHeight<dimensions[1].textHeight,style+' text slider resizes lettering');
        check(dimensions[0].space>dimensions[1].space,style+' smaller lettering leaves more surrounding space');
      }
      badge.className='aegis-badge aegis-style-footer';
      const preview=document.createElement('div');
      preview.className='interactive-weapon-tile';
      preview.innerHTML='<div class="mock-weapon-img"></div>';
      const previewBadge=badge.cloneNode(true);
      preview.append(previewBadge);document.body.append(preview);
      for (const size of [0.7,1,1.5]) {
        document.documentElement.style.setProperty('--aegis-badge-size',size);
        near(previewBadge.getBoundingClientRect().height,badge.getBoundingClientRect().height,'preview and inventory strip heights match');
      }
      document.documentElement.style.setProperty('--aegis-badge-size',1);
      badge.classList.add('aegis-color-only');
      tile.setAttribute('data-dimsum-empty-bar','');
      near(tile.getBoundingClientRect().height,63,'DIMSUM empty power bar');
      tile.removeAttribute('data-dimsum-empty-bar');
      const before=tile.getBoundingClientRect().height;
      tile.querySelector('.icon').style.height='400px';
      near(tile.getBoundingClientRect().height,before,'lazy children cannot resize contained tile');
      badge.remove();
      near(tile.getBoundingClientRect().height,76,'removing footer restores native height');
      document.getElementById('result').textContent='PASS: '+results.length+' footer layout checks';
    } catch(error) { document.getElementById('result').textContent='FAIL: '+error.message; } }
    run();
  </script>`;
  await runFixture(html);
})().catch(error => { console.error(error); process.exitCode = 1; });

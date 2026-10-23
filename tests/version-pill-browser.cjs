const fs = require('node:fs');
const { runFixture, bundle } = require('./browser-helpers.cjs');
(async () => {
  const markup = fs.readFileSync('public/popup.html', 'utf8').match(/<header class="popup-header">[\s\S]*?<\/header>/)[0];
  const css = ['public/styles.css', 'public/compact-options.css'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const script = await bundle('tests/fixtures/version-pill.ts', 'VersionPill');
  const html = `<!doctype html><meta charset="utf-8"><style>${css}
    body { width:480px; margin:0; background:#0d0e12; }
    #result { white-space:pre-wrap; color:white; font:12px monospace; }
  </style><body class="popup-body"><div class="popup-container">${markup}<pre id="result"></pre></div><script>
    ${script}
    const results=[];
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    function check(ok,label){if(!ok)throw new Error(label);results.push(label);}
    function near(a,b,label){check(Math.abs(a-b)<0.2,label+': '+a+' vs '+b);}
    const button=document.getElementById('version-text');
    let response={success:true,updateAvailable:false}, requests=0, updates=0, pending;
    VersionPill.initVersionPill(button,'1.9.5',()=>{requests++;return pending || Promise.resolve(response);},()=>updates++);
    const label=()=>button.querySelector('.version-label').textContent;
    const neighbors=[...document.querySelectorAll('.logo-wrapper,.header-actions > a,.header-actions > button,.version-slot')];
    const positions=()=>neighbors.map(node=>{const r=node.getBoundingClientRect();return [r.left,r.top,r.width,r.height];});
    function stable(before){positions().forEach((rect,i)=>rect.forEach((value,j)=>near(value,before[i][j],'header neighbor remains fixed')));}
    (async()=>{try {
      check(button.tagName==='BUTTON','native keyboard-accessible button');
      const before=positions(), original=button.getBoundingClientRect();
      button.click();button.click();
      check(requests===1,'rapid clicks share one in-flight check');
      await wait(180);
      check(label()==='Checking...','checking replaces the version: '+label()+' / '+button.dataset.state);
      stable(before);
      await wait(650);
      button.getAnimations().forEach(animation=>animation.finish());
      check(label()==='Up to date','success shown inside pill');
      check(button.dataset.state==='current','success color state');
      const expanded=button.getBoundingClientRect();
      check(expanded.width>original.width,'pill grows horizontally: '+original.width+' to '+expanded.width);
      near(expanded.right,original.right,'right edge anchored');
      stable(before);
      check(getComputedStyle(button).boxShadow!=='none','expanded pill casts shadow over neighbors');
      check(getComputedStyle(button).transitionProperty.includes('width'),'width is animated');
      check(getComputedStyle(button.querySelector('.version-label')).transitionProperty.includes('opacity'),'text fades');
      check(!document.getElementById('update-check-status'),'no in-flow status sibling');
      await wait(5300);
      button.getAnimations().forEach(animation=>animation.finish());
      check(label()==='v1.9.5'&&button.dataset.state==='idle','version returns after status');
      near(button.getBoundingClientRect().width,original.width,'pill returns to original width');
      stable(before);
      document.body.classList.add('compact-options');
      document.body.style.width='360px';
      const compactBefore=positions();
      response={success:true,updateAvailable:true};button.click();await wait(800);
      button.getAnimations().forEach(animation=>animation.finish());
      check(label()==='Update available!'&&updates===1,'available state still refreshes update banner');
      stable(compactBefore);
      check(button.getBoundingClientRect().left>=0,'expanded pill fits narrow menu');
      response={success:false};button.click();await wait(800);
      check(label()==='Check failed'&&button.dataset.state==='error','failure shown inside pill');
      stable(compactBefore);
      let reject;pending=new Promise((_,fail)=>reject=fail);button.click();
      reject(new Error('Extension disconnected'));await wait(800);
      button.getAnimations({subtree:true}).forEach(animation=>animation.finish());
      check(label()==='Check failed'&&!button.hasAttribute('aria-busy'),'transport failure allows retry');
      VersionPill.setLanguage('es');
      pending=undefined;response={success:true,updateAvailable:true};button.click();await wait(800);
      button.getAnimations().forEach(animation=>animation.finish());
      check(label()==='¡Actualización disponible!','status follows the selected language');
      check(button.title.includes('¡Actualización disponible!'),'accessible title follows the selected language');
      check(button.getBoundingClientRect().left>=0,'localized status fits narrow menu');
      stable(compactBefore);
      document.getElementById('result').textContent='PASS: '+results.length+' version pill checks';
    }catch(error){document.getElementById('result').textContent='FAIL: '+error.message;}})();
  </script>`;
  await runFixture(html, { viewport: { width: 500, height: 260 } });
})().catch(error => { console.error(error); process.exitCode = 1; });

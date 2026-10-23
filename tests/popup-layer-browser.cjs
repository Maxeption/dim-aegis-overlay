const fs = require('node:fs');
const ts = require('typescript');
const { runFixture } = require('./browser-helpers.cjs');
const script = ts.transpileModule(fs.readFileSync('src/popup-layer-visibility.ts','utf8').replace(/export /g,''), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const nativeTooltips = ts.transpileModule(fs.readFileSync('src/compare-native-tooltips.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const html = `<style>${fs.readFileSync('public/styles.css','utf8')}</style><pre id="result">Running</pre><script>
${script}
const COMPARE_BUCKET_SELECTOR='.not-a-compare-grid',COMPARE_HEADER_SELECTOR='.not-a-compare-header';
${nativeTooltips}
const checks=[];
function check(value,label){if(!value)throw Error(label);checks.push(label);}
const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const visible=node=>getComputedStyle(node).display!=='none';
async function run(){
 initPopupLayerVisibility();
 const popupPortal=document.createElement('div');
 popupPortal.innerHTML='<div class="item-popup" role="dialog"><button><h1>Weapon name</h1><span>Weapon type</span></button><div class="aegis-popup-details-card aegis-side-panel">Overview sidebar</div></div>';
 document.body.append(popupPortal);await settle();
 const popup=popupPortal.firstElementChild,card=popup.querySelector('.aegis-popup-details-card');
 check(visible(card),'Overview sidebar starts visible');
 for(const trigger of ['title','header background','keyboard']){
  const sheetPortal=document.createElement('div');
  sheetPortal.innerHTML='<div role="dialog"><div class="armory"><div class="aegis-popup-details-card aegis-armory-details-card">Armory analysis</div></div></div>';
  const open=()=>document.body.append(sheetPortal);
  if(trigger==='keyboard'){
   const handler=event=>{if(event.key==='a')open();};
   document.addEventListener('keydown',handler,{once:true});
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));
  }else{
   popup.querySelector('button').addEventListener('click',open,{once:true});
   popup.querySelector(trigger==='title'?'h1':'button').click();
  }
  await settle();
  check(popup.isConnected&&!visible(card),trigger+' hides retained Overview sidebar');
  check(visible(sheetPortal.querySelector('.aegis-armory-details-card')),trigger+' preserves Armory analysis');
  const replacement=card.cloneNode(true);popup.append(replacement);await settle();
  check(!visible(replacement),trigger+' also hides a card reinserted by delayed work');replacement.remove();
  const newerPopup=popupPortal.cloneNode(true);document.body.append(newerPopup);await settle();
  check(visible(newerPopup.querySelector('.aegis-popup-details-card')),trigger+' allows a new popup above Armory');newerPopup.remove();
  sheetPortal.remove();await settle();
  check(card.isConnected&&visible(card),trigger+' restores same sidebar when Armory closes');
 }
 const unenhanced=document.createElement('div');unenhanced.innerHTML='<div role="dialog"><div class="armory">Native Armory with Aegis disabled</div></div>';
 document.body.append(unenhanced);await settle();check(!visible(card),'Native Armory detection does not depend on Aegis Armory enhancements');
 unenhanced.remove();await settle();check(visible(card),'Native Armory cleanup restores sidebar');
 // Exercise the real delayed opening and cleanup handlers with a minimal native
 // renderer. Its portal remains outside the retained popup, as it does in DIM.
 const runtime={react:{createElement:(type,props,...children)=>({type,props,children}),cloneElement:element=>element},
  createRoot:()=>{let portal;return {render(tree){if(!portal){portal=document.createElement('div');portal.innerHTML='<div><div></div></div>';document.body.append(portal);}tree.props.children.props.tooltip.props.ref(portal.firstElementChild.firstElementChild);},unmount(){portal?.remove();}}}};
 discoverTooltipRuntime=()=>runtime;
 nativeContext=()=>({template:{props:{item:{}}},socket:{socketIndex:0},providerProps:{store:{getState:()=>({manifest:{d2Manifest:{InventoryItem:{get:()=>({plug:{}})}}}})}}});
 prepareMissingPlug=()=>({});
 popup.insertAdjacentHTML('beforeend','<div data-aegis-compare-slot="perk1"><span data-aegis-compare-generated data-aegis-compare-perk-hash="42" tabindex="0">Missing perk</span></div>');
 const perk=popup.querySelector('[data-aegis-compare-generated]');
 initCompareNativeTooltips();
 perk.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));await settle();
 check(!!document.querySelector('[data-aegis-compare-native-tooltip]'),'Missing perk tooltip opens in active Overview');
 document.body.append(unenhanced);await settle();
 check(!document.querySelector('[data-aegis-compare-native-tooltip]')&&perk.isConnected,'Covering retained Overview removes its tooltip portal');
 unenhanced.remove();await settle();
 perk.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));document.body.append(unenhanced);
 await new Promise(resolve=>setTimeout(resolve,150));
 check(!document.querySelector('[data-aegis-compare-native-tooltip]'),'Pending tooltip timer cannot open above Armory');
 unenhanced.remove();await settle();
 perk.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));await settle();
 check(!!document.querySelector('[data-aegis-compare-native-tooltip]'),'Tooltip works again after returning to Overview');
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
 document.querySelector('#result').textContent='PASS: '+checks.length+' popup layer lifecycle checks';
}
run().catch(error=>document.querySelector('#result').textContent='FAIL: '+error.message);
</script>`;
runFixture(html).catch(error=>{console.error(error);process.exitCode=1;});

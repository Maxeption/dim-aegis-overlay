const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const output=ts.transpileModule(fs.readFileSync('src/perk-rating-tooltips.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class Element {
  constructor(parent=null){this.parentElement=parent;}
  contains(node){return node===this || !!node?.parentElement&&this.contains(node.parentElement);}
  closest(){return this.generated;}
}
const mod={exports:{}};
new Function('module','exports','Element','HTMLElement','require',output)(mod,mod.exports,Element,Element, name=>{
  assert.equal(name,'./perk-tooltip-positioning');
  return { createPerkTooltipPositioning(){throw new Error('DOM positioning belongs in the browser regression');} };
});
const {tooltipPerkHash,findPerkTooltipAnchor,tooltipBelongsTo}=mod.exports;
const plug={hash:42,plug:{}};
assert.equal(tooltipPerkHash({props:{plug:{plugDef:plug}}}),42);
assert.equal(tooltipPerkHash(()=>({props:{def:plug}})),42,'Lazy PlugDefTooltip supported');
assert.equal(tooltipPerkHash({props:{children:[null,{props:{def:plug}}]}}),42,'Wrapped perk supported');
assert.equal(tooltipPerkHash({props:{def:{hash:99}}}),undefined,'Non-perk definitions excluded');
const anchor=new Element(),icon=new Element(anchor);
const control={memoizedProps:{triggerRef:{current:anchor},tooltip:{props:{plug:{plugDef:plug}}},open:false}};
icon.__reactFiber$test={memoizedProps:{},return:control};
assert.deepEqual(findPerkTooltipAnchor(icon),{anchor,hash:42},'Native trigger discovered without Compare markup');
const tip=new Element();tip.__reactFiber$test={memoizedProps:{},return:control};
control.memoizedProps.open=true;
assert.equal(tooltipBelongsTo(tip,anchor),true);
assert.equal(tooltipBelongsTo(tip,new Element()),false,'Another perk tooltip is never decorated');
const generated=new Element();generated.dataset={aegisComparePerkHash:'42'};icon.generated=generated;
assert.deepEqual(findPerkTooltipAnchor(icon),{anchor:generated,hash:42},'Missing Compare perks retained');
assert.equal(findPerkTooltipAnchor(new Element()),undefined,'Unknown host leaves tooltip alone');
console.log('PASS: native, lazy and wrapped perk discovery; non-perk exclusion; exact tooltip ownership; missing Compare perks.');

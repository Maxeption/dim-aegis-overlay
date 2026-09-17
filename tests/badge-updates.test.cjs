const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/content.ts', 'utf8');
const scheduler = source.slice(source.indexOf('const badgeResults ='), source.indexOf('function getBadgeTemplate'));
// Select the badge settings listener itself; unrelated listeners may precede it.
const sourceFile = ts.createSourceFile('content.ts', source, ts.ScriptTarget.Latest, true);
const badgeListeners = sourceFile.statements.filter(node =>
  ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
  node.expression.expression.getText(sourceFile) === 'chrome.storage.onChanged.addListener' &&
  node.getText(sourceFile).includes('changes.aegisBadgeStyle'));
assert.equal(badgeListeners.length, 1, 'Expected exactly one badge settings listener');
const listener = badgeListeners[0].getText(sourceFile);
const queue = fs.readFileSync('src/item-queue.ts', 'utf8').replace('export function', 'function');
let onChanged, rescores = 0, now = 0, next = 0;
const timers = new Map(), renders = [];
const items = Array.from({length: 120}, (_, id) => ({id, isConnected:true,
  getBoundingClientRect: () => ({top:0,bottom:60,left:0,right:60,width:60,height:60})}));
const ctx = vm.createContext({
  console, setTimeout: fn => {timers.set(++next,fn); return next;},
  clearTimeout: id => timers.delete(id),
  requestAnimationFrame: fn => {timers.set(++next,fn); return next;},
  performance:{now:()=>now}, innerWidth:800, innerHeight:600,
  chrome:{storage:{onChanged:{addListener:fn=>{onChanged=fn;}}}},
  document:{querySelectorAll:()=>items,querySelector:()=>null},
  reprocessAllElements:()=>rescores++, scheduleOpacityUpdate:()=>{},
  aegisBadgeStyle:'classic', aegisBadgePosition:'bottom-left', aegisFadeHover:false,
  injectBadge:(item,result)=>{now+=2;renders.push([item.id,ctx.aegisBadgeStyle,result.grade]);},
});
const code = ts.transpileModule(queue + scheduler + listener, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInContext(code,ctx);
ctx.items=items;
vm.runInContext("items.forEach(item=>badgeResults.set(item,{grade:'A'}))",ctx);
function tick(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}
function drain(){let limit=1000;while(timers.size && limit--)tick();assert.ok(limit>0);}
for(let i=0;i<50;i++)onChanged({aegisBadgeStyle:{newValue:i%2?'pill':'footer'}},'local');
assert.equal(rescores,0,'Style choices must not rescore the inventory');
assert.equal(timers.size,1,'Rapid choices coalesce before rendering');
drain();
assert.equal(renders.length,120);
assert.ok(renders.every(([,style,grade])=>style==='pill'&&grade==='A'));
renders.length=0;
onChanged({aegisBadgeStyle:{newValue:'footer'}},'local');
tick();tick(); // Begin the first short slice.
assert.ok(renders.length>0&&renders.length<120,'Rendering yields between slices');
const previous=renders.length;
onChanged({aegisBadgeStyle:{newValue:'notch'}},'local');
drain();
assert.equal(renders.length-previous,120);
assert.ok(renders.slice(previous).every(([,style])=>style==='notch'),'Old choices never replay');
onChanged({aegisGradeDisplayMode:{newValue:'potential'}},'local');
assert.equal(rescores,1,'Changes affecting the grade retain the full scoring path');
console.log('Passed: 50 rapid style choices coalesce, cached grades reused, short slices, unfinished choices cancelled, grading changes preserved.');

// Both settings must reach the inventory on every input event, before release.
const popupFile = ts.createSourceFile('popup.ts', fs.readFileSync('src/popup.ts', 'utf8'), ts.ScriptTarget.Latest, true);
for (const [sliderName, setting, cssProperty, labelId] of [
  ['sizeSlider', 'aegisBadgeSize', '--aegis-badge-size', 'badge-size-value'],
  ['scaleSlider', 'aegisBadgeScale', '--aegis-badge-scale', 'badge-scale-value'],
]) {
  const bindings = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(popupFile) === sliderName + '.addEventListener' &&
        ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'input') bindings.push(node);
    ts.forEachChild(node, visit);
  }
  visit(popupFile);
  assert.equal(bindings.length, 1, sliderName + ' has one input handler');
  let input;
  const writes = [], properties = new Map(), label = {};
  const slider = {value:'100', addEventListener:(_event, handler)=>{input=handler;}};
  const sliderContext = vm.createContext({
    [sliderName]:slider, scaleValueText:label,
    normalizeBadgeSize:value=>Math.min(150,Math.max(70,value)),
    document:{getElementById:id=>{assert.equal(id,labelId);return label;},
      documentElement:{style:{setProperty:(key,value)=>properties.set(key,value)}}},
    chrome:{storage:{local:{set:value=>writes.push(value)}}},
  });
  vm.runInContext(ts.transpileModule(bindings[0].getText(popupFile), {}).outputText, sliderContext);
  for (const value of [70,75,100,125,130,100]) {
    slider.value=String(value);input();
    assert.equal(writes.length,1,setting+' writes immediately at every step');
    assert.equal(writes.pop()[setting],value);
    assert.equal(properties.get(cssProperty),String(value/100));
    assert.equal(label.textContent,value+'%');
  }
}
console.log('Passed: badge size and text size both publish every slider step before release.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(name) {
  const output = ts.transpileModule(fs.readFileSync('src/'+name.replace('./','')+'.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('require','module','exports',output)(load,module,module.exports);return module.exports;
}
const {discoverTooltipRuntime,prepareMissingPlug}=load('compare-native-tooltips');
const react={createElement(){}},renderer={createRoot(){}};
function overrideSockets(){const diagnostic='Tried to override to a socket';return diagnostic;}
const factories={
  unrelated(){throw new Error('Never execute unrelated modules');},
  reactFactory(){return 'react.transitional.element createElement useState';},
  rendererFactory(){const exports={};exports.createRoot=()=>{};},
  previewFactory(){return 'Tried to override to a socket';},
};
const loaded=[];
const requireHost=id=>{loaded.push(id);return {reactFactory:react,rendererFactory:renderer,previewFactory:{minified:overrideSockets}}[id];};
requireHost.m=factories;
const chunks=[];chunks.push=entry=>entry[2](requireHost);
const runtime=discoverTooltipRuntime({rspackChunkdim:chunks});
assert.equal(runtime.react,react);assert.equal(runtime.createRoot,renderer.createRoot);assert.equal(runtime.overrideSockets,overrideSockets);
assert.deepEqual(loaded,['reactFactory','rendererFactory','previewFactory']);
assert.equal(discoverTooltipRuntime({}),undefined,'Unsupported host fails safely');
assert.equal(discoverTooltipRuntime({rspackChunkdim:[]}),undefined,'Inactive runtime fails safely');
assert.ok(discoverTooltipRuntime({webpackChunkdim:chunks}),'Webpack host supported too');

const originalPlug=Object.freeze({plugDef:{hash:1},enabled:true,stats:{}});
const originalSocket=Object.freeze({socketIndex:2,plugged:originalPlug,plugOptions:Object.freeze([originalPlug])});
const item=Object.freeze({id:'test',sockets:Object.freeze({allSockets:Object.freeze([originalSocket])})});
const definition={hash:3};
const state={manifest:{d2Manifest:{}},dimApi:{settings:{customStats:[]}}};
const result=prepareMissingPlug(item,2,definition,state,(context,copy,overrides)=>{
  assert.notEqual(copy,item);assert.notEqual(copy.sockets.allSockets,item.sockets.allSockets);
  assert.notEqual(copy.sockets.allSockets[0],originalSocket);
  assert.deepEqual(overrides,{2:1},'The original perk stays selected while calculating the missing option');
  assert.equal(context.defs,state.manifest.d2Manifest);
  const missing=copy.sockets.allSockets[0].plugOptions[1];
  missing.stats={943549884:{value:15,investmentValue:15}};
  return copy;
});
assert.equal(result.plug.plugDef,definition);assert.equal(result.plug.stats[943549884].value,15);
assert.equal(item.sockets.allSockets[0].plugOptions.length,1,'No missing perk added to the real weapon');
assert.equal(item.sockets.allSockets[0].plugged,originalPlug,'No inventory or preview selection changed');
assert.equal(prepareMissingPlug(item,99,definition,state,()=>{throw new Error('Should not run');}),undefined);
console.log('PASS: native module discovery, unsupported-host fallback, isolated stat preview, and unchanged inventory selections.');

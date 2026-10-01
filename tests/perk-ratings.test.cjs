const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('src/perk-ratings.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('module','exports',output)(mod,mod.exports);
const {parsePerkRatings,findPerkRating,perkRatingKey,buildPerkRatingIndex}=mod.exports;
const rows=[['NAME 🖼️','Name','ANALYSIS Description','Usage','#','Tier','KEY',''],
 ['', 'Shoot to Loot','Ammo setup','Roam and DPS','8','S','A','Different tier legend'],
 ['', 'Bad rank','','','','A','',''], ['', 'No tier','','','9','','S',''],
 ['', 'Fake tier','','','10','great','','']];
const ratings=parsePerkRatings(rows,'Perks');
assert.deepEqual(Object.keys(ratings),['shoot to loot']);
assert.equal(ratings['shoot to loot'].tier,'S','Uses Tier, never adjacent legend');
assert.equal(ratings['shoot to loot'].rank,8);
assert.equal(ratings['shoot to loot'].analysis,'Ammo setup');
const origin=parsePerkRatings([['Name','#','Tier','ANALYSIS Description'],["Dealer’s Choice",'7','S','Super generation']],'Origin Traits');
const cache={tabs:{Perks:{updatedAt:1,ratings},'Origin Traits':{updatedAt:1,ratings:origin}}};
assert.equal(findPerkRating(cache,'Shoot to Loot Enhanced',false).rank,8);
assert.equal(findPerkRating(cache,'Shoot to Loot (Enhanced)',false).rank,8);
assert.equal(findPerkRating(cache,"Dealer's Choice",true).rank,7);
assert.equal(findPerkRating(cache,"Dealer's Choice",false),undefined,'Ranks stay in their own tab');
assert.equal(findPerkRating(cache,'Fluted Barrel',false),undefined,'Unrated perks have no invented grade');
assert.equal(findPerkRating(undefined,'Shoot to Loot',false),undefined);
const byHash=buildPerkRatingIndex(cache,{1:'shoot to loot',2:'shoot to loot enhanced',3:"dealer's choice",4:'unrated perk'});
assert.equal(byHash[1],byHash[2],'Base and enhanced hashes share the sheet rating');
assert.equal(byHash[3].tab,'Origin Traits');
assert.equal(byHash[4],undefined);
assert.equal(perkRatingKey('  SHOOT   TO LOOT  '),'shoot to loot');
assert.throws(()=>parsePerkRatings([['<html>rate limited</html>']],'Perks'));
assert.throws(()=>parsePerkRatings([rows[0]],'Perks'),'Invalid sync must not replace good cache');
assert.equal(parsePerkRatings([['Title'],...rows],'Perks')['shoot to loot'].rank,8);
console.log('PASS: perk rating headers, tiers versus legend, ranks, enhanced names, origin separation, and invalid responses.');

async function testCache() {
  const background=fs.readFileSync('src/background.ts','utf8');
  const source=background.slice(background.indexOf('let perkRatingsSync:'),background.indexOf('async function fetchAndCacheAegisSheet'));
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  let saved, writes=0, requests=0, fail=false;
  const chrome={storage:{local:{get:async()=>({aegisPerkRatings:structuredClone(saved)}),set:async value=>{saved=structuredClone(value.aegisPerkRatings);writes++;}}}};
  const fetchWithTimeout=async url=>{
    requests++;
    const origin=url.includes('Origin%20Traits');
    return {ok:true,text:async()=>JSON.stringify(fail?[['<html>error</html>']]:origin?[['Name','#','Tier'],['Origin',1,'A']]:rows)};
  };
  const sync=new Function('chrome','fetchWithTimeout','parseCSV','parsePerkRatings','SHEET_ID','console',compiled+';return fetchAndCachePerkRatings;')
    (chrome,fetchWithTimeout,JSON.parse,parsePerkRatings,'sheet',{warn(){}});
  await Promise.all([sync(),sync()]);
  assert.equal(requests,2,'Concurrent initialization shares one request per tab');
  assert.equal(writes,1);
  assert.equal(saved.tabs.Perks.ratings['shoot to loot'].rank,8);
  await sync();assert.equal(requests,2,'Fresh cache avoids network requests');
  const previous=structuredClone(saved);fail=true;await sync(true);
  assert.deepEqual(saved,previous,'Invalid responses preserve both last successful tabs');
  assert.equal(writes,1,'Failed responses never overwrite cached ratings');
  console.log('PASS: ratings cache initialization, concurrent request deduplication, freshness, and failed-sync preservation.');
}
testCache().catch(error=>{console.error(error);process.exitCode=1;});

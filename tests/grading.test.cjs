const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
const cache = new Map();
function load(name) {
  const file = path.resolve(__dirname, '../src', name + '.ts');
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; cache.set(file, module.exports);
  new Function('require', 'module', 'exports', output)(name => name.startsWith('.') ? load(name) : require(name), module, module.exports);
  return module.exports;
}
const { GRADES, computeGrade, defaultRules, defaultGradeSettings, normalizeGradeSettings, evaluateRules, evaluateCustomRoll, gradeValue, unreachableGrades } = load('grading');
const { displayGrade, rollGradeDisplay, gradeGradient, twoTierGradient, defaultGradeColors, hasMaxTierGrade } = load('grade-colors');
for (const [base, end] of [['#ffd700','#ff823b'],['#da70d6','#7848e8'],['#00f2fe','#70a7ff'],['#bdc3c7','#5d6062'],['#e67e22','#d23514'],['#e74c3c','#bc2318']]) {
  assert.equal(gradeGradient(base), `linear-gradient(135deg, ${base}, ${end})`);
}
assert.equal(gradeGradient('#000000'), 'linear-gradient(135deg, #000000, #000000)');
assert.equal(gradeGradient('#386BFF'), 'linear-gradient(135deg, #386bff, #5312ff)');
assert.equal(gradeGradient('#386bff'), gradeGradient('#386BFF'));
assert.equal(gradeGradient('#7f8c8d'), 'linear-gradient(135deg, #7f8c8d, #404748)');
assert.match(gradeGradient('#ffffff'), /^linear-gradient\(135deg, #ffffff, #[0-9a-f]{6}\)$/);
const brightness = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel,16)/255)
  .map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
for (let value=0;value<=0xffffff;value+=4093) {
  const color='#'+value.toString(16).padStart(6,'0');
  const end=gradeGradient(color).match(/#[0-9a-f]{6}/g)[1];
  assert.ok(brightness(end)<=brightness(color)+.0001, 'Gradient endpoint must be darker: '+color);
}
for (const [color, end] of JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/grade-gradients.json'), 'utf8'))) {
  assert.equal(gradeGradient(color), `linear-gradient(135deg, ${color}, ${end})`, 'Okhsl gradient: '+color);
}
for (let value=0; value<256; value++) {
  const color='#'+value.toString(16).padStart(2,'0').repeat(3);
  const end=gradeGradient(color).match(/#[0-9a-f]{6}/g)[1];
  assert.equal(end.slice(1,3), end.slice(3,5), 'Neutral gray red/green: '+color);
  assert.equal(end.slice(3,5), end.slice(5,7), 'Neutral gray green/blue: '+color);
}
const { hexToHsv, hsvToHex } = load('color-picker');
for (const [color, expected] of [['#e6b1bd','#956a7d'],['#b1c4e6','#6d7796'],['#b1e6c4','#5c967d'],['#e6dcb1','#9d8363'],['#d7b1e6','#7e75b3']]) {
  assert.equal(gradeGradient(color), `linear-gradient(135deg, ${color}, ${expected})`);
  assert.ok(hexToHsv(expected)[1] < 40, 'Pastels must not become saturated: '+color);
}
for (let hue=0; hue<360; hue+=5) for (const saturation of [15,20,23,25,30]) for (let value=20; value<=100; value+=5) {
  const color=hsvToHex([hue,saturation,value]);
  const end=gradeGradient(color).match(/#[0-9a-f]{6}/g)[1];
  assert.ok(brightness(end)<=brightness(color)+.0001, 'Pastel endpoint stays darker: '+color);
}
const { normalizeMasterwork, masterworkMatches, masterworkStatName } = load('masterwork');
const { converter } = require('culori');
const toOkhsl = converter('okhsl'), toOklab = converter('oklab');
for (let hue=0; hue<360; hue+=5) for (const saturation of [0,5,25,50,75,100]) for (const value of [5,20,40,60,80,100]) {
  const color=hsvToHex([hue,saturation,value]);
  const end=gradeGradient(color).match(/#[0-9a-f]{6}/g)[1];
  const s=Math.max(0,Math.min(1,toOkhsl(color).s));
  assert.ok(Math.abs(toOkhsl(end).l-toOkhsl(color).l*(.5+.3*s))<.006, 'Bold perceptual darkening: '+color);
  const a=toOklab(color), b=toOklab(end);
  const quantizationTolerance = value < 20 ? .012 : .003;
  assert.ok(Math.hypot(b.a,b.b)<=Math.hypot(a.a,a.b)*b.l/a.l*(1+1.5*s*s)+quantizationTolerance, 'Saturation-dependent chroma limit: '+color);
}
for (let hue=0; hue<360; hue+=5) {
  const color=hsvToHex([hue,23,90]);
  const end=gradeGradient(color).match(/#[0-9a-f]{6}/g)[1];
  assert.ok(brightness(end)<brightness(color)*.65, 'Pastels need visible depth across all hues: '+color);
  assert.ok(hexToHsv(end)[1]<55, 'Bold pastel depth must retain moderate saturation: '+color);
}
assert.equal(normalizeMasterwork('Tier 1Reload Speed Masterwork'), 'reload');
assert.equal(normalizeMasterwork('Projectile Speed'), 'velocity');
assert.equal(masterworkMatches(['Range', 'Handling'], 'Tier 10 Handling'), true);
assert.equal(masterworkMatches(['Reload'], 'Reload Speed'), true);
assert.equal(masterworkMatches(['Range'], ''), false);
assert.equal(masterworkMatches(['Range'], 'Rangefinder'), false);
assert.equal(masterworkMatches([], ''), true);
const mwRules = defaultRules();mwRules['S+'].masterwork = true;
const { updateLocalizedRegistries, getLocalizedStatName } = load('hash-translator');
for (const name of ['Reload Speed', 'Velocidad de recarga', 'リロード速度', '재장전 속도', '换弹速度', '換彈速度']) {
  updateLocalizedRegistries({}, {}, { 4188031367: name });
  const stats = [{ hash: 1240592695, name: 'Secondary bonus', isPrimary: false }, { hash: 4188031367, name, isPrimary: true }];
  const canonical = masterworkStatName(stats);
  assert.equal(canonical, 'reload');
  for (const equipped of [canonical, name]) {
    const matched = masterworkMatches(['Reload Speed'], equipped, getLocalizedStatName);
    assert.equal(matched, true, name);
    assert.equal(evaluateRules(['active', 'active', 'active', 'active', 'active'], mwRules, matched), 'S+');
  }
  assert.equal(masterworkMatches(['Range'], name, getLocalizedStatName), false);
}
assert.equal(masterworkStatName(undefined), '');
assert.equal(masterworkStatName([{ hash: 0, isPrimary: true }]), '');
assert.equal(masterworkStatName([{ hash: 1240592695, isPrimary: false }]), '');
assert.equal(masterworkStatName([{ hash: 1240592695, isPrimary: true }, { hash: 4188031367, isPrimary: true }]), '');
const fullRoll = Array(5).fill('active');
assert.equal(evaluateRules(fullRoll, mwRules, true), 'S+');
assert.equal(evaluateRules(fullRoll, mwRules, false), 'S');
assert.equal(evaluateCustomRoll(Array(5).fill('selectable'), mwRules, false).potentialGrade, 'S');
assert.equal(evaluateCustomRoll(Array(5).fill('selectable'), mwRules, true).potentialGrade, 'S+');
mwRules['S+'].extras = 'mag';mwRules['S+'].origin = false;
assert.ok(!unreachableGrades(mwRules).includes('S'));
const legacy = defaultGradeSettings();legacy.pve.S.extras = 'none';
for (const rule of Object.values(legacy.pve)) delete rule.masterwork;
assert.equal(normalizeGradeSettings(legacy).pve.S.masterwork,false);
assert.equal(normalizeGradeSettings(legacy).pve.S.extras,'none');
for (const [hex, hsv] of [['#ff0000', [0, 100, 100]], ['#00ff00', [120, 100, 100]], ['#0000ff', [240, 100, 100]], ['#ffffff', [0, 0, 100]], ['#000000', [0, 100, 0]]]) {
  assert.deepEqual(hexToHsv(hex), hsv);
  assert.equal(hsvToHex(hsv), hex);
}
for (let color = 0; color <= 0xffffff; color += 4093) {
  const hex = '#' + color.toString(16).padStart(6, '0');
  assert.equal(hsvToHex(hexToHsv(hex)), hex);
}
assert.deepEqual(hexToHsv('#000000', [240, 75, 100]), [240, 75, 0]);
assert.deepEqual(hexToHsv('#ffffff', [240, 75, 100]), [240, 0, 100]);
assert.equal(hsvToHex([360, 100, 100]), '#ff0000');

const rules = defaultRules();
const states = ['active', 'selectable', 'missing'];
for (let n = 0; n < 243; n++) {
  const slots = Array.from({ length: 5 }, (_, i) => states[Math.floor(n / 3 ** i) % 3]);
  assert.equal(evaluateRules(slots, rules), computeGrade(...slots, false), `default equipped ${slots}`);
  assert.equal(evaluateCustomRoll(slots, rules).potentialGrade, computeGrade(...slots, true), `default potential ${slots}`);
}
assert.deepEqual(unreachableGrades(rules), []);
const oldSettings = defaultGradeSettings();
oldSettings.rulesEnabled = true;oldSettings.pve.S.extras = 'none';oldSettings.pvp.D.origin = true;
delete oldSettings.pve.E;delete oldSettings.pvp.E;
const migrated = normalizeGradeSettings(oldSettings);
assert.equal(migrated.pve.S.extras, 'none');
assert.equal(migrated.pvp.D.origin, true);
assert.equal(migrated.pve.E.enabled, false);
assert.equal(migrated.pvp.E.enabled, false);
const optionalE = defaultRules();optionalE.E.enabled = true;
assert.ok(unreachableGrades(optionalE).includes('E'));
optionalE.D.origin = true;
assert.equal(evaluateRules(['active','missing','missing','missing','missing'],optionalE),'E');
assert.equal(evaluateCustomRoll(['selectable','missing','missing','missing','missing'],optionalE).potentialGrade,'E');
assert.equal(evaluateCustomRoll(['active','missing','selectable','missing','missing'],optionalE).potentialGrade,'C');
assert.equal(evaluateRules(Array(5).fill('missing'),optionalE),'F');
assert.equal(normalizeGradeSettings({...defaultGradeSettings(),pve:optionalE}).pve.E.enabled,true);
assert.equal(normalizeGradeSettings({...defaultGradeSettings(),colors:{E:'#123456'}}).colors.E,'#123456');
assert.equal(displayGrade('BE'),'E');
assert.equal(displayGrade('ES+'),'S+');
assert.equal(displayGrade('E'),'E');
assert.equal(computeGrade('active', 'active', 'active', 'active', 'active', false), 'S+');
assert.equal(computeGrade('active', 'active', 'active', 'missing', 'active', false), 'S');
assert.equal(computeGrade('active', 'active', 'missing', 'active', 'active', false), 'A+');
assert.equal(computeGrade('active', 'active', 'missing', 'missing', 'active', false), 'A');

let seed = 48271;
const pick = values => { seed = (seed * 16807) % 2147483647; return values[seed % values.length]; };
for (let profile = 0; profile < 30; profile++) {
  const custom = defaultRules();
  for (const grade of GRADES.filter(g => g !== 'F')) {
    custom[grade] = { traits: pick(['both', 'mixed', 'one', 'available']), extras: pick(['none', 'mag', 'barrel', 'either', 'both']), origin: pick([true, false]), masterwork: pick([true, false]), enabled: pick([true, true, false]) };
  }
  for (let n = 0; n < 243; n++) {
    const slots = Array.from({ length: 5 }, (_, i) => states[Math.floor(n / 3 ** i) % 3]);
    const mwMatched = pick([true,false]);
    const result = evaluateCustomRoll(slots, custom, mwMatched);
    assert.ok(gradeValue(result.potentialGrade) >= gradeValue(result.grade));
    const candidate = [...slots];
    for (const index of result.swaps) { assert.equal(slots[index], 'selectable'); candidate[index] = 'active'; }
    assert.equal(evaluateRules(candidate, custom, mwMatched), result.potentialGrade);
  }
}
for (let i = 1; i < GRADES.length; i++) assert.ok(gradeValue(GRADES[i - 1]) > gradeValue(GRADES[i]));
assert.equal(gradeValue('S-'), 100);
assert.equal(gradeValue('SS+'), 100);
assert.deepEqual(normalizeGradeSettings(null), defaultGradeSettings());
assert.deepEqual(normalizeGradeSettings({ version: 2, rulesEnabled: true }), defaultGradeSettings());
const settings = defaultGradeSettings();settings.colorsEnabled = true;settings.colors = { S: '#abcdef', 'S+': 'red; position:fixed' };settings.pve.S.origin = 'invalid';
const normalized = normalizeGradeSettings(settings);
assert.deepEqual(normalized.colors, { S: '#abcdef' });
assert.deepEqual(normalized.pve, defaultRules());
assert.notEqual(normalized.pve, normalized.pvp);
assert.equal(defaultGradeSettings().colors.S, undefined);
for (const [input, expected] of [['S+', 'S+'], ['SS+', 'S+'], ['S+F', 'F'], ['A+S+', 'S+'], ['BS➔S+', 'S+'], ['B+F→A+', 'A+'], ['★ S+ ▲', 'S+'], ['✦ A+', 'A+'], ['—', ''], ['S/A+', 'S']]) assert.equal(displayGrade(input), expected, input);
assert.equal(rollGradeDisplay('B+S➔S+'), 'S➔S+');
assert.equal(normalizeGradeSettings({ ...defaultGradeSettings(), rulesEnabled: true }, { version: 1, colorsEnabled: true, colors: { S: '#00ff00' } }).rulesEnabled, true);
assert.deepEqual(normalizeGradeSettings(defaultGradeSettings(), { version: 1, colorsEnabled: true, colors: { S: '#00ff00' } }).colors, { S: '#00ff00' });
console.log('Passed: 486 default parity cases, 7,290 custom roll/potential cases, exact-grade parsing/order, and preference validation.');

for (const weapon of GRADES) for (const perk of GRADES) {
  const gradient=twoTierGradient(weapon+perk);
  assert.ok(gradient, weapon+perk);
  if(defaultGradeColors[weapon]===defaultGradeColors[perk]) assert.equal(gradient,gradeGradient(defaultGradeColors[perk]));
  else assert.ok(gradient.endsWith(`linear-gradient(90deg, ${defaultGradeColors[weapon]} 25%, ${defaultGradeColors[perk]} 75%)`));
}
for(const text of ['S','S+','F➔A','S/S','FA | BS','FA➔S+ | BA','—','SS+➔garbage','FA➔']) assert.equal(twoTierGradient(text),null,text);
assert.equal(twoTierGradient('FA➔S+'),twoTierGradient('FS+'));
assert.equal(twoTierGradient('FA➔FS+'),twoTierGradient('FS+'));
assert.equal(twoTierGradient(' ★ FA ▲ '),twoTierGradient('FA'));
const twoTonePalette=defaultGradeSettings();twoTonePalette.colorsEnabled=true;twoTonePalette.colors={'S+':'#112233',S:'#abcdef',F:'#000000',A:'#ffffff'};
assert.match(twoTierGradient('S+S',twoTonePalette),/90deg, #112233 25%, #abcdef 75%/);
assert.match(twoTierGradient('FA',twoTonePalette),/90deg, #000000 25%, #ffffff 75%/);
twoTonePalette.colorsEnabled=false;assert.equal(twoTierGradient('FA',twoTonePalette),twoTierGradient('FA'));
console.log('Passed: 100 two-tier color pairs, matching-color parity, custom + grades, dual parsing and single/armor/mixed exclusions.');

for(const grade of ['SS+','S+S+','SA➔S+','SF➔SS+','BS | SS+','SS+ | FA']) assert.equal(hasMaxTierGrade(grade),true,grade);
for(const grade of ['SS','SA','AS+','S+','S/S','BS+ | SS','S➔S+','FA➔S+','—']) assert.equal(hasMaxTierGrade(grade),false,grade);
console.log('Passed: SS+-only glow selection, mixed-side eligibility and equipped/potential exclusions.');

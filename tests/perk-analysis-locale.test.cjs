const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

function load(name, imports = {}, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(`src/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', ...Object.keys(globals), source)(
    module, module.exports, path => { assert.ok(imports[path], path); return imports[path]; }, ...Object.values(globals));
  return module.exports;
}

(async () => {
  const locale = load('evaluation-i18n', {}, { crypto: webcrypto });
  const ratings = load('perk-ratings');
  const korean = JSON.parse(fs.readFileSync('data/locales/ko.json', 'utf8'));
  const source = 'even outside speedrunning, makes otherwise impossible endgame feats possible';
  const originSource = 'highest sustained damage buff from an origin trait';
  const translated = await locale.translateEvaluationText(source, korean);
  assert.match(translated, /[가-힣]/);
  assert.match(await locale.translateEvaluationText(originSource, korean), /[가-힣]/);
  assert.equal(await locale.translateEvaluationText('New spreadsheet text', korean), 'New spreadsheet text');
  assert.equal(await locale.translateEvaluationText(source, null), source);

  const rating = { name: 'Test', analysis: source, usage: '', tier: 'S', rank: 1, tab: 'Perks' };
  const cache = { tabs: { Perks: { updatedAt: 1, ratings: { test: rating } } } };
  let language = 'ko', listener, node;
  const pending = [];
  const chrome = { runtime: { sendMessage: (message, callback) => pending.push({ message, callback }) },
    storage: { local: { get: (_keys, callback) => callback({ aegisPerkRatings: cache, aegisLanguage: 'ko' }) },
      onChanged: { addListener: callback => { listener = callback; } } } };
  const document = { getElementById: () => node, createElement: () => ({}),
    documentElement: { append: value => { node = value; } }, dispatchEvent: () => {} };
  const bridge = load('perk-analysis-bridge', {
    './i18n': { initLanguage: value => { language = value; }, getCurrentLanguage: () => language, t: key => key },
    './canonical-hashes': { HASH_TO_ENGLISH_PERK: { 1: 'Test', 2: 'Test Enhanced' } },
    './perk-ratings': ratings, './evaluation-i18n': locale,
  }, { chrome, document });
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
  const published = () => JSON.parse(node.textContent);
  bridge.initPerkAnalysisBridge();
  assert.equal(pending[0].message.action, 'getEvaluationLocale');
  pending.shift().callback({ success: true, bundle: korean }); await settle();
  assert.equal(published().byHash[1].analysis, translated);
  assert.equal(published().byHash[2].analysis, translated, 'Enhanced variants share translations');
  assert.equal(rating.analysis, source, 'The source cache is never mutated');
  listener({ aegisLanguage: { newValue: 'en' } }, 'local'); await settle();
  assert.equal(published().byHash[1].analysis, source, 'English restores original text');
  listener({ aegisLanguage: { newValue: 'ko' } }, 'local');
  const stale = pending.shift();
  listener({ aegisLanguage: { newValue: 'ja' } }, 'local');
  pending.shift().callback({ success: false }); await settle();
  stale.callback({ success: true, bundle: korean }); await settle();
  assert.equal(published().byHash[1].analysis, source, 'Stale Korean response cannot replace Japanese fallback');
  listener({ aegisPerkAnalysisEnabled: { newValue: false } }, 'local');
  assert.equal(published().enabled, false, 'Disabling takes effect without waiting for a locale fetch');
  console.log('PASS: perk and origin translations, source fallback, immutable cache, enhanced variants, language switching, stale responses, and immediate disabling.');
})().catch(error => { console.error(error); process.exitCode = 1; });

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.106 mood analysis survives reload and uses a 24h cooldown',()=>{
  const store=read('api/mood-analysis-store.cjs');
  const cache=read('api/strict-runtime-cache.cjs');
  const api=read('api/partner-message.js');
  const supplements=read('api/supplements.js');
  const ui=read('public/mood-history.js');
  const app=read('public/app.js');
  const html=read('public/index.html');

  assert.match(cache,/'rudi-mood-analysis-v4'/);
  assert.match(store,/TTL_SECONDS=60\*60\*24\*3650/);
  assert.match(store,/COOLDOWN_MS=24\*60\*60\*1000/);
  assert.match(store,/readLatestMoodAnalysisCache/);
  assert.match(store,/analysisWithinCooldown/);

  assert.match(api,/readLatestMoodAnalysisCache/);
  assert.match(api,/reused=analysisWithinCooldown/);
  assert.doesNotMatch(api,/clearMoodAnalysisCache\(actor/);
  assert.doesNotMatch(supplements,/clearMoodAnalysisCache/);

  assert.match(ui,/restoreAnalysisWindow=true/);
  assert.match(ui,/function analysisCooldown/);
  assert.match(ui,/Сохранённый анализ за/);
  assert.match(ui,/button\.disabled=cooldown\.locked\|\|moodDays<minimumDays/);

  assert.match(app,/const host=details\?\.parentNode\|\|own/);
  assert.match(app,/is-collapsed/);
  assert.match(app,/Что повлияло\?/);

  assert.match(html,/app\.js\?v=2\.106/);
  assert.match(html,/mood-history\.js\?v=2\.106/);
  assert.match(html,/rudi-version" content="v2\.106"/);
});

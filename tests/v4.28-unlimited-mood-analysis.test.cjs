const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('v4.28 mood analysis has no repeat cooldown',()=>{
  const ui=read('public/mood-history.js');
  const store=read('api/mood-analysis-store.cjs');
  const api=read('api/partner-message.js');

  assert.doesNotMatch(ui,/analysisCooldown|analysisRefreshTimer|Новый анализ через|24\*360000/);
  assert.match(ui,/button\.disabled=moodDays<minimumDays;button\.textContent='Анализ'/);
  assert.match(ui,/Можно обновлять без ограничений/);

  assert.doesNotMatch(store,/COOLDOWN_MS|analysisCooldownRemainingMs|analysisWithinCooldown/);
  assert.doesNotMatch(api,/analysisWithinCooldown|analysisCacheHours/);
});

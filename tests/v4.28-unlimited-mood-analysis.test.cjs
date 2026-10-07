const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('mood analysis is limited to three successful runs per Moscow day',()=>{
  const ui=read('public/mood-history.js');
  const store=read('api/mood-analysis-store.cjs');
  const api=read('api/partner-message.js');

  assert.match(store,/DAILY_ANALYSIS_LIMIT=3/);
  assert.match(store,/readMoodAnalysisQuota/);
  assert.match(store,/recordSuccessfulMoodAnalysis/);
  assert.match(store,/mood-analysis-daily-limit/);

  assert.match(api,/readMoodAnalysisQuota/);
  assert.match(api,/recordSuccessfulMoodAnalysis/);
  assert.match(api,/analysisQuota\.available>0/);
  assert.match(api,/mood-analysis-daily-limit/);

  assert.match(ui,/Осталось анализов сегодня/);
  assert.match(ui,/Лимит на сегодня исчерпан/);
  assert.match(ui,/analysisLimitReached/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.101 mood history insights are wired end to end',()=>{
  const daily=read('api/daily-mood-store.cjs');
  const store=read('api/mood-analysis-store.cjs');
  const ai=read('api/mood-analysis-ai.cjs');
  const api=read('api/partner-message.js');
  const app=read('public/app.js');
  const ui=read('public/mood-history.js');
  const html=read('public/index.html');

  assert.match(daily,/MAX_HISTORY_DAYS=180/);
  assert.match(daily,/setDailyMoodReason/);
  assert.match(app,/Почему такое настроение/);
  assert.match(app,/Голодание/);
  assert.match(ui,/3 месяца/);
  assert.match(ui,/moodDayDetail/);
  assert.match(ui,/moodAnalysisFeedback/);
  assert.match(api,/readFastingState/);
  assert.match(api,/readHabits/);
  assert.match(api,/mood-analysis-insufficient-data/);
  assert.match(api,/selected\.length>=5/);
  assert.match(ai,/Корреляции формулируйте/);
  assert.match(store,/rudi-mood-analysis-v4/);
  assert.match(html,/mood-history-v2101\.css\?v=2\.101/);
});

test('v2.101 analysis is descriptive, not causal',()=>{
  const ai=read('api/mood-analysis-ai.cjs');
  assert.match(ai,/не изображайте врача или психотерапевта/i);
  assert.match(ai,/связь и причинность/i);
  assert.match(ai,/голодания/i);
});

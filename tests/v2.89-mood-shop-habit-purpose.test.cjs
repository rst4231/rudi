const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

const mood=read('api/daily-mood-store.cjs');
const moodCache=read('api/mood-analysis-store.cjs');
const partner=read('api/partner-message.js');
const score=read('api/score-store.cjs');
const habits=read('api/habit-tracker-store.cjs');
const habitsApi=read('api/habits.js');
const ui=read('public/mood-history.js');
const profile=read('public/profile-supplements.js');
const html=read('public/index.html');

test('reward shop v2.89 balance',()=>{
  assert.match(score,/order-food'[\s\S]*costUnits:250/);
  assert.match(score,/cooked-dish'[\s\S]*costUnits:700/);
  assert.match(score,/your-evening'[\s\S]*costUnits:850/);
  assert.match(score,/day-off'[\s\S]*costUnits:900/);
  assert.match(score,/20–30 минут/);
});

test('mood analysis uses Runtime Cache and Rustam is unlimited',()=>{
  assert.match(moodCache,/rudi-mood-analysis-v1/);
  assert.match(moodCache,/createStrictRuntimeCache/);
  assert.doesNotMatch(mood,/analyses/);
  assert.match(partner,/unlimitedAnalysis=actor==='Рустам'/);
  assert.match(partner,/replace:unlimitedAnalysis/);
});

test('mood history stores samples and computes daily average',()=>{
  assert.match(mood,/MAX_MOOD_SAMPLES_PER_DAY=48/);
  assert.match(mood,/function averageMood/);
  assert.match(mood,/sampleCount:entry\.samples\.length/);
  assert.match(partner,/mergeMoodHistoryWithActivity/);
  assert.match(partner,/recoveredFromActivity:true/);
});

test('mood UI renders rich text, therapist header and edge swipe',()=>{
  assert.match(ui,/Психотерапевт/);
  assert.match(ui,/mood-therapist-avatar/);
  assert.match(ui,/renderAnalysisText/);
  assert.match(ui,/installEdgeSwipe/);
  assert.match(ui,/Среднее настроение за день/);
  assert.match(html,/mood-history\.js\?v=2\.89/);
});

test('new habits require and display purpose',()=>{
  assert.match(habits,/purpose:cleanText\(value\.purpose,180\)/);
  assert.match(habits,/habit-purpose-required/);
  assert.match(habitsApi,/purpose:body\.purpose/);
  assert.match(profile,/Зачем тебе эта привычка\?/);
  assert.match(profile,/personal-habit-purpose/);
  assert.match(profile,/habitRequest\('add',\{name,purpose/);
});

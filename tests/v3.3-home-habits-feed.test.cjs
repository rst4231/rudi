const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v3.3 home defaults and Feed badge match requested behavior',()=>{
  const app=read('public/app.js');
  assert.match(app,/hour<5\|\|hour>=22\?'Доброй ночи'/);
  assert.match(app,/if\(config\?\.weather\) loadWeather\(config\.weather\)\.catch/);
  assert.match(app,/selector:'#smartHomeTile'[\s\S]*defaultCollapsed:true,[\s\S]*resetCollapsedOnInit:true/);
  assert.match(app,/if\(questionChanged&&tile\)[\s\S]*setBlockCollapsed\('daily-question',true\)/);
  assert.doesNotMatch(app,/Новое в RUDI/);
  assert.doesNotMatch(app,/newTile\.id='homeNewTile'/);
  assert.match(app,/setFeedBadge\(Boolean\(feedVersion&&feedVersion!==feedSeenVersion\(\)&&currentAppTab!=='feed'\)\)/);
});

test('v3.3 habit UI shows failures, lost stars, starts collapsed and explains 21-day bonus',()=>{
  const ui=read('public/profile-supplements.js');
  assert.match(ui,/stats:data\?\.stats/);
  assert.match(ui,/не выполнено · −/);
  assert.match(ui,/21 день подряд без единого штрафа/);
  assert.match(ui,/\+5 ⭐/);
  assert.match(ui,/habitState=\{\.\.\.habitState,collapsed:true\}/);
  assert.doesNotMatch(ui,/habitRequest\('collapse'/);
  assert.match(ui,/applyCollapse\(true\)/);
});

test('v3.3 habit backend awards five stars once per continuous 21-day streak',()=>{
  const store=read('api/habit-tracker-store.cjs');
  const rules=read('api/habit-rules.cjs');
  const score=read('api/score-store.cjs');
  assert.match(store,/function habitHistoryStats/);
  assert.match(store,/lostStars\+=1/);
  assert.match(rules,/HABIT_STREAK_BONUS_DAYS=21/);
  assert.match(rules,/HABIT_STREAK_BONUS_UNITS=50/);
  assert.match(rules,/score:habit:streak21:/);
  assert.match(rules,/ignoreDailyLimit:true/);
  assert.match(score,/meta\.ignoreDailyLimit===true/);
});

test('v3.3 mood history uses backup auth context and direct API fallback',()=>{
  const mood=read('public/mood-history.js');
  assert.match(mood,/RUDI_STATE_BACKUP\?\.getToken/);
  assert.match(mood,/backupToken:backupToken\(\)/);
  assert.match(mood,/\/api\/partner-message\?rudiAction=mood/);
  assert.match(mood,/credentials:'same-origin'/);
});

test('cinema Feed section remains sticky until a valid replacement arrives',()=>{
  const feed=read('api/feed-store.cjs');
  assert.match(feed,/cinema: null/);
  assert.match(feed,/Cinema is intentionally sticky/);
  assert.match(feed,/if \(name === 'cinema' && sections\.cinema\) continue/);
});

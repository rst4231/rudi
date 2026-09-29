const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.134 supplements support configured repeated daily intakes',()=>{
  const store=read('api/supplements-store.cjs'),advanced=read('public/supplement-advanced.js'),editor=read('public/supplement-editor.js');
  assert.match(store,/timesPerDay/);assert.match(store,/takenToday>=target/);
  assert.match(editor,/Приёмов в день/);assert.match(advanced,/Принято · '\+count\+'\/'\+target/);
});
test('v2.134 habit scoring is plus 0.2 and minus 1 star',()=>{
  const rules=read('api/habit-rules.cjs'),ui=read('public/profile-supplements.js'),cron=read('api/habit-reminder-cron.js');
  assert.match(rules,/HABIT_REWARD_UNITS=2/);assert.match(rules,/HABIT_PENALTY_UNITS=10/);
  assert.match(ui,/\+0,2 ⭐/);assert.match(ui,/−1 ⭐/);assert.match(cron,/−1 ⭐/);
});
test('v2.134 mood history uses one weekly strip instead of month grid',()=>{
  const mood=read('public/mood-history.js'),css=read('public/mood-history-v2101.css');
  assert.match(mood,/moodHistoryWeekStrip/);assert.match(mood,/for\(let offset=0;offset<7;offset\+\+\)/);
  assert.doesNotMatch(mood,/moodHistoryCalendar/);assert.match(css,/mood-history-week-strip/);assert.match(css,/mood-history-hero/);
});

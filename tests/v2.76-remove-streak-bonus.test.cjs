const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { awardScore, scoreView, resetMutationQueueForTests } = require('../api/score-store.cjs');

function memoryCache(initial=null) {
  let value=initial;
  return {
    async get(){ return value; },
    async set(_key,next){ value=next; return true; },
  };
}

test('streak bonus UI and API payload are removed', () => {
  const app = fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const scoreStore = fs.readFileSync(path.join(__dirname,'..','api','score-store.cjs'),'utf8');
  assert.doesNotMatch(app,/scoreStreakPanel|До бонуса|Максимальная серия 30 дней/);
  assert.doesNotMatch(scoreStore,/STREAK_BONUS_UNITS|applyStreakBonus\(|streakView\(/);
  const view=scoreView({}, {now:Date.parse('2026-09-28T08:00:00Z')});
  assert.equal(Object.prototype.hasOwnProperty.call(view,'streaks'),false);
});

test('three earning days do not add any streak bonus', async () => {
  resetMutationQueueForTests();
  const cache=memoryCache();
  const times=[
    Date.parse('2026-09-26T09:00:00Z'),
    Date.parse('2026-09-27T09:00:00Z'),
    Date.parse('2026-09-28T09:00:00Z'),
  ];
  let result;
  for(let i=0;i<times.length;i+=1){
    result=await awardScore('Рустам',10,{label:'Тест',dedupeKey:'score:no-streak:'+i},{scoreCache:cache,now:times[i]});
  }
  const view=scoreView(result.state,{now:times[2]});
  assert.equal(view.balances['Рустам'],3);
  assert.equal(view.lifetimeEarned['Рустам'],3);
  assert.equal(view.history.some((row)=>row.label==='Серия'||String(row.dedupeKey||'').startsWith('score:streak:')),false);
});

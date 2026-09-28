const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fastingRewardStars } = require('../api/fasting-store.cjs');
const { readScoreState, scoreView, HISTORY_RETENTION_DAYS, resetMutationQueueForTests } = require('../api/score-store.cjs');

function memoryCache(initial=null) {
  let value=initial;
  let sets=0;
  return {
    async get(){ return value; },
    async set(_key,next){ value=next; sets+=1; return true; },
    value(){ return value; },
    sets(){ return sets; },
  };
}

test('16 fasting hours award 1.5 stars and UI shows next reward countdown', () => {
  assert.equal(fastingRewardStars(16*60),1.5);
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  assert.match(app,/\{hours:16,stars:1\.5\}/);
  assert.match(app,/fastingNextRewardCountdown/);
  assert.match(html,/Следующая награда/);
});

test('score history is retained for 30 Moscow calendar days and old rows are persisted away', async () => {
  resetMutationQueueForTests();
  assert.equal(HISTORY_RETENTION_DAYS,30);
  const now=Date.parse('2026-09-28T09:00:00+03:00');
  const cache=memoryCache({
    initialized:true,
    version:10,
    balances:{'Рустам':50,'Диана':0},
    lifetimeEarned:{'Рустам':100,'Диана':0},
    dailyEarned:{
      '2026-09-28':{'Рустам':10,'Диана':0},
      '2026-08-30':{'Рустам':10,'Диана':0},
      '2026-08-29':{'Рустам':10,'Диана':0}
    },
    history:[
      {id:'new',actor:'Рустам',kind:'earn',units:10,requestedUnits:10,label:'Новое',dateKey:'2026-09-28',createdAt:'2026-09-28T06:00:00.000Z'},
      {id:'edge',actor:'Рустам',kind:'earn',units:10,requestedUnits:10,label:'Граница',dateKey:'2026-08-30',createdAt:'2026-08-30T06:00:00.000Z'},
      {id:'old',actor:'Рустам',kind:'earn',units:10,requestedUnits:10,label:'Старое',dateKey:'2026-08-29',createdAt:'2026-08-29T06:00:00.000Z'}
    ],
    redemptions:[
      {id:'active-old',buyerActor:'Рустам',rewardId:'movie',label:'Фильм',icon:'🎬',costUnits:150,createdAt:'2026-07-01T06:00:00.000Z'},
      {id:'done-old',buyerActor:'Рустам',rewardId:'coffee-tea',label:'Кофе',icon:'☕️',costUnits:80,createdAt:'2026-08-01T06:00:00.000Z',completedAt:'2026-08-29T06:00:00.000Z',completedBy:'Диана'}
    ]
  });
  const state=await readScoreState({scoreCache:cache,now});
  assert.deepEqual(state.history.map(row=>row.id),['new','edge']);
  assert.deepEqual(Object.keys(state.dailyEarned).sort(),['2026-08-30','2026-09-28']);
  assert.equal(state.redemptions.some(row=>row.id==='active-old'),true);
  assert.equal(state.redemptions.some(row=>row.id==='done-old'),false);
  assert.equal(cache.sets(),1);
  assert.equal(cache.value().history.some(row=>row.id==='old'),false);
  const view=scoreView(state,{now});
  assert.deepEqual(view.history.map(row=>row.id),['new','edge']);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { REWARDS, DAILY_LIMIT_UNITS, scoreView, awardScore, resetMutationQueueForTests } = require('../api/score-store.cjs');

const expected = [
  ['playlist', 5, 'Ты выбираешь музыку/плейлист в машине на весь день.'],
  ['coffee-tea', 8, 'Партнёр приготовит и принесёт тебе кофе или чай.'],
  ['dessert', 10, 'Ты выбираешь десерт или любимую вкусняшку.'],
  ['movie', 15, 'Ты выбираешь фильм для совместного просмотра.'],
  ['series', 15, 'Ты выбираешь сериал или серию на вечер.'],
  ['dinner', 25, 'Ты решаешь, что будет на ужин.'],
  ['breakfast', 30, 'Партнёр готовит и приносит завтрак в постель.'],
  ['order-food', 30, 'Ты выбираешь, что и откуда заказать.'],
  ['massage', 40, 'Домашний массаж от партнёра.'],
  ['small-surprise', 45, 'Партнёр придумывает для тебя небольшой сюрприз.'],
  ['home-date', 50, 'Партнёр организует уютное свидание дома.'],
  ['day-off', 80, 'На день освобождаешься от домашних обязанностей.'],
  ['date', 95, 'Ты выбираешь идею и формат следующего свидания.'],
  ['gift-3000', 99, 'Партнёр заказывает для тебя выбранный подарок стоимостью до 3 000 ₽.'],
];

test('reward shop contains all rewards with prices and descriptions', () => {
  assert.equal(REWARDS.length, expected.length);
  const view = scoreView({}, { now: Date.parse('2026-09-26T12:00:00Z') });
  const byId = new Map(view.rewards.map((row) => [row.id,row]));
  for(const [id,cost,description] of expected){
    const row=byId.get(id);
    assert.ok(row, 'missing '+id);
    assert.equal(row.cost,cost);
    assert.equal(row.description,description);
  }
});

test('reward shop stays sorted by star price', () => {
  const costs = REWARDS.map((row) => row.costUnits);
  assert.deepEqual(costs, [...costs].sort((a,b)=>a-b));
});


function memoryCache(initial=null) {
  let value=initial;
  return {
    async get(){ return value; },
    async set(_key,next){ value=next; return true; },
  };
}

test('daily star earning limit is 15 stars', () => {
  assert.equal(DAILY_LIMIT_UNITS,150);
  const view=scoreView({}, { now: Date.parse('2026-09-26T12:00:00Z') });
  assert.equal(view.today.limit,15);
});

test('daily star cap allows earning through 15 stars and caps anything above it', async () => {
  resetMutationQueueForTests();
  const now=Date.parse('2026-09-26T12:00:00Z');
  const cache=memoryCache({
    initialized:true,
    dailyEarned:{'2026-09-26':{'Рустам':140,'Диана':0}},
    balances:{'Рустам':140,'Диана':0},
    lifetimeEarned:{'Рустам':140,'Диана':0},
  });

  const first=await awardScore('Рустам',20,{label:'Тест',dedupeKey:'score:test:15-limit:first'},{scoreCache:cache,now});
  assert.equal(first.awardedUnits,10);
  assert.equal(first.capped,true);
  assert.equal(scoreView(first.state,{now}).today.earned['Рустам'],15);

  const second=await awardScore('Рустам',10,{label:'Тест',dedupeKey:'score:test:15-limit:second'},{scoreCache:cache,now:now+1000});
  assert.equal(second.awardedUnits,0);
  assert.equal(second.capped,true);
  assert.equal(scoreView(second.state,{now:now+1000}).today.earned['Рустам'],15);
});

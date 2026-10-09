const test = require('node:test');
const assert = require('node:assert/strict');
const { REWARDS, DAILY_LIMIT_UNITS, scoreView, awardScore, awardProductScore, redeemReward, resetMutationQueueForTests } = require('../api/score-store.cjs');

const expected = [
  ["movie", 3, "Ты выбираешь фильм или сериал для совместного просмотра."],
  ["dessert", 10, "Партнёр покупает для тебя выбранный десерт или вкусняшку стоимостью до 300 ₽."],
  ["telegram-premium", 11, "Партнёр дарит подписку Telegram Premium на 1 месяц."],
  ["breakfast", 20, "Партнёр готовит и приносит завтрак в постель."],
  ["small-surprise", 20, "Партнёр придумывает для тебя небольшой сюрприз стоимостью до 500 ₽."],
  ["favorite-dish", 35, "Партнёр сам готовит для тебя выбранное тобой блюдо."],
  ["massage", 40, "Домашний массаж от партнёра на 20–30 минут."],
  ["order-food", 50, "Ты выбираешь, что и откуда заказать."],
  ["gift-1500", 50, "Партнёр заказывает для тебя выбранный подарок стоимостью до 1500 ₽."],
  ["your-evening", 85, "Ты выбираешь, как провести вечер: фильм, игра, прогулка, еда или другое совместное занятие."],
  ["day-off", 90, "Партнёр берёт домашние дела на себя на один день."],
  ["gift-3000", 100, "Партнёр заказывает для тебя выбранный подарок стоимостью до 3000 ₽."],
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


test('home actions use the configured fractional star rewards', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const api = fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  const app = fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');

  assert.match(api,/reward:\{stars:0,awarded:false\}/);
  assert.match(api,/awardScoreSafe\(actor,1,\{\s*label:'Послание'/s);
  assert.match(api,/const walkRewardUnits=actor==='Рустам'\?20:10;/);
  assert.match(api,/awardScoreSafe\(actor,walkRewardUnits,\{label:'Прогулка с Лулу'/);
  assert.match(app,/Ответ сохранён/);

  const likeStart=api.indexOf("if (action === 'partner-message-like')");
  const likeEnd=api.indexOf("if (action === 'partner-message-read')",likeStart);
  assert.ok(likeStart>=0&&likeEnd>likeStart);
  const likeBlock=api.slice(likeStart,likeEnd);
  assert.doesNotMatch(likeBlock,/awardScoreSafe\(/);
  assert.match(likeBlock,/recordLikeActivity/);
});


test('movie and series are one shop reward and legacy series stays compatible', async () => {
  const movie=REWARDS.find((row)=>row.id==='movie');
  assert.ok(movie);
  assert.equal(movie.label,'Выбрать фильм или сериал');
  assert.equal(movie.costUnits,30);
  assert.equal(REWARDS.some((row)=>row.id==='series'),false);

  resetMutationQueueForTests();
  const now=Date.parse('2026-09-27T12:00:00Z');
  const cache=memoryCache({
    initialized:true,
    balances:{'Рустам':300,'Диана':0},
    lifetimeEarned:{'Рустам':300,'Диана':0},
    redemptions:[{
      id:'reward-legacy-series',
      buyerActor:'Рустам',
      rewardId:'series',
      label:'Выбрать сериал на вечер',
      icon:'📺',
      costUnits:150,
      createdAt:'2026-09-26T12:00:00.000Z'
    }]
  });

  await assert.rejects(
    ()=>redeemReward('Рустам','movie',{scoreCache:cache,now}),
    /score-reward-active/
  );
});


test('adding products no longer awards fractional stars', async () => {
  resetMutationQueueForTests();
  const now=Date.parse('2026-10-02T12:00:00Z');
  const cache=memoryCache({
    initialized:true,
    balances:{'Рустам':25,'Диана':10},
    lifetimeEarned:{'Рустам':25,'Диана':10},
    dailyEarned:{'2026-10-02':{'Рустам':5,'Диана':0}},
    history:[],
  });

  const result=await awardProductScore('Рустам','Молоко',{scoreCache:cache,now});
  assert.equal(result.awardedUnits,0);
  assert.equal(result.disabled,true);
  assert.equal(result.state.balances['Рустам'],25);
  assert.equal(result.state.lifetimeEarned['Рустам'],25);
  assert.equal(result.state.history.length,0);
});

test('products API does not call product score award when adding positions', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const api = fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  assert.doesNotMatch(api,/awardProductScoreSafe/);
  assert.doesNotMatch(api,/for\s*\(const item of addedItems\)\s*await awardProductScore/);
});

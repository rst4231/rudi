'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {REWARDS,scoreView,redeemReward,completeReward,resetMutationQueueForTests}=require('../api/score-store.cjs');
const expected=[
  [
    "movie",
    "Выбрать фильм или сериал",
    3
  ],
  [
    "dessert",
    "Десерт или вкусняшка до 300 ₽",
    10
  ],
  [
    "telegram-premium",
    "Telegram Premium на месяц",
    11
  ],
  [
    "breakfast",
    "Завтрак в постель",
    20
  ],
  [
    "small-surprise",
    "Маленький сюрприз до 500 ₽",
    20
  ],
  [
    "favorite-dish",
    "Любимое блюдо от партнёра",
    35
  ],
  [
    "massage",
    "Массаж 20–30 минут",
    40
  ],
  [
    "order-food",
    "Выбрать, что заказать поесть",
    50
  ],
  [
    "gift-1500",
    "Подарок до 1500 ₽",
    50
  ],
  [
    "your-evening",
    "Вечер по твоим правилам",
    85
  ],
  [
    "day-off",
    "День без домашних обязанностей",
    90
  ],
  [
    "gift-3000",
    "Подарок до 3000 ₽",
    100
  ]
];
const cache=(initial)=>{let value=initial;return {get:async()=>value,set:async(_k,next)=>{value=next;return true}}};
test('RUDI reward shop has exactly the 12 approved rewards in ascending price order',()=>{
 assert.deepEqual(REWARDS.map(r=>[r.id,r.label,r.costUnits/10]),expected);
 assert.deepEqual(scoreView({},{}).rewards.map(r=>[r.id,r.label,r.cost]),expected);
 assert.ok(!REWARDS.some(r=>r.id==='date'||r.id==='gift-500'));
});
test('removed rewards cannot be bought, but their existing redemptions remain completable',async()=>{
 resetMutationQueueForTests();const now=Date.parse('2026-10-09T09:00:00Z');
 const data={initialized:true,balances:{'Рустам':1000,'Диана':1000},redemptions:[{id:'old-date',buyerActor:'Рустам',rewardId:'date',label:'Выбрать свидание',icon:'💞',costUnits:1100,createdAt:'2026-10-08T09:00:00Z'}]};
 const store=cache(data);
 await assert.rejects(()=>redeemReward('Диана','date',{scoreCache:store,now}),/score-reward-invalid/);
 assert.equal(scoreView(data,{now}).activeRewards[0].rewardId,'date');
 const finished=await completeReward('Диана','old-date',{scoreCache:store,now});
 assert.equal(scoreView(finished.state,{now}).completedRewards[0].rewardId,'date');
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {REWARDS,scoreView}=require('../api/score-store.cjs');
const root=path.join(__dirname,'..');
test('removed reward ids cannot be redeemed and premium costs 50 stars',()=>{
  assert.ok(!REWARDS.some(item=>['playlist','coffee-tea','home-date'].includes(item.id)));
  const premium=REWARDS.find(item=>item.id==='telegram-premium');
  assert.ok(premium);
  assert.equal(premium.label,'Telegram Premium на месяц');
  assert.equal(premium.costUnits,500);
  assert.equal(scoreView({},{}).rewards.find(item=>item.id==='telegram-premium').cost,50);
});
test('rewards UI has no reward notification navigation',()=>{
  const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  const message=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');
  assert.ok(app.includes('data-score-tab="shop">Награды</button>'));
  assert.ok(app.includes("if(type==='reward-unlock') return '';"));
  assert.ok(!app.includes("if(type==='reward-unlock') return 'score';"));
  assert.match(message,/Открылась новая награда: /);
  assert.doesNotMatch(message,/Открылась новая награда в магазине/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {forecast}=require('../public/finance-decisions-core.js');
const now=new Date(2026,9,8,12);
const base={wallets:[{currency:'RUB',balance:30304,type:'regular'}],plan:{obligations:[{id:'rent',title:'Платежи',day:8,amount:33244,paidMonths:[]}]},personalExpenses:[],walletIncomes:[]};
test('missing income and spending never become a negative forecast',()=>{
  const f=forecast(base,now,30);
  assert.equal(f.predicted,null);assert.equal(f.estimated,false);
  assert.equal(f.opening,30304);assert.equal(f.knownShortfall,2940);
});
test('90-day obligations do not become a fabricated bank balance',()=>{
  const f=forecast(base,now,90);assert.equal(f.predicted,null);assert.equal(f.scheduledTotal,99732);
});
test('missing salary day leaves forecast unavailable',()=>{
  const f=forecast({...base,plan:{...base.plan,expectedMonthlyIncome:80000,plannedMonthlyVariableExpenses:20000}},now,30);
  assert.equal(f.predicted,null);assert.ok(f.missing.includes('день поступления дохода'));
});
test('configured planned salary, payday and variable spending enable scenario',()=>{
  const f=forecast({...base,plan:{...base.plan,expectedMonthlyIncome:80000,expectedIncomeDay:15,plannedMonthlyVariableExpenses:20000}},now,30);
  assert.equal(f.estimated,true);assert.equal(f.estimatedIncome,80000);assert.ok(f.predicted>0);
});
test('spent bills marked paid are not counted as new obligations',()=>{
  const f=forecast({...base,plan:{obligations:[{id:'rent',day:8,amount:33244,paidMonths:['2026-10']}]}},now,30);
  assert.equal(f.scheduledTotal,0);assert.equal(f.knownShortfall,0);
});
test('zero expected income is explicit, not a missing value',()=>{
  const f=forecast({...base,plan:{...base.plan,expectedMonthlyIncome:0,plannedMonthlyVariableExpenses:5000}},now,30);
  assert.equal(f.estimated,true);assert.equal(f.estimatedIncome,0);
});
test('credit and foreign currencies are not added to ruble balance',()=>{
  const f=forecast({...base,wallets:[...base.wallets,{currency:'USD',balance:5000},{type:'credit',currency:'RUB',balance:200000}]},now,30);
  assert.equal(f.opening,30304);assert.deepEqual(f.otherCurrencies,['USD']);
});
test('salary received today is not counted again in existing account balance',()=>{
  const f=forecast({...base,plan:{...base.plan,expectedMonthlyIncome:80000,expectedIncomeDay:8,plannedMonthlyVariableExpenses:10000}},now,7);
  assert.equal(f.estimatedIncome,0);
});
test('two complete expense months can replace manual variable-spend estimate',()=>{
  const f=forecast({...base,plan:{...base.plan,expectedMonthlyIncome:80000,expectedIncomeDay:15},
    personalExpenses:[{id:'a',month:'2026-08',rubAmount:10000},{id:'b',month:'2026-09',rubAmount:20000}]},now,30);
  assert.equal(f.estimated,true);assert.ok(f.estimatedVariableSpend>0);
});

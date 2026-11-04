'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../api/finance-store.cjs'),core=require('../public/finance-monthly-plan-core.js');
const now='2026-11-03T12:00:00Z';
function fixture(){
 let saved=store.normalizeState({initialized:true,version:3,categories:{'Рустам':[{id:'food',name:'Продукты',currency:'RUB',monthlyLimit:1000,monthlyLimits:{'2027-01':2000}}],'Диана':[{id:'other',name:'Еда Дианы',monthlyLimit:900}]},plans:{'Рустам':{expectedMonthlyIncome:50000,expectedIncomeDay:10}},personalExpenses:[{id:'food',actor:'Рустам',month:'2026-10',categoryId:'food',amount:1000,rubAmount:1000,occurredAt:'2026-10-12T09:00:00Z'}]});
 let writes=0;const options={now,financeCache:{get:async()=>structuredClone(saved),set:async(key,value)=>{writes++;saved=structuredClone(value)}}};
 return {options,get state(){return saved},get writes(){return writes},proposal(){return core.build({...store.viewState(saved,'Рустам'),actor:'Рустам'},now)}};
}
test('accepting a proposal saves only target-month actor limits and preserves other history',async()=>{
 assert.equal(typeof store.applyMonthlyFinancePlan,'function');const h=fixture(),p=h.proposal(),before=structuredClone(h.state);
 const next=await store.applyMonthlyFinancePlan('Рустам',{id:p.id,month:p.month},h.options);
 assert.equal(next.categories['Рустам'][0].monthlyLimits['2026-12'],1100);
 assert.equal(next.categories['Рустам'][0].monthlyLimit,1000);assert.equal(next.categories['Рустам'][0].monthlyLimits['2027-01'],2000);
 assert.deepEqual(next.categories['Диана'],before.categories['Диана']);assert.deepEqual(next.personalExpenses,before.personalExpenses);assert.deepEqual(next.wallets,before.wallets);
});
test('concurrent/repeated acceptance is idempotent',async()=>{
 assert.equal(typeof store.applyMonthlyFinancePlan,'function');const h=fixture(),p=h.proposal();
 await Promise.all([1,2].map(()=>store.applyMonthlyFinancePlan('Рустам',{id:p.id,month:p.month},h.options)));
 assert.equal(h.writes,1);assert.equal(h.state.version,4);
});
test('a stale preview or another month cannot overwrite newer settings',async()=>{
 assert.equal(typeof store.applyMonthlyFinancePlan,'function');const h=fixture(),p=h.proposal();
 await store.updateExpenseCategory('Рустам',{id:'food',monthlyLimit:1400},h.options);
 await assert.rejects(store.applyMonthlyFinancePlan('Рустам',{id:p.id,month:p.month},h.options),/monthly-plan-stale/);
 assert.equal(h.state.categories['Рустам'][0].monthlyLimit,1400);assert.equal(h.state.categories['Рустам'][0].monthlyLimits['2026-12'],undefined);
 const fresh=h.proposal();await assert.rejects(store.applyMonthlyFinancePlan('Рустам',{id:fresh.id,month:'2026-11'},h.options),/monthly-plan-stale/);
});
test('unrelated state version changes do not invalidate the same proposal',async()=>{
 const h=fixture(),p=h.proposal();await store.saveFinancePlan('Диана',{expectedMonthlyIncome:9000},h.options);
 assert.equal(h.proposal().id,p.id);await store.applyMonthlyFinancePlan('Рустам',{id:p.id,month:p.month},h.options);assert.equal(h.state.categories['Рустам'][0].monthlyLimits[p.month],1100);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {partnerFinanceSummary}=require('../api/partner-finances.cjs');
const rows=[
 {actor:'Диана',month:'2026-10',amount:100,rubAmount:100,categoryId:'food',occurredAt:'2026-10-26T12:00:00Z'},
 {actor:'Диана',month:'2026-10',amount:20,sourceAmount:20,sourceCurrency:'USD',rubAmount:1800,categoryId:'food',note:'Покупка',occurredAt:'2026-10-21T12:00:00Z'},
 {actor:'Диана',month:'2026-09',amount:9000,rubAmount:9000,occurredAt:'2026-09-30T12:00:00Z'},
 {actor:'Рустам',month:'2026-10',amount:99999,rubAmount:99999,occurredAt:'2026-10-27T12:00:00Z'},
 {actor:'Диана',month:'2026-10',amount:5000,rubAmount:5000,manualAdjustment:true,occurredAt:'2026-10-27T12:00:00Z'}
];
test('partner summary uses only partner data, latest real expense and biggest monthly purchase in RUB',()=>{
 const state={personalExpenses:rows,categories:{'Диана':[{id:'food',name:'Еда',monthlyLimit:10000},{id:'old',monthlyLimit:99999,archived:true}]}};
 const s=partnerFinanceSummary(state,'Рустам','2026-10');
 assert.equal(s.partner,'Диана');assert.equal(s.expense.amount,100);assert.equal(s.largestPurchase.amount,20);assert.equal(s.largestPurchase.note,'Покупка');
 assert.equal(s.budget.plannedLimit,10000);assert.equal(s.budget.actualSpent,6900);assert.equal(s.budget.spentPercent,69);
});
test('empty and unconfigured budget stays distinct from zero spending',()=>{
 const s=partnerFinanceSummary({},'Диана','2026-10');assert.equal(s.partner,'Рустам');assert.equal(s.expense,null);assert.equal(s.largestPurchase,null);assert.equal(s.budget.plannedLimit,0);
});
test('month follows Moscow date at UTC month boundary',()=>{
 const s=partnerFinanceSummary({},'Рустам',new Date('2026-10-31T21:30:00Z'));assert.equal(s.month,'2026-11');
});

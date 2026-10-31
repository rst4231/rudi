const test=require('node:test');
const assert=require('node:assert/strict');
const {partnerFinanceSummary,selfFinanceSummary}=require('../api/partner-finances.cjs');
const state={
 categories:{'Рустам':[{id:'food',name:'Еда',monthlyLimit:10000}], 'Диана':[{id:'gift',name:'Подарки',monthlyLimit:2000}]},
 personalExpenses:[
  {actor:'Рустам',month:'2026-10',categoryId:'food',amount:450,rubAmount:450,occurredAt:'2026-10-25T15:04:00+03:00'},
  {actor:'Рустам',month:'2026-10',categoryId:'food',amount:30000,rubAmount:30000,occurredAt:'2026-10-21T12:00:00+03:00'},
  {actor:'Рустам',month:'2026-10',amount:99000,rubAmount:99000,manualAdjustment:true,occurredAt:'2026-10-26T11:00:00+03:00'},
  {actor:'Диана',month:'2026-10',categoryId:'gift',amount:900,rubAmount:900,occurredAt:'2026-10-27T15:00:00+03:00'},
  {actor:'Рустам',month:'2026-09',categoryId:'food',amount:80000,rubAmount:80000,occurredAt:'2026-09-29T12:00:00+03:00'}
 ]
};
test('self summary shows only own real latest and largest expense, no budget',()=>{
 const r=selfFinanceSummary(state,'Рустам','2026-10');
 assert.equal(r.actor,'Рустам');assert.equal(r.expense.amount,450);assert.equal(r.expense.category,'Еда');assert.equal(r.largestPurchase.amount,30000);
 assert.equal(Object.hasOwn(r,'budget'),false);assert.equal(Object.hasOwn(r,'partner'),false);
});
test('self summary isolates account and handles empty purchases',()=>{
 const d=selfFinanceSummary(state,'Диана','2026-10');
 assert.equal(d.expense.amount,900);assert.equal(d.largestPurchase.amount,900);
 const empty=selfFinanceSummary(state,'Диана','2026-11');
 assert.equal(empty.largestPurchase,null);assert.equal(empty.expense.amount,900);
});
test('partner summary contract still includes partner budget',()=>{
 const p=partnerFinanceSummary(state,'Диана','2026-10');
 assert.equal(p.partner,'Рустам');assert.equal(p.largestPurchase.amount,30000);
 assert.equal(p.budget.plannedLimit,10000);assert.equal(p.budget.actualSpent,129450);
});

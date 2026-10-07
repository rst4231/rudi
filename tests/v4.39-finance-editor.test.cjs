const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  readFinanceState, viewState, resetMutationQueueForTests,
  saveExpenseCategory, savePersonalExpense, updateExpenseCategory,
}=require('../api/finance-store.cjs');

function memoryCache(){
  let value=null;
  return {
    async get(){return value;},
    async set(_key,next){value=structuredClone(next);return true;},
  };
}

test('v4.39 category spent correction can lower and raise current total',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveExpenseCategory('Рустам',{name:'Тест v439',icon:'🍽️',monthlyLimit:10000},{financeCache,id:'cat-food'});
  await savePersonalExpense('Рустам',{
    month:'2026-10',categoryId:'cat-food',amount:3000,rubAmount:3000,occurredAt:'2026-10-07T10:00:00.000Z'
  },{financeCache,id:'expense-food'});
  await updateExpenseCategory('Рустам',{id:'cat-food',spent:1500,month:'2026-10'},{financeCache});
  let view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.personalMonths.find(row=>row.month==='2026-10').expenses,1500);
  assert.equal(view.personalExpenses.filter(row=>row.manualAdjustment).length,1);
  assert.equal(view.personalExpenses.find(row=>row.manualAdjustment).rubAmount,-1500);
  await updateExpenseCategory('Рустам',{id:'cat-food',spent:4200,month:'2026-10'},{financeCache});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.personalMonths.find(row=>row.month==='2026-10').expenses,4200);
  assert.equal(view.personalExpenses.find(row=>row.manualAdjustment).rubAmount,1200);
});

test('v4.39 finance UI contains wallet reorder, iPhone fixes and remaining plan formula',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(html.includes('financeWalletMoveLeft'));
  assert.ok(html.includes('financeCategorySpent'));
  assert.ok(app.includes('plannedLimit-actualSpent'));
  assert.ok(app.includes("plannedTotal.classList.toggle('is-over-limit',plannedRemaining<0)"));
  assert.ok(css.includes('.finance-wallet-list .finance-coin-amount'));
  assert.ok(css.includes('.finance-expense-datetime-grid .finance-text-input'));
});

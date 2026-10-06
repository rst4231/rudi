const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const {
  normalizeState, viewState, expenseTotal,
  savePersonalIncome, savePersonalExpense, deleteExpenseCategory,
  resetMutationQueueForTests,
}=require('../api/finance-store.cjs');

function memoryCache(initial=null){
  let value=initial;
  return {
    async get(){return value},
    async set(_key,next){value=JSON.parse(JSON.stringify(next));return true},
    value(){return value},
  };
}

test('deleting a category removes its expenses and recalculates the month',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache(null);
  await savePersonalIncome('Рустам','2026-10',100000,{financeCache,now:'2026-10-06T12:00:00Z'});
  let state=normalizeState(financeCache.value());
  const food=state.categories['Рустам'].find(row=>row.name==='Еда');
  assert.ok(food);

  await savePersonalExpense('Рустам',{
    month:'2026-10',categoryId:food.id,amount:15000,note:'Продукты'
  },{financeCache,id:'expense-food',now:'2026-10-06T13:00:00Z'});

  await deleteExpenseCategory('Рустам',food.id,{financeCache,now:'2026-10-06T14:00:00Z'});
  state=normalizeState(financeCache.value());

  assert.equal(state.categories['Рустам'].some(row=>row.id===food.id),false);
  assert.equal(state.personalExpenses.some(row=>row.id==='expense-food'),false);
  assert.equal(expenseTotal(state,'Рустам','2026-10'),0);
  const month=viewState(state,'Рустам').personalMonths.find(row=>row.month==='2026-10');
  assert.equal(month.income,100000);
  assert.equal(month.expenses,0);
  assert.equal(month.balance,100000);
});

test('an explicitly empty category list stays empty',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache(null);
  let state=normalizeState(await financeCache.get());
  for(const category of [...state.categories['Рустам']]){
    await deleteExpenseCategory('Рустам',category.id,{financeCache});
  }
  state=normalizeState(financeCache.value());
  assert.deepEqual(state.categories['Рустам'],[]);
  assert.deepEqual(viewState(state,'Рустам').categories,[]);
});

test('finance category UI has delete but no category limit, category note or analyst actions',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const ai=fs.readFileSync('api/finance-ai.cjs','utf8');

  assert.ok(app.includes("financeRequest('delete-category'"));
  assert.ok(app.includes('Все расходы внутри неё тоже будут удалены'));
  assert.ok(!app.includes("limitCaption.textContent='Лимит в месяц'"));
  assert.ok(!app.includes("noteCaption.textContent='Заметка категории'"));
  assert.ok(!app.includes("['Что делать',Array.isArray(report.actions)"));
  assert.ok(!html.includes('расходы по категориям, лимиты и долги'));
  assert.ok(!ai.includes("actions: { type: 'array'"));
  assert.ok(!ai.includes("'actions — приоритетные практические действия"));
});

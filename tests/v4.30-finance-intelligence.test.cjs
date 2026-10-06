const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const {
  DEFAULT_CATEGORIES, normalizeState, viewState, expenseTotal,
  savePersonalIncome, saveExpenseCategory, updateExpenseCategory, savePersonalExpense,
  resetMutationQueueForTests,
}=require('../api/finance-store.cjs');
const { moscowDateKey, similarity }=require('../api/finance-ai.cjs');

function memoryCache(initial=null){
  let value=initial;
  return {
    async get(){return value},
    async set(_key,next){value=JSON.parse(JSON.stringify(next));return true},
    value(){return value},
  };
}

test('personal finance starts with five default expense categories',()=>{
  const state=normalizeState(null);
  assert.deepEqual(state.categories['Рустам'].map(row=>row.name),['Жильё','Транспорт','Еда','Развлечения','Покупки']);
  assert.equal(DEFAULT_CATEGORIES.length,5);
});

test('categorized expenses drive monthly spending and balance',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache(null);
  await savePersonalIncome('Рустам','2026-10',100000,{financeCache,now:'2026-10-06T12:00:00Z'});
  let state=normalizeState(financeCache.value());
  const food=state.categories['Рустам'].find(row=>row.name==='Еда');
  assert.ok(food);

  await updateExpenseCategory('Рустам',{id:food.id,monthlyLimit:25000,note:'Продукты и кафе'},{financeCache});
  await savePersonalExpense('Рустам',{month:'2026-10',categoryId:food.id,amount:12000,note:'Продукты'},{financeCache,id:'expense-1',now:'2026-10-06T13:00:00Z'});
  await savePersonalExpense('Рустам',{month:'2026-10',categoryId:food.id,amount:3000,note:'Кафе'},{financeCache,id:'expense-2',now:'2026-10-06T14:00:00Z'});

  state=normalizeState(financeCache.value());
  assert.equal(expenseTotal(state,'Рустам','2026-10'),15000);
  const view=viewState(state,'Рустам');
  const month=view.personalMonths.find(row=>row.month==='2026-10');
  assert.equal(month.income,100000);
  assert.equal(month.expenses,15000);
  assert.equal(month.balance,85000);
  assert.equal(view.categories.find(row=>row.id===food.id).monthlyLimit,25000);
  assert.equal(view.categories.find(row=>row.id===food.id).note,'Продукты и кафе');
});

test('new categories are actor-specific',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache(null);
  await saveExpenseCategory('Диана',{name:'Красота',icon:'💄'},{financeCache,id:'beauty',now:'2026-10-06T10:00:00Z'});
  const state=normalizeState(financeCache.value());
  assert.ok(viewState(state,'Диана').categories.some(row=>row.name==='Красота'));
  assert.ok(!viewState(state,'Рустам').categories.some(row=>row.name==='Красота'));
});

test('finance literacy helpers use Moscow day and detect similar topics',()=>{
  assert.equal(moscowDateKey(new Date('2026-10-06T22:30:00Z')),'2026-10-07');
  assert.ok(similarity('Подушка безопасности и резерв на плохой месяц','Как создать резерв и финансовую подушку')>0.2);
});

test('finance UI contains literacy, analyst and autosaved categories without personal history block',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');

  assert.ok(html.includes('data-finance-tab="literacy"'));
  assert.ok(html.includes('id="financeAnalystButton"'));
  assert.ok(html.includes('id="financeCategoryList"'));
  assert.ok(html.includes('id="financeExpenseMonthTotal"'));
  assert.ok(!html.includes('id="financePersonalSaveButton"'));
  assert.ok(!html.includes('id="financePersonalHistoryTitle"'));

  assert.ok(app.includes("financeRequest('save-personal-income'"));
  assert.ok(app.includes("financeRequest('update-category'"));
  assert.ok(app.includes("financeRequest('save-expense'"));
  assert.ok(app.includes("financeRequest('analyst'"));
  assert.ok(app.includes("page.dataset.financeTone=activeFinanceTab"));

  assert.ok(css.includes('.finance-page[data-finance-tone="personal"]'));
  assert.ok(css.includes('.finance-page[data-finance-tone="debts"]'));
  assert.ok(css.includes('.finance-analyst-card'));
});

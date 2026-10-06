const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
  DEFAULT_EXPENSE_CATEGORIES,normalizeState,viewState,savePersonalIncome,saveExpenseCategoryMonth,resetMutationQueueForTests,
}=require('../api/finance-store.cjs');
const {tooSimilar,fallbackAnalyst}=require('../api/finance-ai.cjs');

function memoryCache(initial=null){
  let value=initial;
  return {
    get:async()=>value,
    set:async(_key,next)=>{value=next;return true},
    read:()=>value,
  };
}

test('v4.30 personal finance defaults, limits and notes are stored by month',async()=>{
  resetMutationQueueForTests();
  const normalized=normalizeState({});
  assert.deepEqual(normalized.expenseCategories['Рустам'].map(row=>row.name),['Жильё','Транспорт','Еда','Развлечения','Покупки']);
  assert.equal(DEFAULT_EXPENSE_CATEGORIES.length,5);

  const cache=memoryCache();
  await savePersonalIncome('Рустам','2026-10',100000,{cache,now:'2026-10-06T12:00:00Z'});
  const state=await saveExpenseCategoryMonth('Рустам','2026-10',{
    housing:{amount:35000,limit:40000,note:'Аренда'},
    food:{amount:12000,limit:20000,note:'Продукты и кафе'},
  },{cache,now:'2026-10-06T12:01:00Z'});
  const view=viewState(state,'Рустам');
  assert.equal(view.personalMonths[0].income,100000);
  assert.equal(view.personalMonths[0].expenses,47000);
  assert.equal(view.personalMonths[0].balance,53000);
  const month=view.expenseCategoryMonths.find(row=>row.month==='2026-10');
  assert.deepEqual(month.entries.housing,{amount:35000,limit:40000,note:'Аренда'});
  assert.deepEqual(month.entries.food,{amount:12000,limit:20000,note:'Продукты и кафе'});
});

test('v4.30 finance UI has literacy, category autosave and no personal history',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(html,/data-finance-tab="literacy"/);
  assert.match(html,/id="financeExpenseCategoryList"/);
  assert.match(html,/id="financePersonalExpensesValue"/);
  assert.match(html,/id="financeAnalystButton"/);
  assert.match(html,/Финансовый аналитик/);
  assert.doesNotMatch(html,/id="financePersonalHistoryTitle"/);
  assert.doesNotMatch(html,/id="financePersonalExpensesInput"/);
  assert.doesNotMatch(html,/id="financePersonalSaveButton"/);
  assert.match(app,/save-income/);
  assert.match(app,/save-expense-category-month/);
  assert.match(app,/scheduleFinanceExpenseSave/);
  assert.match(css,/data-finance-theme="personal"/);
  assert.match(css,/data-finance-theme="debts"/);
});

test('v4.30 literacy anti-repeat recognizes similar topics',()=>{
  assert.equal(tooSimilar(
    {topicKey:'emergency-fund',title:'Зачем нужна финансовая подушка',summary:'Резерв защищает от срочных решений'},
    [{topicKey:'emergency-fund',title:'Подушка безопасности',summary:'Резерв нужен на непредвиденные расходы'}]
  ),true);
});


test('v4.30 financial analyst uses personal flow, category limits and debts',()=>{
  const result=fallbackAnalyst({
    row:{income:100000,expenses:78000,balance:22000},
    profile:{reserve:50000,goalTitle:'Квартира',goalTarget:1000000,goalCurrent:200000},
    categories:[{id:'food',name:'Еда'}],
    categoryMonth:{entries:{food:{amount:28000,limit:20000,note:'Много кафе'}}},
    debts:[{direction:'owe',counterparty:'Банк',amount:30000,note:'Рассрочка',paid:false}],
    article:{title:'Почему лимиты помогают бюджету'},
  });
  assert.match(result.overview,/финанс|месяц|положитель/i);
  assert.ok(result.priorities.some(item=>/лимит|обязательств|остаток/i.test(item)));
  assert.ok(result.actions.length>=1);
  assert.match(result.articleConnection,/стать/i);
});

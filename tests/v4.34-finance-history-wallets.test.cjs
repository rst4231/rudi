const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  readFinanceState, viewState, resetMutationQueueForTests,
  saveWallet, saveExpenseCategory, savePersonalExpense, deletePersonalExpense,
  archiveExpenseCategory, reorderExpenseCategories, importPersonalExpenses,
} = require('../api/finance-store.cjs');

function memoryCache() {
  let value = null;
  return {
    async get() { return value; },
    async set(_key, next) { value = structuredClone(next); return true; },
  };
}

test('wallet expense keeps timestamp, subtracts source currency and refunds on deletion', async () => {
  resetMutationQueueForTests();
  const financeCache = memoryCache();

  await saveWallet('Рустам', { name:'USD карта', icon:'💳', currency:'USD', balance:100 }, { financeCache, id:'wallet-usd', now:Date.UTC(2026,9,7,8,0) });
  await saveExpenseCategory('Рустам', { name:'Еда', icon:'🍽️' }, { financeCache, id:'cat-food', now:Date.UTC(2026,9,7,8,0) });
  await savePersonalExpense('Рустам', {
    month:'2026-10', categoryId:'cat-food', amount:8000, note:'Обед',
    occurredAt:'2026-10-07T09:15:00.000Z',
    walletId:'wallet-usd', sourceAmount:100, sourceCurrency:'USD', exchangeRate:80,
  }, { financeCache, id:'expense-1', now:Date.UTC(2026,9,7,9,16) });

  let view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets[0].balance,0);
  assert.equal(view.personalExpenses[0].occurredAt,'2026-10-07T09:15:00.000Z');
  assert.equal(view.personalExpenses[0].amount,8000);
  assert.equal(view.personalExpenses[0].sourceAmount,100);
  assert.equal(view.personalExpenses[0].sourceCurrency,'USD');

  await deletePersonalExpense('Рустам','expense-1',{financeCache,now:Date.UTC(2026,9,7,10,0)});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets[0].balance,100);
  assert.equal(view.personalExpenses.length,0);
});

test('archiving category hides its icon and preserves history', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveExpenseCategory('Рустам',{name:'Такси',icon:'🚕'},{financeCache,id:'cat-taxi',now:Date.UTC(2026,9,7)});
  await savePersonalExpense('Рустам',{
    month:'2026-10',categoryId:'cat-taxi',amount:900,note:'Домой',occurredAt:'2026-10-07T20:30:00.000Z'
  },{financeCache,id:'expense-taxi',now:Date.UTC(2026,9,7,20,31)});
  await archiveExpenseCategory('Рустам','cat-taxi',{financeCache,now:Date.UTC(2026,9,7,21,0)});

  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.categories.some(row=>row.id==='cat-taxi'),false);
  assert.equal(view.archivedCategories.some(row=>row.id==='cat-taxi'),true);
  assert.equal(view.personalExpenses.some(row=>row.id==='expense-taxi'),true);
});

test('category order is persisted', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveExpenseCategory('Рустам',{name:'A',icon:'A'},{financeCache,id:'cat-a'});
  await saveExpenseCategory('Рустам',{name:'B',icon:'B'},{financeCache,id:'cat-b'});
  await reorderExpenseCategories('Рустам',['cat-b','cat-a'],{financeCache});
  const ids=viewState(await readFinanceState({financeCache}),'Рустам').categories.map(row=>row.id);
  assert.deepEqual(ids.slice(-2),['cat-b','cat-a']);
});

test('CoinKeeper-style bulk import auto-creates categories and ignores duplicate import keys', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  const rows=[
    {categoryName:'Кофе',amount:350,month:'2026-10',occurredAt:'2026-10-06T07:30:00.000Z',note:'Латте',importKey:'coinkeeper:1'},
    {categoryName:'Транспорт',amount:120,month:'2026-10',occurredAt:'2026-10-06T08:00:00.000Z',note:'Метро',importKey:'coinkeeper:2'},
  ];
  let result=await importPersonalExpenses('Рустам',rows,{financeCache,now:Date.UTC(2026,9,7)});
  assert.equal(result.result.imported,2);
  assert.ok(result.result.createdCategories.includes('Кофе'));

  result=await importPersonalExpenses('Рустам',rows,{financeCache,now:Date.UTC(2026,9,7)});
  assert.equal(result.result.imported,0);
  assert.equal(result.result.duplicates,2);

  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.personalExpenses.length,2);
  assert.ok(view.categories.some(row=>row.name==='Кофе'));
});

test('v4.34 finance UI includes date grouping, CoinKeeper import, wallets and edit mode', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  const ai=fs.readFileSync(path.join(__dirname,'..','api','finance-ai.cjs'),'utf8');

  for (const marker of [
    'financeExpenseComposerDate','financeExpenseComposerTime','finance-expense-day-group',
    'coinKeeperRowsFromCsv','import-expenses','renderFinanceWallets','reorder-categories',
    'finance-category-delete-badge','archive-category'
  ]) {
    assert.ok(app.includes(marker)||html.includes(marker)||css.includes(marker),marker);
  }
  assert.ok(ai.includes('Никогда не упоминай имя пользователя'));
  assert.ok(ai.includes('у вас в октябре'));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  splitAmounts, personalAmounts, readFinanceState, saveFinanceMonth, savePersonalMonth, saveDebt, toggleDebt, viewState, resetMutationQueueForTests,
} = require('../api/finance-store.cjs');

function memoryCache() {
  let value = null;
  return {
    async get() { return value; },
    async set(_key, next) { value = structuredClone(next); return true; },
  };
}

test('finance split is 40/60 from rent + utilities', () => {
  assert.deepEqual(splitAmounts(35000, 5000), { total: 40000, diana: 16000, rustam: 24000 });
});
test('finance state is shared and only Rustam can save shared month', async () => {
  resetMutationQueueForTests();
  const financeCache = memoryCache();
  await saveFinanceMonth('Рустам', '2026-10', 35000, 4200, { financeCache, now: Date.UTC(2026, 9, 6) });
  const view = viewState(await readFinanceState({ financeCache }), 'Рустам');
  assert.equal(view.months[0].total, 39200);
  assert.equal(view.months[0].diana, 15680);
  assert.equal(view.months[0].rustam, 23520);
  await assert.rejects(() => saveFinanceMonth('Диана', '2026-10', 1, 1, { financeCache }), /finance-owner-only/);
});
test('personal finances are isolated by actor', async () => {
  resetMutationQueueForTests();
  const financeCache = memoryCache();
  await savePersonalMonth('Рустам','2026-10',100000,42000,{financeCache,now:Date.UTC(2026,9,6)});
  await savePersonalMonth('Диана','2026-10',80000,31000,{financeCache,now:Date.UTC(2026,9,6)});
  assert.deepEqual(personalAmounts(100000,42000),{income:100000,expenses:42000,balance:58000});
  assert.equal(viewState(await readFinanceState({financeCache}),'Рустам').personalMonths[0].expenses,42000);
  assert.equal(viewState(await readFinanceState({financeCache}),'Диана').personalMonths[0].expenses,31000);
});
test('debts belong to actor and can be marked paid', async () => {
  resetMutationQueueForTests();
  const financeCache = memoryCache();
  await saveDebt('Рустам',{direction:'owe',counterparty:'Иван',amount:5000,note:'тест'},{financeCache,id:'debt-1',now:Date.UTC(2026,9,6)});
  let view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.debts.length,1);assert.equal(view.debts[0].paid,false);
  await toggleDebt('Рустам','debt-1',true,{financeCache,now:Date.UTC(2026,9,7)});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.debts[0].paid,true);
});


test('personal finances and debts are private to their author', async () => {
  resetMutationQueueForTests();
  const financeCache = memoryCache();

  await savePersonalMonth('Рустам','2026-10',120000,45000,{financeCache,now:Date.UTC(2026,9,6)});
  await savePersonalMonth('Диана','2026-10',90000,30000,{financeCache,now:Date.UTC(2026,9,6)});
  await saveDebt('Рустам',{direction:'owe',counterparty:'Иван',amount:5000},{financeCache,id:'rustam-debt',now:Date.UTC(2026,9,6)});
  await saveDebt('Диана',{direction:'owed',counterparty:'Анна',amount:3000},{financeCache,id:'diana-debt',now:Date.UTC(2026,9,6)});

  const rustamView=viewState(await readFinanceState({financeCache}),'Рустам');
  const dianaView=viewState(await readFinanceState({financeCache}),'Диана');

  assert.deepEqual(rustamView.personalMonths.map(row=>row.expenses),[45000]);
  assert.deepEqual(dianaView.personalMonths.map(row=>row.expenses),[30000]);

  assert.deepEqual(rustamView.debts.map(row=>row.id),['rustam-debt']);
  assert.deepEqual(dianaView.debts.map(row=>row.id),['diana-debt']);

  assert.equal(rustamView.debts.some(row=>row.id==='diana-debt'),false);
  assert.equal(dianaView.debts.some(row=>row.id==='rustam-debt'),false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  splitAmounts, readFinanceState, saveFinanceMonth, viewState, resetMutationQueueForTests,
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

test('finance state is shared and only Rustam can save', async () => {
  resetMutationQueueForTests();
  const financeCache = memoryCache();
  await saveFinanceMonth('Рустам', '2026-10', 35000, 4200, { financeCache, now: Date.UTC(2026, 9, 6) });
  const state = await readFinanceState({ financeCache });
  const view = viewState(state);
  assert.equal(view.months.length, 1);
  assert.equal(view.months[0].month, '2026-10');
  assert.equal(view.months[0].total, 39200);
  assert.equal(view.months[0].diana, 15680);
  assert.equal(view.months[0].rustam, 23520);
  await assert.rejects(() => saveFinanceMonth('Диана', '2026-10', 1, 1, { financeCache }), /finance-owner-only/);
});

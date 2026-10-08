const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  saveWallet, saveWalletIncome, deleteWalletIncome, readFinanceState, viewState,
  resetMutationQueueForTests,
} = require('../api/finance-store.cjs');
const cache = () => {
  let state = null;
  return {
    async get() { return state; },
    async set(_key, next) { state = structuredClone(next); return true; },
  };
};
test('v4.86 income edits change wallet by difference and deleting reverses credit', async () => {
  resetMutationQueueForTests();
  const financeCache = cache(), opts = { financeCache };
  await saveWallet('Рустам', { name: 'Income editing', currency: 'RUB', balance: 1000 }, { ...opts, id: 'v486-wallet-a' });
  const base = { walletId: 'v486-wallet-a', month: '2026-10', exchangeRate: 1, occurredAt: '2026-10-08T09:00:00.000Z' };
  await saveWalletIncome('Рустам', { ...base, amount: 300, rubAmount: 300, note: 'Было' }, { ...opts, id: 'v486-income' });
  let view = viewState(await readFinanceState(opts), 'Рустам');
  assert.equal(view.wallets.find(x=>x.id==='v486-wallet-a').balance, 1300);
  await saveWalletIncome('Рустам', { ...base, id: 'v486-income', amount: 500, rubAmount: 500, note: 'Стало' }, opts);
  view = viewState(await readFinanceState(opts), 'Рустам');
  assert.equal(view.wallets.find(x=>x.id==='v486-wallet-a').balance, 1500);
  assert.equal(view.walletIncomes.length, 1);
  assert.equal(view.walletIncomes[0].note, 'Стало');
  assert.equal(view.personalMonths.find(x=>x.month==='2026-10').income, 500);
  await saveWalletIncome('Рустам', { ...base, id: 'v486-income', amount: 100, rubAmount: 100 }, opts);
  view = viewState(await readFinanceState(opts), 'Рустам');
  assert.equal(view.wallets.find(x=>x.id==='v486-wallet-a').balance, 1100);
  assert.equal(view.personalMonths.find(x=>x.month==='2026-10').income, 100);
  await deleteWalletIncome('Рустам', 'v486-income', opts);
  view = viewState(await readFinanceState(opts), 'Рустам');
  assert.equal(view.wallets.find(x=>x.id==='v486-wallet-a').balance, 1000);
  assert.equal(view.walletIncomes.length, 0);
  assert.equal(view.personalMonths.find(x=>x.month==='2026-10').income, 0);
});
test('v4.86 income edit cannot credit another wallet or modify another actor entry', async () => {
  resetMutationQueueForTests();
  const opts = { financeCache: cache() };
  await saveWallet('Рустам', { name:'A', currency:'RUB', balance:0 }, { ...opts, id:'v486-a' });
  await saveWallet('Рустам', { name:'B', currency:'RUB', balance:0 }, { ...opts, id:'v486-b' });
  await saveWalletIncome('Рустам', { walletId:'v486-a',month:'2026-10', amount:300,rubAmount:300,exchangeRate:1 }, { ...opts,id:'v486-income' });
  await assert.rejects(
    saveWalletIncome('Рустам', { id:'v486-income', walletId:'v486-b', month:'2026-10', amount:100,rubAmount:100,exchangeRate:1 }, opts),
    /finance-wallet-income-wallet-change-invalid/,
  );
  await assert.rejects(
    saveWalletIncome('Диана', { id:'v486-income', walletId:'v486-a', month:'2026-10', amount:100,rubAmount:100,exchangeRate:1 }, opts),
    /finance-wallet-income-not-found/,
  );
  const view = viewState(await readFinanceState(opts), 'Рустам');
  assert.equal(view.wallets.find(x=>x.id==='v486-a').balance, 300);
  assert.equal(view.wallets.find(x=>x.id==='v486-b').balance, 0);
});
test('v4.86 history has date range inputs, edit/delete controls and immediate expense visibility', () => {
  const app = fs.readFileSync(path.join(__dirname,'..','public/app.js'),'utf8');
  const html = fs.readFileSync(path.join(__dirname,'..','public/index.html'),'utf8');
  const css = fs.readFileSync(path.join(__dirname,'..','public/app.css'),'utf8');
  const api = fs.readFileSync(path.join(__dirname,'..','api/finances.js'),'utf8');
  for (const field of ['financeOperationFrom','financeOperationTo','financeIncomeFrom','financeIncomeTo']) {
    assert.match(html,new RegExp('id="'+field+'"'));
  }
  assert.match(html, /finance-ledger-date-range finance-income-date-range/);
  assert.match(css,/\.finance-ledger-date-range\{/);
  for (const marker of ['finance-operation-delete','finance-ledger-income-edit','finance-ledger-income-delete','financeExpenseSavePending','pending-expense-','financeIncomeEditingId','financeIncomeHistoryTotalLabel']) assert.ok(app.includes(marker),marker);
  assert.ok(app.includes("financeRequest('delete-expense'"));
  assert.ok(app.includes("financeRequest('delete-wallet-income'"));
  assert.ok(app.includes("const data=await financeRequest('save-expense',payload);"));
  assert.ok(app.includes('if(from&&date<from)return false'));
  assert.ok(app.includes('if(to&&date>to)return false'));
  assert.ok(api.includes('id: body.id'));
});

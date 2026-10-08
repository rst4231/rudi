const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  readFinanceState, viewState, resetMutationQueueForTests,
  saveWallet, deleteWallet, reorderWallets, saveWalletIncome, deleteWalletIncome, saveExpenseCategory, savePersonalExpense, deletePersonalExpense,
  archiveExpenseCategory, reorderExpenseCategories, importPersonalExpenses,
} = require('../api/finance-store.cjs');
const { directFinanceAddress } = require('../api/finance-ai.cjs');

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
  await saveExpenseCategory('Рустам', { name:'Кафе', icon:'☕', monthlyLimit:5000 }, { financeCache, id:'cat-food', now:Date.UTC(2026,9,7,8,0) });
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
  assert.equal(view.categories.find(row=>row.id==='cat-food').monthlyLimit,5000);

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
  const before=viewState(await readFinanceState({financeCache}),'Рустам').categories.map(row=>row.id);
  const order=['cat-b','cat-a',...before.filter(id=>id!=='cat-a'&&id!=='cat-b')];
  await reorderExpenseCategories('Рустам',order,{financeCache});
  const ids=viewState(await readFinanceState({financeCache}),'Рустам').categories.map(row=>row.id);
  assert.deepEqual(ids,order);
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
    'finance-category-delete-badge','archive-category','financeCategoryLimit','is-over-limit'
  ]) {
    assert.ok(app.includes(marker)||html.includes(marker)||css.includes(marker),marker);
  }
  assert.ok(ai.includes('Никогда не упоминай имя пользователя'));
  assert.ok(ai.includes('у вас в октябре'));
  assert.ok(ai.includes("['insight-v2', actor, month, version]"));
  assert.ok(ai.includes("['analyst-v4', actor, month, version"));
  assert.ok(ai.includes('directFinanceAddress(parsed?.text, 800)'));
  assert.equal(app.includes('<strong>Курсы</strong><small>Показывать на главной</small>'),false);
  assert.equal(app.includes('Сохраняется автоматически'),false);
  assert.equal(html.includes('Сохраняется автоматически'),false);
  assert.ok(css.includes('html[data-theme="dark"] .finance-back-button'));
  assert.ok(css.includes('grid-auto-columns:calc((100% - 16px)/5)!important'));
  assert.ok(css.includes('overflow-x:auto'));
  assert.ok(app.includes('financeCurrencySymbol(wallet.currency)'));
  assert.ok(html.includes('id="financeWalletsTitle">Кошельки'));
  assert.equal(html.includes('id="financePersonalMonthLabel"'),false);
  assert.ok(html.includes('id="moodHistoryButton"'));
  assert.ok(html.includes('id="financeImportButton"'));
  assert.ok(app.includes('moodChoices.prepend(moodHistoryTrigger)'));
  assert.ok(app.includes('/income|доход|transfer|перевод/'));
});

test('cross currency metadata and refund stay reversible', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'USD',icon:'$',currency:'USD',balance:50},{financeCache,id:'wallet-usd-x'});
  await saveExpenseCategory('Рустам',{name:'EUR category',icon:'E',currency:'EUR'},{financeCache,id:'cat-eur'});
  await savePersonalExpense('Рустам',{
    month:'2026-10',categoryId:'cat-eur',amount:9,note:'ticket',
    occurredAt:'2026-10-07T10:00:00.000Z',walletId:'wallet-usd-x',
    sourceAmount:10,sourceCurrency:'USD',targetCurrency:'EUR',exchangeRate:0.9,rubAmount:800
  },{financeCache,id:'expense-fx'});
  let view=viewState(await readFinanceState({financeCache}),'Рустам');
  const expense=view.personalExpenses.find(row=>row.id==='expense-fx');
  assert.equal(view.wallets[0].balance,40);
  assert.equal(expense.sourceAmount,10);
  assert.equal(expense.sourceCurrency,'USD');
  assert.equal(expense.amount,9);
  assert.equal(expense.targetCurrency,'EUR');
  assert.equal(expense.exchangeRate,0.9);
  assert.equal(expense.rubAmount,800);
  assert.equal(view.personalMonths.find(row=>row.month==='2026-10').expenses,800);
  await deletePersonalExpense('Рустам','expense-fx',{financeCache});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets[0].balance,50);
  assert.equal(view.personalExpenses.some(row=>row.id==='expense-fx'),false);
});

test('finance analyst addresses user directly and fixes Russian month case', () => {
  const text=directFinanceAddress('У Рустама в октября расходы выше плана. Для Дианы это тоже заметно.');
  assert.match(text,/у вас в октябре/i);
  assert.match(text,/для вас/i);
  assert.doesNotMatch(text,/Рустам|Диан/i);
  assert.doesNotMatch(text,/в октября/i);
});


test('CoinKeeper full import keeps only current wallets and categories visible', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  const payload={
    currentWallets:[
      {name:'Основная карта',currency:'RUB',balance:12500},
      {name:'USD карта',currency:'USD',balance:42.5},
    ],
    currentCategories:['Еда','Транспорт'],
    rows:[
      {categoryName:'Еда',amount:350,month:'2026-10',occurredAt:'2026-10-06T07:30:00.000Z',note:'Кофе',importKey:'coinkeeper:current-food'},
      {categoryName:'Старая категория',amount:700,month:'2025-02',occurredAt:'2025-02-01T10:00:00.000Z',note:'История',importKey:'coinkeeper:old-category'},
    ],
  };
  const result=await importPersonalExpenses('Рустам',payload,{financeCache,now:Date.UTC(2026,9,7)});
  assert.equal(result.result.imported,2);
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.deepEqual(view.wallets.map(row=>[row.name,row.currency,row.balance]),[
    ['Основная карта','RUB',12500],
    ['USD карта','USD',42.5],
  ]);
  assert.ok(view.categories.some(row=>row.name==='Еда'));
  assert.equal(view.categories.some(row=>row.name==='Старая категория'),false);
  assert.ok(view.archivedCategories.some(row=>row.name==='Старая категория'));
  assert.ok(view.personalExpenses.some(row=>row.note==='История'));
});

test('wallet edit order persists and deleting referenced wallet hides it without breaking refund', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'A',currency:'RUB',balance:1000},{financeCache,id:'wallet-a'});
  await saveWallet('Рустам',{name:'B',currency:'RUB',balance:2000},{financeCache,id:'wallet-b'});
  await reorderWallets('Рустам',['wallet-b','wallet-a'],{financeCache});
  let view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.deepEqual(view.wallets.map(row=>row.id),['wallet-b','wallet-a']);

  await saveExpenseCategory('Рустам',{name:'Тест',icon:'🧪'},{financeCache,id:'cat-wallet-delete'});
  await savePersonalExpense('Рустам',{
    month:'2026-10',categoryId:'cat-wallet-delete',amount:100,
    walletId:'wallet-a',sourceAmount:100,sourceCurrency:'RUB',targetCurrency:'RUB',exchangeRate:1,rubAmount:100,
  },{financeCache,id:'expense-wallet-delete'});
  await deleteWallet('Рустам','wallet-a',{financeCache});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets.some(row=>row.id==='wallet-a'),false);
  await deletePersonalExpense('Рустам','expense-wallet-delete',{financeCache});
  const state=await readFinanceState({financeCache});
  const hidden=state.wallets['Рустам'].find(row=>row.id==='wallet-a');
  assert.equal(hidden.balance,1000);
});

test('wallet UI has long-press editing and drag-to-expense requests immediate amount focus', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(app.includes('setFinanceWalletEditMode(true)'));
  assert.ok(app.includes("financeRequest('reorder-wallets'"));
  assert.ok(app.includes('finance-wallet-delete-badge'));
  assert.ok(app.includes('focusAmount:true'));
  assert.ok(app.includes('forceFocus:focusAmount'));
  assert.ok(css.includes('.finance-wallet-list.is-editing .finance-wallet-delete-badge'));
});


test('wallet income increases selected wallet and monthly income total', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'USD доход',currency:'USD',balance:20},{financeCache,id:'wallet-income'});
  await saveWalletIncome('Рустам',{
    walletId:'wallet-income',
    amount:10,
    currency:'USD',
    rubAmount:800,
    exchangeRate:80,
    month:'2026-10',
    occurredAt:'2026-10-07T08:30:00.000Z',
    note:'Оплата'
  },{financeCache,id:'income-1'});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets.find(row=>row.id==='wallet-income').balance,30);
  assert.equal(view.walletIncomes.length,1);
  assert.equal(view.walletIncomes[0].amount,10);
  assert.equal(view.walletIncomes[0].rubAmount,800);
  assert.equal(view.personalMonths.find(row=>row.month==='2026-10').income,800);
});

test('personal finance opens by default and monthly income field is removed', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.equal(html.includes('financePersonalIncomeInput'),false);
  assert.ok(html.includes('id="financeIncomeAddButton"'));
  assert.ok(html.includes('>+ Доход</button>'));
  assert.ok(html.includes('class="finance-tab is-active" data-finance-tab="personal"'));
  assert.ok(app.includes("setFinanceTab('personal')"));
  assert.ok(app.includes("financeRequest('save-wallet-income'"));
  assert.ok(app.includes("kind:'income'"));
  assert.ok(app.includes("'Доход',wallet?.name"));
  assert.ok(css.includes('.finance-wallet-head-actions'));
  assert.ok(css.includes('.finance-wallet-history-row.is-income'));
});

test('literacy article renderer has structural formatting styles', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(app.includes("document.createElement(kind)"));
  assert.ok(app.includes("classList.add('finance-literacy-lead')"));
  assert.ok(css.includes('.finance-literacy-body h3'));
  assert.ok(css.includes('.finance-literacy-body li::marker'));
  assert.ok(css.includes('.finance-literacy-lead'));
});


test('wallet heading shows total value in RUB using existing market rates', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.equal(html.includes('financeWalletTotalRub'),false);
  assert.ok(html.includes('id="financeCoinBalanceValue"'));
  assert.ok(app.includes('function financeWalletRubRates'));
  assert.ok(app.includes("byId.get('usd-rub')"));
  assert.ok(app.includes("byId.get('eur-rub')"));
  assert.ok(app.includes("byId.get('btcusdt')"));
  assert.ok(app.includes("byId.get('ethusdt')"));
  assert.ok(app.includes("byId.get('usdtusd')"));
  assert.ok(app.includes("renderFinanceWalletTotal(payload)"));
  assert.ok(css.includes('.finance-balance-card'));
});


test('wallet reorder gesture uses pointer position instead of element hit-testing', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.ok(app.includes('function financeWalletMoveByPointer'));
  assert.ok(app.includes('financeWalletMoveByPointer(list,item,event.clientX)'));
  assert.ok(app.includes('beginReorder(held.pointerId'));
  assert.ok(app.includes("financeRequest('reorder-wallets',{ids})"));
});


test('deleting wallet income reverses its exact amount and wallet history has delete controls', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'История',currency:'RUB',balance:1000},{financeCache,id:'wallet-history-delete'});
  await saveWalletIncome('Рустам',{
    walletId:'wallet-history-delete',amount:500,currency:'RUB',rubAmount:500,exchangeRate:1,
    month:'2026-10',occurredAt:'2026-10-07T09:00:00.000Z'
  },{financeCache,id:'income-history-delete'});
  await deleteWalletIncome('Рустам','income-history-delete',{financeCache});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets.find(row=>row.id==='wallet-history-delete').balance,1000);
  assert.equal(view.walletIncomes.some(row=>row.id==='income-history-delete'),false);

  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.ok(app.includes("entry.kind==='income'?'delete-wallet-income':entry.kind==='transfer'?'delete-wallet-transfer':'delete-expense'"));
  assert.ok(app.includes('finance-wallet-history-delete'));
});


test('deleting wallet income subtracts exact source amount and may leave negative balance', async () => {
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'USD',currency:'USD',balance:5},{financeCache,id:'income-delete-wallet'});
  await saveWalletIncome('Рустам',{
    walletId:'income-delete-wallet',amount:10,currency:'USD',rubAmount:800,exchangeRate:80,
    month:'2026-10',occurredAt:'2026-10-07T08:30:00.000Z'
  },{financeCache,id:'income-delete-row'});
  let view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets.find(row=>row.id==='income-delete-wallet').balance,15);
  await deleteWalletIncome('Рустам','income-delete-row',{financeCache});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets.find(row=>row.id==='income-delete-wallet').balance,5);
  assert.equal(view.walletIncomes.length,0);
  assert.equal(view.personalMonths.find(row=>row.month==='2026-10').income,0);

  await saveWalletIncome('Рустам',{
    walletId:'income-delete-wallet',amount:10,currency:'USD',rubAmount:800,exchangeRate:80,
    month:'2026-10',occurredAt:'2026-10-07T09:30:00.000Z'
  },{financeCache,id:'income-delete-negative'});
  await saveWallet('Рустам',{id:'income-delete-wallet',name:'USD',currency:'USD',balance:2},{financeCache});
  await deleteWalletIncome('Рустам','income-delete-negative',{financeCache});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets.find(row=>row.id==='income-delete-wallet').balance,-8);
});

test('wallet history rows expose delete control for income and expense', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.ok(app.includes("entry.kind==='income'?'delete-wallet-income':entry.kind==='transfer'?'delete-wallet-transfer':'delete-expense'"));
  assert.ok(app.includes('finance-wallet-history-delete'));
});


test('expense composer shows dragged wallet source and category reorder is two-dimensional', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(html.includes('id="financeExpenseComposerSource"'));
  assert.ok(app.includes("source.textContent=wallet"));
  assert.ok(app.includes("'Источник: '+String(wallet.name||'Кошелёк')"));
  assert.ok(app.includes('function financeCategoryMoveByPointer'));
  assert.ok(app.includes('financeCategoryMoveByPointer(list,item,moveEvent.clientX,moveEvent.clientY)'));
  assert.ok(app.includes('startedByLongPress:fromLongPress'));
  assert.ok(css.includes('.finance-expense-source'));
});


test('expense labels persist per category and on expense rows', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const store=fs.readFileSync(path.join(__dirname,'..','api','finance-store.cjs'),'utf8');
  assert.ok(store.includes("['Аренда','ЖКХ','Интернет','Ремонт','Мебель']"));
  assert.ok(store.includes("['Бензин','Паркинг','Поезд','Самолёт','Такси']"));
  assert.ok(store.includes('async function addExpenseCategoryLabel'));
  assert.ok(store.includes('label: cleanExpenseLabel(raw?.label)'));
  assert.ok(app.includes("financeRequest('add-category-label'"));
  assert.ok(app.includes('label:financeExpenseLabel'));
  assert.ok(html.includes('id="financeExpenseLabelList"'));
  assert.ok(html.includes('id="financeExpenseLabelAddButton"'));
});


test('finance overview shows planned limits and wallet total subtitle',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(html.includes('id="financePlannedMonthTotal"'));
  assert.ok(html.includes('id="financeCoinBalanceValue"'));
  assert.ok(html.includes('<span>В планах</span>'));
  assert.ok(!html.includes('id="financeWalletTotalRub"'));
  assert.ok(app.includes('function renderFinanceWalletTotal'));
  assert.ok(app.includes('function financeWalletRubRates'));
  assert.ok(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'));
});

test('income composer does not autofocus amount and category reorder tracks pointer globally', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(app.includes('mountFinanceCoinModal(modal);'));
  assert.ok(!app.includes('mountFinanceCoinModal(modal,amount,{forceFocus:true});'));
  assert.ok(app.includes("document.addEventListener('pointermove',onMove,{capture:true,passive:false})"));
  assert.ok(app.includes('financeCategoryMoveByPointer(list,item,moveEvent.clientX,moveEvent.clientY)'));
  assert.ok(css.includes('.finance-category-coin{touch-action:none}'));
});

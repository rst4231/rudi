const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {readFinanceState,viewState,saveWallet,saveExpenseCategory,savePersonalExpense,resetMutationQueueForTests}=require('../api/finance-store.cjs');
function memoryCache(){let value=null;return{async get(){return value},async set(_key,next){value=structuredClone(next);return true}}}
test('v4.45 credit wallet respects credit limit',async()=>{
  resetMutationQueueForTests();const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'Кредитка',currency:'RUB',balance:0,type:'credit',creditLimit:100000,annualRate:24,minimumPayment:5000},{financeCache,id:'credit-card'});
  await saveExpenseCategory('Рустам',{name:'Тест',icon:'🚗'},{financeCache,id:'credit-cat'});
  await savePersonalExpense('Рустам',{month:'2026-10',categoryId:'credit-cat',amount:25000,rubAmount:25000,walletId:'credit-card',sourceAmount:25000,sourceCurrency:'RUB',targetCurrency:'RUB',exchangeRate:1,occurredAt:'2026-10-07T10:00:00.000Z'},{financeCache,id:'credit-expense'});
  const card=viewState(await readFinanceState({financeCache}),'Рустам').wallets.find(row=>row.id==='credit-card');
  assert.equal(card.type,'credit');assert.equal(card.balance,-25000);assert.equal(card.creditLimit,100000);assert.equal(card.annualRate,24);assert.equal(card.minimumPayment,5000);
  await assert.rejects(()=>savePersonalExpense('Рустам',{month:'2026-10',categoryId:'credit-cat',amount:80000,rubAmount:80000,walletId:'credit-card',sourceAmount:80000,sourceCurrency:'RUB',targetCurrency:'RUB',exchangeRate:1,occurredAt:'2026-10-07T11:00:00.000Z'},{financeCache,id:'over'}),/finance-wallet-insufficient/);
});
test('v4.45 requested finance and car UI markers exist',()=>{
  const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app.js','utf8'),css=fs.readFileSync('public/app.css','utf8'),car=fs.readFileSync('public/car.js','utf8'),carCss=fs.readFileSync('public/car.css','utf8');
  const goal=html.indexOf('id="financeGoalCard"'),history=html.indexOf('id="financeOperationsCard"'),planning=html.indexOf('id="financeObligationsTitle"');
  assert.ok(goal>=0&&history>goal&&planning>history);assert.doesNotMatch(html,/financePersonalHistoryButton|financePersonalHistoryPage/);
  assert.match(html,/id="financeWalletType"/);assert.match(app,/financeWalletCreditLimit/);assert.match(css,/min-inline-size:0!important/);
  assert.match(car,/CAR_EXPENSE_LABELS=\['Бензин','Паркинг','Ремонт','Страховка','ТО'\]/);assert.match(car,/normalizeFinanceText\(row\?\.name\)==='транспорт'/);assert.match(car,/buildCarSmartCard\('expenses','Расходы',expenses\)/);assert.match(carCss,/\.car-expense-month-head/);
});


test('v4.46 month picker is an icon by the eye and finance spacing is compact',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.doesNotMatch(html,/class="finance-personal-toolbar"/);
  assert.match(html,/class="finance-balance-actions"/);
  assert.match(html,/class="finance-balance-month"/);
  assert.match(html,/id="financePersonalMonthInput"[^>]*type="month"/);
  assert.ok(html.indexOf('finance-balance-month')<html.indexOf('financeBalanceEyeButton'));
  assert.match(css,/RUDI v4\.46 — compact month control and finance spacing/);
  assert.match(css,/\.finance-wallet-head-actions\{[\s\S]*?max-width:190px!important/);
  assert.match(css,/min-height:32px!important/);
});

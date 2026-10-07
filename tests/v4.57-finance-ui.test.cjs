const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readFinanceState,viewState,resetMutationQueueForTests,saveDebt,payDebt,deleteDebt,saveFinancePlan,saveWallet,saveWalletIncome,saveWalletTransfer,recordCapitalSnapshot}=require('../api/finance-store.cjs');

function memoryCache(){
  let value=null;
  return {async get(){return value;},async set(_key,next){value=structuredClone(next);return true;}};
}

test('v4.57 debts support partial payments and history',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveDebt('Рустам',{direction:'owe',counterparty:'Диана',amount:14000,note:'Залог'},{financeCache,id:'d1',now:'2026-10-07T10:00:00.000Z'});
  await payDebt('Рустам','d1',4000,{financeCache,id:'p1',now:'2026-10-07T11:00:00.000Z'});
  let view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.debts[0].paidAmount,4000);
  assert.equal(view.debts[0].paid,false);
  assert.equal(view.debts[0].payments.length,1);
  await payDebt('Рустам','d1',10000,{financeCache,id:'p2',now:'2026-10-07T12:00:00.000Z'});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.debts[0].paidAmount,14000);
  assert.equal(view.debts[0].paid,true);
  await deleteDebt('Рустам','d1',{financeCache});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.debts.length,0);
});

test('v4.57 analyst result survives normal plan saves',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveFinancePlan('Рустам',{analystLastDate:'2026-10-07',analystLastReport:{summary:'Готово',strengths:['A'],risks:['B'],createdAt:'2026-10-07T10:00:00.000Z'}},{financeCache});
  await saveFinancePlan('Рустам',{goalTitle:'Квартира',goalTarget:100000},{financeCache});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.plan.analystLastDate,'2026-10-07');
  assert.equal(view.plan.analystLastReport.summary,'Готово');
});

test('v4.57 requested finance UI changes are wired',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  const api=fs.readFileSync(path.join(__dirname,'..','api','finances.js'),'utf8');
  assert.ok(app.includes('function bindFinanceMonthPicker(container,input)'));
  assert.ok(app.includes('input.showPicker'));
  assert.ok(html.includes('id="financeWalletHistoryWrap"'));
  assert.ok(app.includes("if(historyWrap)historyWrap.hidden=!wallet"));
  assert.ok(html.includes('Лимит: 1 анализ в сутки'));
  assert.ok(api.includes("view.plan?.analystLastDate === today"));
  assert.ok(html.includes('id="financeBalanceProgressBar"'));
  assert.ok(html.includes('id="financeBalanceProgressPercent"'));
  assert.ok(app.includes("progressPercent.textContent=financePercent(spentPercent)"));
  assert.ok(html.includes('data-debt-filter="all"'));
  assert.ok(html.includes('id="financeDebtDetailComposer"'));
  assert.ok(app.includes("financeDebtRefreshAfter('pay-debt'"));
  assert.ok(html.includes('id="fastingPage" class="fasting-page" data-app-tab-section="fasting" data-no-pull-refresh="true"'));
  assert.ok(css.includes('RUDI v4.57 — finance polish'));
});


test('v4.65 wallet transfers stay neutral for income and expenses',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{id:'rub-wallet',name:'RUB',currency:'RUB',balance:0},{financeCache,now:'2026-10-07T10:00:00.000Z'});
  await saveWallet('Рустам',{id:'usd-wallet',name:'USD',currency:'USD',balance:0},{financeCache,now:'2026-10-07T10:01:00.000Z'});
  await saveWalletIncome('Рустам',{walletId:'rub-wallet',amount:1000,currency:'RUB',rubAmount:1000,exchangeRate:1,occurredAt:'2026-10-07T10:02:00.000Z',month:'2026-10'},{financeCache,id:'income-1',now:'2026-10-07T10:02:00.000Z'});
  await saveWalletTransfer('Рустам',{fromWalletId:'rub-wallet',toWalletId:'usd-wallet',sourceAmount:400,sourceCurrency:'RUB',targetAmount:4,targetCurrency:'USD',sourceRate:1,targetRate:100,rubAmount:400,occurredAt:'2026-10-07T10:03:00.000Z',month:'2026-10'},{financeCache,id:'transfer-1',now:'2026-10-07T10:03:00.000Z'});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.personalMonths[0].income,1000);
  assert.equal(view.personalMonths[0].expenses,0);
  assert.equal(view.walletTransfers.length,1);
  assert.equal(view.wallets.find(row=>row.id==='rub-wallet').balance,600);
  assert.equal(view.wallets.find(row=>row.id==='usd-wallet').balance,4);
});

test('v4.65 capital history keeps one snapshot per day',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await recordCapitalSnapshot('Рустам',{date:'2026-10-07',totalRub:100000,totalUsd:1250,force:true},{financeCache,now:'2026-10-07T10:00:00.000Z'});
  await recordCapitalSnapshot('Рустам',{date:'2026-10-07',totalRub:101000,totalUsd:1262.5,force:true},{financeCache,now:'2026-10-07T12:00:00.000Z'});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.capitalHistory.length,1);
  assert.equal(view.capitalHistory[0].totalRub,101000);
  assert.equal(view.capitalHistory[0].totalUsd,1262.5);
});

test('v4.65 finance history subpages and filters are wired',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  assert.ok(html.includes('id="financeCapitalChart"'));
  assert.ok(html.includes('id="financeExpenseHistoryPage"'));
  assert.ok(html.includes('id="financeIncomeHistoryPage"'));
  assert.ok(html.includes('id="financeOperationLabel"'));
  assert.ok(app.includes("financeRequest('record-capital-snapshot'"));
  assert.ok(app.includes("function renderFinanceIncomeHistory()"));
  assert.ok(app.includes("if(row?.manualAdjustment)return false"));
  assert.equal(html.includes('id="financeOperationsToggle"'),false);
});


test('v4.66 capital history opens as a dedicated page',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(html.includes('id="financeCapitalMetricButton"'));
  assert.ok(html.includes('id="financeCapitalHistoryPage"'));
  assert.ok(html.includes('id="financeCapitalHistoryBack"'));
  assert.ok(app.includes("bindFinanceMetricAction('financeCapitalMetricButton','capital')"));
  assert.ok(app.includes("page.classList.toggle('is-capital-history',isCapital)"));
  assert.ok(css.includes('RUDI v4.66 — capital history subpage'));
  const mainStart=html.indexOf('id="financeCapitalMetricButton"');
  const walletStart=html.indexOf('class="finance-wallet-section"',mainStart);
  const mainSlice=html.slice(mainStart,walletStart);
  assert.equal(mainSlice.includes('id="financeCapitalChart"'),false);
});


test('v4.71 category amounts follow selected overview currency',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.ok(app.includes('function financeDisplayMoney'));
  assert.ok(app.includes("amount.textContent=financeBalanceHidden?'••••':financeOverviewMoney(spent)"));
  assert.ok(app.includes("financeDisplayMoney(limitValue,category.currency||'RUB')"));
  assert.ok(app.includes("if(financeCategoryHistoryId)renderFinanceCategoryHistory()"));
  assert.ok(app.includes("total.textContent=financeOverviewMoney(visibleTotal)"));
  assert.ok(app.includes("value.textContent='−'+financeOverviewMoney(row.rubAmount||row.amount)"));
  assert.ok(app.includes("financeOverviewMoney(row.amount)+' · '+row.day+' числа"));
  assert.ok(app.includes("'До конца '+financeMonthTitle(month)+': '+financeOverviewMoney(pending)"));
  assert.ok(app.includes("financeOverviewMoney(dailySpent(yesterdayKey))"));
  assert.ok(app.includes("financeOverviewMoney(dailySpent(todayKey,{excludeAdjustments:true}))"));
});


test('v4.72 category amount color follows budget scale',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(app.includes("amount.classList.toggle('is-budget-low',usage<.5)"));
  assert.ok(app.includes("amount.classList.toggle('is-budget-mid',usage>=.5&&usage<1)"));
  assert.ok(app.includes("amount.classList.toggle('is-budget-full',usage>=1)"));
  assert.ok(css.includes('.finance-coin-amount.is-budget-low'));
  assert.ok(css.includes('.finance-coin-amount.is-budget-mid'));
  assert.ok(css.includes('.finance-coin-amount.is-budget-full'));
});


test('v4.72 category budget uses icon progress halo',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(app.includes("coin.classList.add('has-budget')"));
  assert.ok(app.includes("coin.style.setProperty('--finance-budget-progress',usagePercent+'%')"));
  assert.ok(!app.includes("item.append(limit,progress)"));
  assert.ok(css.includes('.finance-category-coin.has-budget::before'));
  assert.ok(css.includes('background:conic-gradient('));
});


test('v4.73 neutral gray category backgrounds keep budget colors',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(css.includes("background:linear-gradient(145deg,#858d99,#68717d)"));
  assert.ok(css.includes(".finance-category-coin.has-budget::before"));
  assert.ok(css.includes(".finance-coin-amount.is-budget-low"));
  assert.ok(css.includes(".finance-coin-amount.is-budget-mid"));
  assert.ok(css.includes(".finance-coin-amount.is-budget-full"));
});

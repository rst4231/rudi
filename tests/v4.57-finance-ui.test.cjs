const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readFinanceState,viewState,resetMutationQueueForTests,saveDebt,payDebt,deleteDebt,saveFinancePlan}=require('../api/finance-store.cjs');

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

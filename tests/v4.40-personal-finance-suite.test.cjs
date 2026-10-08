const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  readFinanceState,viewState,resetMutationQueueForTests,
  saveWallet,reorderWallets,saveWalletTransfer,deleteWalletTransfer,saveFinancePlan,
}=require('../api/finance-store.cjs');

function memoryCache(){
  let value=null;
  return {
    async get(){return value;},
    async set(_key,next){value=structuredClone(next);return true;},
  };
}

test('v4.44 wallet transfers move money without creating income or expense',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'A',currency:'RUB',balance:10000},{financeCache,id:'wa'});
  await saveWallet('Рустам',{name:'B',currency:'RUB',balance:2000},{financeCache,id:'wb'});
  await saveWalletTransfer('Рустам',{
    fromWalletId:'wa',toWalletId:'wb',sourceAmount:3000,targetAmount:3000,
    sourceCurrency:'RUB',targetCurrency:'RUB',sourceRate:1,targetRate:1,rubAmount:3000,
    month:'2026-10',occurredAt:'2026-10-07T10:00:00.000Z'
  },{financeCache,id:'tr1'});
  let view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets.find(row=>row.id==='wa').balance,7000);
  assert.equal(view.wallets.find(row=>row.id==='wb').balance,5000);
  assert.equal(view.walletTransfers.length,1);
  assert.equal(view.personalMonths.length,0);
  await deleteWalletTransfer('Рустам','tr1',{financeCache});
  view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.wallets.find(row=>row.id==='wa').balance,10000);
  assert.equal(view.wallets.find(row=>row.id==='wb').balance,2000);
  assert.equal(view.walletTransfers.length,0);
});

test('v4.44 wallet reorder persists exact visible order',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'A',currency:'RUB',balance:1},{financeCache,id:'wa'});
  await saveWallet('Рустам',{name:'B',currency:'RUB',balance:2},{financeCache,id:'wb'});
  await saveWallet('Рустам',{name:'C',currency:'RUB',balance:3},{financeCache,id:'wc'});
  await reorderWallets('Рустам',['wc','wa','wb'],{financeCache});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.deepEqual(view.wallets.map(row=>row.id),['wc','wa','wb']);
});

test('v4.44 ordinary plan save preserves obligations',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveFinancePlan('Рустам',{goalTitle:'Квартира',obligations:[{id:'rent',title:'Аренда',amount:35000,day:3}]},{financeCache});
  await saveFinancePlan('Рустам',{goalTitle:'Квартира',goalCurrent:1000,goalTarget:100000},{financeCache});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.plan.obligations.length,1);
  assert.equal(view.plan.obligations[0].amount,35000);
});

test('v4.44 finance UI has final requested layout and mobile safeguards',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  for(const id of ['financeBalanceProgressBar','financeTransferComposer','financeOperationsCard','financeGoalCard','financeWalletType','financeWalletCreditLimit','financeIncomeAddButton'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(!html.includes('financeWalletMoveLeft'));
  assert.ok(!html.includes('id="financeWalletCreateButton"'));
  assert.ok(app.includes("add.id='financeWalletCreateButton'"));
  assert.ok(app.includes("financeRequest('save-wallet-transfer'"));
  assert.ok(app.includes('function bindFinanceWalletDrag('));
  assert.ok(app.includes("ensureCurrentDateTimeInputs('financeExpenseComposerDate','financeExpenseComposerTime')"));
  assert.ok(app.includes("ensureCurrentDateTimeInputs('financeTransferDate','financeTransferTime')"));
  assert.ok(app.includes("openFinanceTransferComposer({fromWalletId:wallet.id,toWalletId:targetWalletId,focusAmount:true})"));
  assert.ok(css.includes('.finance-wallet-list.is-editing'));
  assert.ok(css.includes('#financeTransferComposer .finance-transfer-sheet'));
  assert.ok(css.includes('.finance-budget-progress'));
  assert.ok(css.includes('.finance-goal-card-compact .finance-plan-grid'));
});

test('v4.49 category trend and compact expense keypad are wired',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(app.includes('function financeCategoryMonthTrend(categoryId,month)'));
  assert.ok(app.includes("text:(delta>0?'↑ ':'↓ ')+financePercent(delta)"));
  assert.ok(app.includes("text:'↑ новое'"));
  assert.ok(app.includes('function financeExpenseFinalizeCalculator()'));
  assert.ok(app.includes("document.getElementById('financeExpenseKeypad')?.addEventListener('click'"));
  assert.ok(html.includes('id="financeExpenseKeypad"'));
  assert.ok(html.includes('class="finance-expense-keypad-save"'));
  assert.ok(html.includes('inputmode="none" readonly'));
  assert.ok(css.includes('RUDI v4.49 — category month trend + CoinKeeper-style expense entry'));
  assert.ok(css.includes('#financeExpenseComposer .finance-expense-entry-history{display:none!important}'));
  assert.ok(css.includes('@media(max-height:590px)'));
  assert.ok(html.includes('content="'+fs.readFileSync(path.join(__dirname,'..','VERSION'),'utf8').trim()+'"'));
});


test('v4.49 due obligations are wired into morning and 21:00 evening summaries',()=>{
  const morning=fs.readFileSync(path.join(__dirname,'..','api','morning-summary.cjs'),'utf8');
  const evening=fs.readFileSync(path.join(__dirname,'..','api','habit-reminder.cjs'),'utf8');
  assert.ok(morning.includes("loadDueObligationsByActor"));
  assert.ok(morning.includes("morningObligationBlock(data.obligationsByActor?.[actor])"));
  assert.ok(evening.includes("const unpaidObligations=obligationRows.filter(row=>!row.paid)"));
  assert.ok(evening.includes("if(obligationPart)blocks.push(obligationPart)"));
  assert.ok(evening.includes("url:unpaidObligations.length?'/?tab=finances'"));
});


test('v4.50 keeps category history pinned to iOS visual viewport',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(app.includes('function openFinanceCategoryHistory('));
  assert.ok(app.includes("financePage.classList.add('is-category-history')"));
  assert.ok(!app.includes('function financeCategoryHistoryViewportMetrics()'));
  assert.ok(html.includes('id="financeCategoryHistoryPage"'));
  assert.ok(css.includes('.finance-page.is-category-history #financeCategoryHistoryPage'));
});

test('v4.51 category history is inline responsive and expense header respects safe area',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(app.includes("financePage.classList.add('is-category-history')"));
  assert.ok(app.includes("financePage?.classList.remove('is-category-history')"));
  assert.ok(!app.includes('function financeCategoryHistoryViewportMetrics()'));
  assert.ok(!app.includes('__rudiFinanceCategoryHistoryViewportBound'));
  assert.ok(css.includes('RUDI v4.51 — adaptive finance category subpage'));
  assert.ok(css.includes('.finance-page.is-category-history #financeCategoryHistoryPage'));
  assert.ok(css.includes('grid-template-columns:44px minmax(0,1fr) auto!important'));
  assert.ok(css.includes('RUDI v4.51 — expense composer top safe area'));
  assert.ok(css.includes('var(--tg-content-safe-area-inset-top,0px)'));
  assert.ok(html.includes('content="'+fs.readFileSync(path.join(__dirname,'..','VERSION'),'utf8').trim()+'"'));
});

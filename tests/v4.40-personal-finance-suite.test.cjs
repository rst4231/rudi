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

test('v4.41 wallet transfers move money without creating income or expense',async()=>{
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

test('v4.41 wallet reorder persists exact visible order',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveWallet('Рустам',{name:'A',currency:'RUB',balance:1},{financeCache,id:'wa'});
  await saveWallet('Рустам',{name:'B',currency:'RUB',balance:2},{financeCache,id:'wb'});
  await saveWallet('Рустам',{name:'C',currency:'RUB',balance:3},{financeCache,id:'wc'});
  await reorderWallets('Рустам',['wc','wa','wb'],{financeCache});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.deepEqual(view.wallets.map(row=>row.id),['wc','wa','wb']);
});

test('v4.41 ordinary plan save preserves obligations',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveFinancePlan('Рустам',{goalTitle:'Квартира',obligations:[{id:'rent',title:'Аренда',amount:35000,day:3}]},{financeCache});
  await saveFinancePlan('Рустам',{goalTitle:'Квартира',goalCurrent:1000,goalTarget:100000},{financeCache});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  assert.equal(view.plan.obligations.length,1);
  assert.equal(view.plan.obligations[0].amount,35000);
});

test('v4.41 finance UI has final requested layout and mobile safeguards',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(html.includes('finance-balance-card'));
  assert.ok(html.includes('financeTransferComposer'));
  assert.ok(html.includes('financeOperationSearch'));
  assert.ok(!html.includes('financeAnalyticsPeriod'));
  assert.ok(html.includes('financeObligationForecast'));
  assert.ok(app.includes("financeRequest('save-wallet-transfer'"));
  assert.ok(app.includes('renderFinanceOperations()'));
  assert.ok(app.includes('renderFinanceAnalytics()'));
  assert.ok(app.includes("document.addEventListener('pointermove',onMove,{capture:true,passive:false})"));
  assert.ok(app.includes("ensureCurrentDateTimeInputs('financeExpenseComposerDate','financeExpenseComposerTime')"));
  assert.ok(app.includes("ensureCurrentDateTimeInputs('financeTransferDate','financeTransferTime')"));
  assert.ok(app.includes("if(timeInput&&!String(timeInput.value||'').trim())timeInput.value=currentDateTime.time"));
  assert.ok(app.includes('finance-budget-progress'));
  assert.ok(css.includes('.finance-wallet-list.is-editing{touch-action:none!important'));
  assert.ok(css.includes('.finance-budget-progress'));
  assert.ok(css.includes('.finance-obligations-card'));
  assert.ok(css.includes('.finance-goal-card-compact .finance-plan-grid{grid-template-columns:1fr!important'));
  assert.ok(!app.includes("'осталось '+financeMoney(remaining"));
  const planEnd=html.indexOf('id="financePlanStatus"');
  const obligations=html.indexOf('id="financeObligationsTitle"');
  const analyst=html.indexOf('id="financeAnalystTitle"');
  const literacy=html.indexOf('id="financeLiteracyTitle"');
  assert.ok(planEnd>=0&&obligations>planEnd&&analyst>obligations&&literacy>analyst);
  assert.equal((html.match(/id="financeAnalystTitle"/g)||[]).length,1);
});

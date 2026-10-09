'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createD1StateClient}=require('../api/d1-state-client.cjs');
const {
  readFinanceState,viewState,resetMutationQueueForTests,
  saveWallet,saveExpenseCategory,savePersonalExpense
}=require('../api/finance-store.cjs');

function memoryCache(){
  let value=null;
  let failWrites=false;
  return {
    async get(){return value;},
    async set(_key,next){
      if(failWrites)throw new Error('storage-unavailable');
      value=structuredClone(next);return true;
    },
    fail(value){failWrites=value;}
  };
}
function response(payload,status=200){
  return {ok:status>=200&&status<300,status,async text(){return JSON.stringify(payload)}};
}

test('D1 never reports a successful write without explicit ok:true',async()=>{
  const client=createD1StateClient({
    baseUrl:'https://worker.example',secret:'test',
    fetchImpl:async()=>response({ok:false,error:'quota-exceeded'})
  });
  await assert.rejects(()=>client.set('ns','key',{x:1}),/rudi-d1-write-unconfirmed/);
  await assert.rejects(()=>client.setIfAbsent('ns','key',{x:1}),/rudi-d1-write-unconfirmed/);
  await assert.rejects(()=>client.remove('ns','key'),/rudi-d1-write-unconfirmed/);
  await assert.rejects(()=>client.expireTag('ns','tag'),/rudi-d1-write-unconfirmed/);
});

test('manual expense retry uses the same request ID and charges wallet once',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache(),opts={financeCache};
  await saveWallet('Рустам',{name:'Счёт',currency:'RUB',balance:1000},{...opts,id:'test-wallet'});
  await saveExpenseCategory('Рустам',{name:'Кофе',currency:'RUB'},{...opts,id:'test-category'});
  const payload={
    month:'2026-10',categoryId:'test-category',walletId:'test-wallet',
    amount:120,sourceAmount:120,sourceCurrency:'RUB',
    rubAmount:120,requestId:'unique-save-request-1',occurredAt:'2026-10-09T07:00:00.000Z'
  };
  await Promise.all([
    savePersonalExpense('Рустам',payload,opts),
    savePersonalExpense('Рустам',payload,opts)
  ]);
  let view=viewState(await readFinanceState(opts),'Рустам');
  assert.equal(view.personalExpenses.length,1);
  assert.equal(view.wallets.find(x=>x.id==='test-wallet').balance,880);
  await savePersonalExpense('Рустам',payload,opts);
  view=viewState(await readFinanceState(opts),'Рустам');
  assert.equal(view.personalExpenses.length,1);
  assert.equal(view.wallets.find(x=>x.id==='test-wallet').balance,880);
});

test('failed finance storage write is surfaced and old state remains intact',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache(),opts={financeCache};
  await saveExpenseCategory('Диана',{name:'Еда'},{...opts,id:'test-category'});
  financeCache.fail(true);
  await assert.rejects(()=>savePersonalExpense('Диана',{
    month:'2026-10',categoryId:'test-category',amount:100,occurredAt:'2026-10-09T07:00:00.000Z'
  },opts),/storage-unavailable/);
  financeCache.fail(false);
  const state=await readFinanceState(opts);
  assert.equal(viewState(state,'Диана').personalExpenses.length,0);
});

test('mobile version checks, lazy finance modules and untouched expense keypad',()=>{
  const index=fs.readFileSync('public/index.html','utf8');
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  const build=fs.readFileSync('build.cjs','utf8');
  const styles=fs.readFileSync('public/rudi-design-system.css','utf8');
  const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.match(index,/loadFinanceDecisions/);
  assert.doesNotMatch(index,/<script defer src="\\/finance-decisions-core\\.js/);
  assert.match(build,/lazyAssets = new Set/);
  assert.match(build,/public', 'version\\.json'/);
  assert.match(pwa,/function installReleaseWatcher\\(\\)/);
  assert.match(pwa,/safeToRefresh/);
  assert.match(styles,/Shared editing-sheet contract/);
  assert.match(styles,/:not\\(#financeExpenseComposer\\)/);
  assert.ok(vercel.headers.some(row=>row.source==='/version.json'&&row.headers.some(h=>h.key==='Cache-Control'&&h.value.includes('no-store'))));
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const store=require('../api/finance-store.cjs');
const {saveWallet,saveExpenseCategory,readFinanceState,viewState,resetMutationQueueForTests,
  cryptoOperationKey,classifyCryptoOperation,deletePersonalExpense,deleteWalletTransfer}=store;
const rates={RUB:1,USD:90,EUR:100,USDT:90,ETH:225000,BTC:7500000};
const now=Date.UTC(2026,9,11,12);
const occurredAt='2026-10-11T08:20:00.000Z';
const payload=(args={})=>({
  walletId:'api-wallet',operationId:'bybit:withdraw:123',mode:'transfer',direction:'send',
  targetWalletId:'manual-wallet',rubAmount:900,occurredAt,note:'USDT 10',rates,
  apiWalletIds:['api-wallet'],...args,
});
function memoryCache(){let value=null;return {
  async get(){return value;},async set(_key,next){value=structuredClone(next);return true;}
};}
async function setup(){
  resetMutationQueueForTests();const financeCache=memoryCache(),options={financeCache,now};
  await saveWallet('Рустам',{name:'Bybit',currency:'USD',balance:500}, {...options,id:'api-wallet'});
  await saveWallet('Рустам',{name:'Получатель',currency:'RUB',balance:1000},{...options,id:'manual-wallet'});
  await saveWallet('Рустам',{name:'Trust Wallet',currency:'USD',balance:700},{...options,id:'api-peer'});
  await saveExpenseCategory('Рустам',{name:'Крипто-покупки',currency:'RUB'}, {...options,id:'cat-shopping'});
  await saveExpenseCategory('Рустам',{name:'Крипто-еда',currency:'RUB'}, {...options,id:'cat-food'});
  const view=async()=>viewState(await readFinanceState({financeCache}),'Рустам');
  return {financeCache,view,options};
}
test('API transfer updates manual target once; repeat is idempotent; linked source not debited',async()=>{
  const {financeCache,view,options}=await setup();
  await classifyCryptoOperation('Рустам',payload(),options);
  let state=await view();
  assert.equal(state.wallets.find(x=>x.id==='api-wallet').balance,500);
  assert.equal(state.wallets.find(x=>x.id==='manual-wallet').balance,1900);
  assert.equal(state.walletTransfers.length,1);
  assert.equal(state.walletTransfers[0].importKey,cryptoOperationKey('api-wallet','bybit:withdraw:123'));
  assert.equal(state.walletTransfers[0].balanceAdjustedSource,false);
  assert.equal(state.walletTransfers[0].balanceAdjustedTarget,true);
  await classifyCryptoOperation('Рустам',payload(),options);
  state=await view();assert.equal(state.walletTransfers.length,1);
  assert.equal(state.wallets.find(x=>x.id==='manual-wallet').balance,1900);
  await deleteWalletTransfer('Рустам',state.walletTransfers[0].id,{financeCache,now});
  state=await view();assert.equal(state.wallets.find(x=>x.id==='manual-wallet').balance,1000);
  assert.equal(state.wallets.find(x=>x.id==='api-wallet').balance,500);
});
test('classify outgoing API transaction into a category with no source re-debit; delete does not refund it',async()=>{
  const {financeCache,view,options}=await setup();
  await classifyCryptoOperation('Рустам',payload({mode:'expense',categoryId:'cat-shopping'}),options);
  let state=await view();
  assert.equal(state.wallets.find(x=>x.id==='api-wallet').balance,500);
  assert.equal(state.personalExpenses.length,1);
  assert.equal(state.personalExpenses[0].rubAmount,900);
  assert.equal(state.personalExpenses[0].sourceAmount,10);
  assert.equal(state.personalMonths.find(x=>x.month==='2026-10').expenses,900);
  await deletePersonalExpense('Рустам',state.personalExpenses[0].id,{financeCache,now});
  state=await view();
  assert.equal(state.wallets.find(x=>x.id==='api-wallet').balance,500);
  assert.equal(state.personalExpenses.length,0);
});
test('reassign wallet transfer to category, then another category without duplicates or stale balances',async()=>{
  const {view,options}=await setup();
  await classifyCryptoOperation('Рустам',payload(),options);
  await classifyCryptoOperation('Рустам',payload({mode:'expense',categoryId:'cat-shopping'}),options);
  let state=await view();
  assert.equal(state.wallets.find(x=>x.id==='manual-wallet').balance,1000);
  assert.equal(state.walletTransfers.length,0);
  assert.equal(state.personalExpenses.length,1);
  assert.equal(state.personalMonths.find(x=>x.month==='2026-10').expenses,900);
  await classifyCryptoOperation('Рустам',payload({mode:'expense',categoryId:'cat-food',rubAmount:1200}),options);
  state=await view();assert.equal(state.personalExpenses.length,1);
  assert.equal(state.personalExpenses[0].categoryId,'cat-food');
  assert.equal(state.personalMonths.find(x=>x.month==='2026-10').expenses,1200);
  assert.equal(state.wallets.find(x=>x.id==='api-wallet').balance,500);
});
test('two API-connected wallets show the linked transfer without changing either synchronized balance',async()=>{
  const {view,options}=await setup();
  await classifyCryptoOperation('Рустам',payload({
    targetWalletId:'api-peer',apiWalletIds:['api-wallet','api-peer'],
  }),options);
  const state=await view();
  assert.equal(state.walletTransfers.length,1);
  assert.equal(state.walletTransfers[0].toWalletId,'api-peer');
  assert.equal(state.walletTransfers[0].balanceAdjustedSource,false);
  assert.equal(state.walletTransfers[0].balanceAdjustedTarget,false);
  assert.equal(state.wallets.find(x=>x.id==='api-wallet').balance,500);
  assert.equal(state.wallets.find(x=>x.id==='api-peer').balance,700);
});
test('incoming API transaction deducts manually tracked source once; cannot label as expense',async()=>{
  const {view,options}=await setup();
  const p=payload({direction:'receive',targetWalletId:'manual-wallet',rubAmount:900});
  await classifyCryptoOperation('Рустам',p,options);
  const state=await view();
  assert.equal(state.wallets.find(x=>x.id==='manual-wallet').balance,100);
  assert.equal(state.wallets.find(x=>x.id==='api-wallet').balance,500);
  assert.equal(state.walletTransfers[0].fromWalletId,'manual-wallet');
  assert.equal(state.walletTransfers[0].toWalletId,'api-wallet');
  await assert.rejects(()=>classifyCryptoOperation('Рустам',{...p,mode:'expense',categoryId:'cat-food'},options),
    /crypto-allocation-direction-invalid/);
});
test('rejects unauthorized user and nonexistent source without modifying data',async()=>{
  const {view,options}=await setup();
  await assert.rejects(()=>classifyCryptoOperation('Диана',payload(),options),/crypto-owner-only/);
  await assert.rejects(()=>classifyCryptoOperation('Рустам',payload({apiWalletIds:[]}),options),/crypto-wallet-not-found/);
  await assert.rejects(()=>classifyCryptoOperation('Рустам',payload({targetWalletId:'api-wallet'}),options),/finance-wallet-not-found/);
  const state=await view();assert.equal(state.walletTransfers.length,0);assert.equal(state.personalExpenses.length,0);
});
test('API crypto cards and existing wallet editor present clickable transaction classifications',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','crypto-wallets.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','api','finances.js'),'utf8');
  assert.match(js,/function openOperationClassifier/);
  assert.match(js,/function operationElement/);
  assert.match(js,/function loadApiWalletHistory/);
  assert.match(js,/crypto-classify/);
  assert.match(server,/classifyCryptoOperation/);
  assert.match(server,/cryptoOperationKey/);
});

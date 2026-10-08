const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  resetMutationQueueForTests,saveWallet,saveWalletIncome,deleteWalletIncome,readFinanceState,viewState,
}=require('../api/finance-store.cjs');
const memory=()=>{
  let value=null;return{async get(){return value;},async set(key,next){value=structuredClone(next);return true}};
};
test('editing income applies only delta to same wallet and preserves id',async()=>{
 resetMutationQueueForTests();
 const financeCache=memory();
 await saveWallet('Рустам',{name:'Премии',currency:'RUB',balance:1000},{financeCache,id:'wallet-edit'});
 const first=await saveWalletIncome('Рустам',{
   walletId:'wallet-edit',amount:300,currency:'RUB',rubAmount:300,exchangeRate:1,
   month:'2026-10',occurredAt:'2026-10-08T08:00:00Z',note:'Премия'
 },{financeCache,id:'income-edit'});
 assert.equal(viewState(first,'Рустам').wallets[0].balance,1300);
 const changed=await saveWalletIncome('Рустам',{
   id:'income-edit',walletId:'wallet-edit',amount:500,currency:'RUB',rubAmount:500,
   exchangeRate:1,month:'2026-10',occurredAt:'2026-10-08T08:00:00Z',note:'Повышенная премия'
 },{financeCache});
 let view=viewState(changed,'Рустам');
 assert.equal(view.wallets[0].balance,1500);
 assert.equal(view.walletIncomes.length,1);
 assert.equal(view.walletIncomes[0].note,'Повышенная премия');
 assert.equal(view.personalMonths.find(row=>row.month==='2026-10').income,500);
 const less=await saveWalletIncome('Рустам',{
   id:'income-edit',walletId:'wallet-edit',amount:100,currency:'RUB',rubAmount:100,
   exchangeRate:1,month:'2026-10',occurredAt:'2026-10-08T08:00:00Z',note:'Правка'
 },{financeCache});
 view=viewState(less,'Рустам');
 assert.equal(view.wallets[0].balance,1100);
 const erased=await deleteWalletIncome('Рустам','income-edit',{financeCache});
 view=viewState(erased,'Рустам');
 assert.equal(view.wallets[0].balance,1000);
 assert.equal(view.walletIncomes.length,0);
 assert.equal(view.personalMonths.find(row=>row.month==='2026-10').income,0);
});
test('moving edited income between months adjusts both months',async()=>{
 resetMutationQueueForTests();const financeCache=memory();
 await saveWallet('Рустам',{name:'Доход',currency:'RUB',balance:0},{financeCache,id:'wallet-period'});
 await saveWalletIncome('Рустам',{
 walletId:'wallet-period',amount:200,currency:'RUB',rubAmount:200,exchangeRate:1,
 month:'2026-10',occurredAt:'2026-10-08T08:00:00Z'
 },{financeCache,id:'income-period'});
 const after=await saveWalletIncome('Рустам',{
 id:'income-period',walletId:'wallet-period',amount:200,currency:'RUB',rubAmount:200,exchangeRate:1,
 month:'2026-11',occurredAt:'2026-11-08T08:00:00Z'
 },{financeCache});
 const view=viewState(after,'Рустам');
 assert.equal(view.wallets[0].balance,200);
 assert.equal(view.personalMonths.find(row=>row.month==='2026-10').income,0);
 assert.equal(view.personalMonths.find(row=>row.month==='2026-11').income,200);
});
test('income history exposes edit, delete actions and respects chosen date range',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
 assert.match(app,/className='finance-income-history-edit'/);
 assert.match(app,/className='finance-income-history-delete'/);
 assert.match(app,/financeRequest\('delete-wallet-income',\{id:row.id\}\)/);
 assert.match(app,/const editId=financeIncomeEditingId/);
 assert.match(app,/const from=String\(document.getElementById\('financeIncomeHistoryFrom'\)/);
});

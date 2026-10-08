const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readFinanceState,viewState,resetMutationQueueForTests,saveWallet,saveWalletIncome,deleteWalletIncome}=require('../api/finance-store.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function memoryCache(){
 let value=null;
 return {async get(){return value},async set(_key,next){value=structuredClone(next);return true}};
}
test('v4.86: edit wallet income applies only the difference and keeps historical FX',async()=>{
 resetMutationQueueForTests();
 const financeCache=memoryCache();
 await saveWallet('Рустам',{name:'USD',icon:'$',currency:'USD',balance:100},{financeCache,id:'wallet-income-v486'});
 const base={walletId:'wallet-income-v486',amount:10,currency:'USD',rubAmount:900,exchangeRate:90,month:'2026-10',occurredAt:'2026-10-08T08:29:00Z',note:'До правки'};
 await saveWalletIncome('Рустам',base,{financeCache,id:'income-v486'});
 let view=viewState(await readFinanceState({financeCache}),'Рустам');
 assert.equal(view.wallets.find(x=>x.id==='wallet-income-v486').balance,110);
 await saveWalletIncome('Рустам',{...base,id:'income-v486',amount:15,rubAmount:1350,note:'После правки'},{financeCache});
 view=viewState(await readFinanceState({financeCache}),'Рустам');
 assert.equal(view.wallets.find(x=>x.id==='wallet-income-v486').balance,115);
 assert.equal(view.personalMonths.find(x=>x.month==='2026-10').income,1350);
 assert.equal(view.walletIncomes.length,1);
 assert.equal(view.walletIncomes[0].note,'После правки');
 await saveWalletIncome('Рустам',{...base,id:'income-v486',amount:6,rubAmount:540},{financeCache});
 view=viewState(await readFinanceState({financeCache}),'Рустам');
 assert.equal(view.wallets.find(x=>x.id==='wallet-income-v486').balance,106);
 await deleteWalletIncome('Рустам','income-v486',{financeCache});
 view=viewState(await readFinanceState({financeCache}),'Рустам');
 assert.equal(view.wallets.find(x=>x.id==='wallet-income-v486').balance,100);
 assert.equal(view.walletIncomes.length,0);
});
test('v4.86 income date change recalculates old and new months',async()=>{
 resetMutationQueueForTests();
 const financeCache=memoryCache();
 await saveWallet('Рустам',{name:'RUB',currency:'RUB',balance:0},{financeCache,id:'wallet-month-v486'});
 const base={walletId:'wallet-month-v486',amount:300,currency:'RUB',rubAmount:300,exchangeRate:1,month:'2026-09',occurredAt:'2026-09-08T08:29:00Z'};
 await saveWalletIncome('Рустам',base,{financeCache,id:'income-month-v486'});
 await saveWalletIncome('Рустам',{...base,id:'income-month-v486',month:'2026-10',occurredAt:'2026-10-08T08:29:00Z'},{financeCache});
 const view=viewState(await readFinanceState({financeCache}),'Рустам');
 assert.equal(view.personalMonths.find(x=>x.month==='2026-09').income,0);
 assert.equal(view.personalMonths.find(x=>x.month==='2026-10').income,300);
 assert.equal(view.wallets.find(x=>x.id==='wallet-month-v486').balance,300);
});
test('v4.86 expense preview and ledger controls exist',()=>{
 const js=read('public/app.js'),html=read('public/index.html'),css=read('public/app.css'),api=read('api/finances.js');
 assert.ok(js.includes("financePendingExpenseAdds.push(pending)"));
 assert.ok(js.includes("financeRequest('delete-expense',{id:row.id})"));
 assert.ok(js.includes("financeRequest('delete-wallet-income',{id:row.id})"));
 assert.ok(js.includes("financeIncomeEditingId"));
 assert.ok(html.includes('id="financeIncomeHistoryFrom"'));
 assert.ok(html.includes('id="financeIncomeHistoryTo"'));
 assert.ok(css.includes('.finance-ledger-date-range'));
 assert.ok(api.includes('existing?.exchangeRate || 1'));
 assert.equal(read('VERSION').trim(),'v4.86');
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const products=require('../api/product-list-store.cjs');
const finance=require('../api/finance-store.cjs');
function cache(){let value=null;return {get:async()=>value,set:async(k,v)=>{value=structuredClone(v);return true}}}
async function setup(){
 const options={productCache:cache(),financeCache:cache(),now:Date.parse('2026-10-30T18:00:00Z'),purchaseRates:{RUB:1,USD:100}};
 await finance.saveWallet('Рустам',{name:'Карта',balance:10000,currency:'RUB'}, {...options,id:'wallet-rustam'});
 const state=await products.addProducts(['Молоко','Хлеб'],'Рустам',options);
 return {options,ids:state.items.map(x=>x.id),purchase:{id:'purchase-test-0001',walletId:'wallet-rustam',amount:1250.5,occurredAt:'2026-10-30T18:00:00Z'}};
}
test('one checkout debits once in Продукты and retains one receipt across all purchased items',async()=>{
 const {options,ids,purchase}=await setup();
 const result=await products.markProductsBoughtByIds(ids,'Рустам',{...options,purchase});
 assert.equal(result.items.length,0);assert.equal(result.history.length,2);
 assert.equal(result.history[0].purchase.amount,1250.5);
 assert.equal(result.history[0].purchase.id,result.history[1].purchase.id);
 const view=finance.viewState(await finance.readFinanceState(options),'Рустам');
 assert.equal(view.wallets[0].balance,8749.5);assert.equal(view.personalExpenses.length,1);
 assert.equal(view.categories.find(x=>x.id===view.personalExpenses[0].categoryId).name,'Продукты');
 assert.equal(view.personalExpenses[0].rubAmount,1250.5);
 assert.equal((await products.readProductList(options)).history[0].purchase.amount,1250.5);
 await products.markProductsBoughtByIds(ids,'Рустам',{...options,purchase});
 assert.equal(finance.viewState(await finance.readFinanceState(options),'Рустам').wallets[0].balance,8749.5);
});
test('invalid amounts and another actor wallet leave products and balances intact',async()=>{
 for(const patch of [{amount:0},{amount:-10},{amount:'x'},{walletId:'foreign'}]){
  const {options,ids,purchase}=await setup();
  await assert.rejects(()=>products.markProductsBoughtByIds(ids,'Рустам',{...options,purchase:{...purchase,...patch}}));
  assert.equal((await products.readProductList(options)).items.length,2);
  assert.equal(finance.viewState(await finance.readFinanceState(options),'Рустам').wallets[0].balance,10000);
 }
});
test('retry after product storage failure reuses expense and never debits twice',async()=>{
 const {options,ids,purchase}=await setup(),set=options.productCache.set;
 let fail=true;options.productCache.set=async(...args)=>{if(fail){fail=false;throw Error('storage failed')}return set(...args)};
 await assert.rejects(()=>products.markProductsBoughtByIds(ids,'Рустам',{...options,purchase}),/storage failed/);
 const after=await products.markProductsBoughtByIds(ids,'Рустам',{...options,purchase});
 assert.equal(after.history.length,2);
 const view=finance.viewState(await finance.readFinanceState(options),'Рустам');assert.equal(view.personalExpenses.length,1);assert.equal(view.wallets[0].balance,8749.5);
});
test('legacy purchases still work without an amount and do not invent expenses',async()=>{
 const {options,ids}=await setup();const result=await products.markProductsBoughtByIds(ids,'Рустам',options);
 assert.equal(result.history.length,2);assert.equal(finance.viewState(await finance.readFinanceState(options),'Рустам').personalExpenses.length,0);
});
test('a foreign currency wallet debits in its own currency and records RUB for monthly totals',async()=>{
 const {options,ids,purchase}=await setup();
 await finance.saveWallet('Рустам',{name:'USD',currency:'USD',balance:100},{...options,id:'usd'});
 const result=await products.markProductsBoughtByIds(ids,'Рустам',{...options,purchase:{...purchase,walletId:'usd',amount:10}});
 assert.equal(result.history[0].purchase.amount,10);assert.equal(result.history[0].purchase.currency,'USD');assert.equal(result.history[0].purchase.rubAmount,1000);
 assert.equal(finance.viewState(await finance.readFinanceState(options),'Рустам').wallets.find(x=>x.id==='usd').balance,90);
});
test('stale checkout selection does not debit a full receipt for only remaining products',async()=>{
 const {options,ids,purchase}=await setup();await products.markProductBought(ids[0],'Рустам',options);
 await assert.rejects(()=>products.markProductsBoughtByIds(ids,'Рустам',{...options,purchase}),/product-purchase-selection-changed/);
 assert.equal((await products.readProductList(options)).items.length,1);
 assert.equal(finance.viewState(await finance.readFinanceState(options),'Рустам').wallets[0].balance,10000);
});

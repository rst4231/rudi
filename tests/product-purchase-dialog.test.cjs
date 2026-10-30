const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const src=fs.readFileSync('public/app.js','utf8');
async function setup(failFirst=false){
 const dom=new JSDOM('<button id="trigger">Купил</button>',{url:'https://rudi.test',pretendToBeVisual:true});
 const calls=[],wallets=[{id:'usd',name:'Доллары',currency:'USD'},{id:'rub',name:'Карта',currency:'RUB'}];
 const ctx={document:dom.window.document,window:dom.window,localStorage:dom.window.localStorage,currentActor:'Рустам',financeWalletRubRates:()=>({RUB:1,USD:100}),financeRequest:async()=>({ok:true,wallets}),productsRequest:async(op,payload)=>{calls.push({op,payload});if(failFirst&&calls.length===1)throw Error('temporary');return {ok:true,items:[],history:[]}}};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('      async function openProductPurchaseDialog('),src.indexOf('      function setupProducts(){')),ctx);
 const promise=ctx.openProductPurchaseDialog(['one','two']);await new Promise(r=>setImmediate(r));
 return {dom,ctx,calls,promise,form:dom.window.document.querySelector('form')};
}
test('checkout defaults to RUB wallet and products, validates amount and saves selected product IDs',async()=>{
 const t=await setup();try{
 assert.equal(t.form.elements.walletId.value,'rub');assert.equal(t.form.querySelector('[aria-label="Категория расхода"]').value,'Продукты');
 t.form.elements.amount.value='0';t.form.dispatchEvent(new t.dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));assert.equal(t.calls.length,0);
 t.form.elements.amount.value='1 250,50';t.form.dispatchEvent(new t.dom.window.Event('submit',{cancelable:true}));
 const result=await t.promise;assert.equal(result.ok,true);assert.equal(t.calls.length,1);assert.equal(t.calls[0].payload.purchase.amount,1250.5);assert.equal(t.calls[0].payload.purchase.walletId,'rub');assert.equal(t.calls[0].payload.checkedIds.join(','),'one,two');assert.equal(t.dom.window.document.querySelector('[role="dialog"]'),null);
 }finally{t.dom.window.close()}
});
test('cancel never marks products bought or creates expense',async()=>{const t=await setup();try{t.form.querySelector('[data-purchase-cancel]').click();assert.equal(await t.promise,null);assert.equal(t.calls.length,0)}finally{t.dom.window.close()}});
test('a failed save retains the same purchase id when retrying',async()=>{const t=await setup(true);try{t.form.elements.amount.value='100';t.form.dispatchEvent(new t.dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));assert.ok(t.dom.window.document.querySelector('[role="dialog"]'));t.form.dispatchEvent(new t.dom.window.Event('submit',{cancelable:true}));await t.promise;assert.equal(t.calls.length,2);assert.equal(t.calls[0].payload.purchase.id,t.calls[1].payload.purchase.id)}finally{t.dom.window.close()}});

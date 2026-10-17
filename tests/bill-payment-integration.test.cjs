'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('public/app.js','utf8');
function harness(){
 const start=source.indexOf('function openFinanceBillPayment('),end=source.indexOf('function workCalendarRenderSignature(',start),calls=[],rendered=[];let modal;
 const ctx={currentActor:'Диана',TextEncoder,Uint8Array,Date,window:{crypto:webcrypto,RUDIBillPayment:{open:options=>{modal=options}}},
  financeMonthFromOccurredAt:value=>value.slice(0,7),financeRequest:async(operation,payload)=>{calls.push({operation,payload});return {actor:'Диана',wallets:[{id:'wallet'}],categories:[{id:'category'}],obligations:[]}},
  renderFinanceState:value=>rendered.push(value),refreshFinanceInsight:async()=>{},invalidateManagedRequests(){},calendarViewCache:{},financeState:{plan:{}},
  renderFinanceObligations(){},calendarCacheKey:()=>'',tg:null,document:{getElementById:()=>null},console};
 vm.runInNewContext(source.slice(start,end)+';this.api={openFinanceBillPayment,setCalendarObligationPaid}',ctx);
 return {ctx,api:ctx.api,calls,rendered,getModal:()=>modal};
}
test('payment opens wallet/category choice after confirmed paid response; expense retries use stable id',async()=>{
 const h=harness(),obligation={id:'rent',title:'Квартира',amount:1200};
 assert.equal(await h.api.setCalendarObligationPaid(obligation,'2026-11',true,{disabled:false}),true);
 const options=h.getModal();assert.equal(options.actor,'Диана');assert.equal(options.month,'2026-11');assert.equal((await options.load()).wallets[0].id,'wallet');
 await options.save({walletId:'wallet',categoryId:'category'});await options.save({walletId:'wallet',categoryId:'category'});
 const expenses=h.calls.filter(row=>row.operation==='save-expense');assert.equal(expenses.length,2);assert.equal(expenses[0].payload.requestId,expenses[1].payload.requestId);
 assert.equal(expenses[0].payload.amount,1200);assert.equal(expenses[0].payload.inputCurrency,'RUB');assert.equal(expenses[0].payload.walletId,'wallet');assert.equal(expenses[0].payload.categoryId,'category');assert.equal(h.rendered.length,2);
 h.ctx.currentActor='Рустам';await assert.rejects(options.save({walletId:'wallet',categoryId:'category'}),/actor-mismatch/);assert.equal(h.calls.filter(row=>row.operation==='save-expense').length,2);
});
test('failed payment does not open expense chooser and unmarking paid does not ask for an expense',async()=>{
 const h=harness();h.ctx.financeRequest=async()=>{throw Error('offline')};const button={disabled:false};
 assert.equal(await h.api.setCalendarObligationPaid({id:'x'},'2026-10',true,button),false);assert.equal(h.getModal(),undefined);assert.equal(button.disabled,false);
 const fresh=harness();assert.equal(await fresh.api.setCalendarObligationPaid({id:'x'},'2026-10',false,{disabled:false}),true);assert.equal(fresh.getModal(),undefined);
});

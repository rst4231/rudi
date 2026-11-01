const test=require('node:test'),assert=require('node:assert/strict');
const {viewState,saveFinanceMonth,saveFinancePlan,readFinanceState,setFinanceObligationPaid,resetMutationQueueForTests}=require('../api/finance-store.cjs');
const ID='system-housing';
function cache(){let value=null;return{get:async()=>value,set:async(_k,v)=>{value=structuredClone(v)}}}
const housing=(state,actor,month)=>viewState(state,actor,month).plan.obligations.find(r=>r.id===ID);
test('housing is derived for both actors from the exact month with no duplication or carry-forward',async()=>{
 resetMutationQueueForTests();const o={financeCache:cache()};
 let state=await saveFinanceMonth('Рустам','2026-11',35000,5090,[{id:'net',title:'Интернет',amount:750}],o);
 assert.equal(housing(state,'Диана','2026-11')?.amount,16336);assert.equal(housing(state,'Рустам','2026-11')?.amount,24504);
 assert.equal(housing(state,'Диана','2026-11').title,'Жилье');assert.equal(housing(state,'Диана','2026-12').amount,0);
 state=await saveFinanceMonth('Рустам','2026-10',35000,4000,[],o);
 assert.equal(housing(state,'Диана','2026-10').amount,15600);
 assert.equal(housing(state,'Диана','2026-11').amount,16336);
 state=await saveFinanceMonth('Рустам','2026-11',35000,6000,[{id:'net',title:'Интернет',amount:750}],o);
 assert.equal(housing(state,'Рустам','2026-11').amount,25050);
 assert.equal(viewState(state,'Рустам','2026-11').plan.obligations.filter(r=>r.id===ID).length,1);
});
test('housing cannot be removed, deactivated, renamed or have its amount changed; own payment day and paid status persist',async()=>{
 resetMutationQueueForTests();const o={financeCache:cache()};
 let state=await saveFinanceMonth('Рустам','2026-11',35000,5090,[{id:'net',title:'Интернет',amount:750}],o);
 state=await saveFinancePlan('Диана',{obligations:[{...housing(state,'Диана','2026-11'),amount:1,title:'hack',active:false,day:7}]},o);
 assert.equal(housing(state,'Диана','2026-11').amount,16336);assert.equal(housing(state,'Диана','2026-11').title,'Жилье');assert.equal(housing(state,'Диана','2026-11').active,true);
 assert.equal(housing(state,'Диана','2026-11').day,7);assert.equal(housing(state,'Рустам','2026-11').day,1);
 state=await saveFinancePlan('Диана',{obligations:[]},o);assert.equal(housing(state,'Диана','2026-11').day,7);
 state=await setFinanceObligationPaid('Диана',ID,'2026-11',true,o);
 assert.deepEqual(housing(state,'Диана','2026-11').paidMonths,['2026-11']);
 state=await saveFinanceMonth('Рустам','2026-11',35000,5100,[],o);
 assert.equal(housing(state,'Диана','2026-11').day,7);assert.deepEqual(housing(state,'Диана','2026-11').paidMonths,['2026-11']);
 assert.deepEqual(housing(state,'Рустам','2026-11').paidMonths,[]);
 state=await setFinanceObligationPaid('Диана',ID,'2026-11',false,o);assert.deepEqual(housing(state,'Диана','2026-11').paidMonths,[]);
});
test('housing in home calendar uses each date month and actor, and is not generated for a missing month',async()=>{
 const {personalHomeBills}=require('../api/personal-home-bills.cjs');
 const state={months:{'2026-10':{month:'2026-10',rent:35000,utilities:4000},'2026-11':{month:'2026-11',rent:35000,utilities:5090,items:[{id:'net',title:'Интернет',amount:750}]}},plans:{'Диана':{housingPaymentDay:7}}};
 const rows=await personalHomeBills('Диана',['2026-10-07','2026-11-07','2026-12-07'],{readFinanceStateImpl:async()=>state});
 assert.deepEqual(rows.map(r=>[r.date,r.amount]),[['2026-10-07',15600],['2026-11-07',16336]]);
 assert.ok(rows.every(r=>r.title==='Жилье'&&r.canDelete===false));
});

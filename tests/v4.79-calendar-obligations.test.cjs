const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {saveFinancePlan,setFinanceObligationPaid,readFinanceState,viewState,resetMutationQueueForTests}=require('../api/finance-store.cjs');
function memoryCache(){let state=null;return{async get(){return state},async set(k,v){state=structuredClone(v);return true}}}
test('monthly payment is actor-scoped and reversible',async()=>{
 resetMutationQueueForTests();const financeCache=memoryCache();
 await saveFinancePlan('Рустам',{obligations:[{id:'rent',title:'Аренда',day:3,amount:35000}]},{financeCache});
 await saveFinancePlan('Диана',{obligations:[{id:'other',title:'Услуги',day:16,amount:1200}]},{financeCache});
 await setFinanceObligationPaid('Рустам','rent','2026-10',true,{financeCache});
 let state=await readFinanceState({financeCache});
 assert.deepEqual(viewState(state,'Рустам').plan.obligations[0].paidMonths,['2026-10']);
 assert.deepEqual(viewState(state,'Диана').plan.obligations[0].paidMonths,[]);
 await assert.rejects(setFinanceObligationPaid('Диана','rent','2026-10',true,{financeCache}),/finance-obligation-not-found/);
 await setFinanceObligationPaid('Рустам','rent','2026-11',true,{financeCache});
 await setFinanceObligationPaid('Рустам','rent','2026-10',false,{financeCache});
 state=await readFinanceState({financeCache});
 assert.deepEqual(viewState(state,'Рустам').plan.obligations[0].paidMonths,['2026-11']);
});
test('calendar draws tags, exposes payment checkboxes and leaves tasks intact',()=>{
 const root=path.join(__dirname,'..');
 const src=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
 const api=fs.readFileSync(path.join(root,'api/finances.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'public/calendar.css'),'utf8');
 assert.ok(src.includes('function calendarObligationsForDay('));
 assert.ok(src.includes('calendar-obligation-count'));
 assert.ok(src.includes("fetchCalendarJson('finance-calendar-obligations:'"));
 assert.ok(src.includes("financeRequest('set-obligation-paid'"));
 assert.ok(src.includes('setCalendarObligationPaid('));
 assert.ok(src.includes('completeCalendarTickTickTask(event,row,complete'));
 assert.ok(api.includes("operation==='calendar-obligations'"));
 assert.ok(css.includes('.calendar-obligation-tag.is-paid'));
});

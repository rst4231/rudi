'use strict';
const {readFinanceState,viewState,NAMESPACE}=require('./finance-store.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
async function personalHomeBills(actor,dates,options={}){
 if(!['Рустам','Диана'].includes(actor))throw Error('calendar-owner-forbidden');
 if(!Array.isArray(dates)||dates.length>7)throw Error('calendar-date-invalid');
 for(const date of dates){
  if(!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(String(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('calendar-date-invalid');
 }
 const read=options.readFinanceStateImpl||readFinanceState;
 const state=await read(options.readFinanceStateImpl?options:{financeCache:options.financeCache||createStrictRuntimeCache({namespace:NAMESPACE,stateClient:options.client||createRudiStateClient(options)})});
 const obligations=viewState(state,actor).plan.obligations;
 const tasks=[];
 for(const date of [...new Set(dates)]){
  const month=date.slice(0,7),last=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).getUTCDate();
  for(const row of obligations){
   if(row.active===false||row.paidMonths.includes(month)||Math.min(last,row.day)!==Number(date.slice(8)))continue;
   tasks.push({id:'bill:'+row.id+':'+month,financeObligation:true,obligation:{...row,paid:false},obligationId:row.id,obligationMonth:month,
    amount:row.amount,currency:'RUB',title:row.title,date,allDay:true,startTime:'',endTime:'',
    personal:true,privateLocal:actor==='Диана',responsible:actor,ownerScope:actor==='Диана'?'diana':'rustam',assigned:false,
    projectId:'',projectName:'Счета на оплату',canComplete:true,canEdit:false,canDelete:false});
  }
 }
 return tasks;
}
module.exports={personalHomeBills};

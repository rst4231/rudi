'use strict';
const {createHash}=require('node:crypto');
const tasks=require('./shared-native-tasks.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {calendarDateKey}=require('./ticktick-client.cjs');
const {penalizeScore}=require('./score-store.cjs');
const policy=require('../config/task-overdue-stars.json');
const NS='task-overdue-stars-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
function clientOf(options){return options.client||createRudiStateClient(options)}
// Preserve missed occurrences when a late reschedule happens before the cron.
async function rememberLateMove(task,options={}){
 const today=calendarDateKey(new Date(options.now??Date.now()));
 if(!policy.enabled||!tasks.dateIsValid(task.date)||task.date>=today)return;
 const yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const client=clientOf(options);
 for(const date of tasks.recurrenceDates(task,policy.startDate,yesterday)){
  await client.setIfAbsent(NS,'missed:'+hash(task.id+'|'+date),{task:{...task,date},date,missed:true});
 }
}
async function finalize(options={}){
 if(!policy.enabled)return {skipped:'disabled'};
 const client=clientOf(options),now=new Date(options.now??Date.now()),today=calendarDateKey(now);
 if(today<=policy.startDate)return {charged:0};
 if(!(await tasks.ready({...options,client}))?.complete)return {skipped:'tasks-not-ready'};
 if(!await client.setIfAbsent(NS,'lock',{at:now.toISOString()},{ttl:120}))return {skipped:'busy'};
 try{
  const yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const [records,ledger]=await Promise.all([client.list(tasks.TASK_NS),client.list(NS)]);
  const candidates=[];
  for(const {value:task} of records){
   if(!task||task.deleted&&!task.completed||Number(task.status||0)!==0&&!task.completed)continue;
   for(const date of tasks.recurrenceDates(task,policy.startDate,yesterday))candidates.push({task,date});
  }
  for(const row of ledger)if(row.value?.missed)candidates.push(row.value);
  let charged=0;
  for(const entry of candidates){
   const {task,date}=entry;
   const latest=(await client.getRecord(tasks.TASK_NS,task.id))?.value;
   if(!entry.missed&&(!latest||latest.deleted&&!latest.completed||!tasks.dateMatches(latest,date)))continue;
   const id=task.repeatFlag?task.id+'__'+date:task.id;
   const done=(await client.getRecord(tasks.DONE_NS+date.slice(0,7),id))?.value;
   const completedAt=done?.reopened!==true?(done?.at||(!task.repeatFlag&&task.completed?task.completedAt:'')):'';
   const deadline=Date.parse(date+'T00:00:00+03:00')+86400000;
   const hasCompletion=done?done.reopened!==true:!task.repeatFlag&&task.completed;
   if(hasCompletion&&(!Number.isFinite(Date.parse(completedAt))||Date.parse(completedAt)<deadline))continue;
   const recipients=['Рустам','Диана'].includes(task.responsible)?[task.responsible]:['Рустам','Диана'];
   for(const actor of recipients){
    const key='charged:'+hash(task.id+'|'+date+'|'+actor);
    if((await client.getRecord(NS,key))?.value?.applied)continue;
    const result=await penalizeScore(actor,10,{dedupeKey:'score:task-late:'+hash(task.id+'|'+date+'|'+actor),label:'Задача не выполнена в срок',detail:task.title+' · '+date,icon:'🔴'},options);
    await client.set(NS,key,{applied:true,taskId:task.id,date,actor,at:now.toISOString()});
    if(result.penalizedUnits)charged++;
   }
  }
  return {charged,asOf:now.toISOString()};
 }finally{await client.remove(NS,'lock')}
}
module.exports={finalize,rememberLateMove};

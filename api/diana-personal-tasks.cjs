'use strict';
// Live series, idempotency markers and expiring history have separate namespaces:
// long-lived completion markers never crowd live tasks out of D1's list limit.
const {randomUUID}=require('node:crypto');
const {decorateSharedTaskTitle}=require('./shared-task-emoji.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {dateTime}=require('./personal-task-editor.cjs');
const {expiresAfterTwoMonths}=require('./completed-task-history.cjs');
const {recurrence,matches,dates,retained,occurrenceId,parseId}=require('./diana-task-schedule.cjs');
const NAMESPACE='rudi-personal-calendar-v1:diana',TOMBSTONES=NAMESPACE+':tombstones';
const doneNamespace=month=>NAMESPACE+':done:'+month,historyNamespace=month=>NAMESPACE+':history:'+month;
function event(task,date=task.date){
 return {id:occurrenceId(task,date),seriesId:task.id,seriesDate:task.date,title:task.title,date,startTime:task.time,endTime:'',
  description:task.description,allDay:!task.time,personal:true,privateLocal:true,
  responsible:'Диана',ownerScope:'diana',projectId:'',projectName:'',
  repeat:task.repeat||'none',repeatEvery:task.repeatEvery||1,repeatDays:task.repeatDays||[],
  repeatFlag:task.repeat&&task.repeat!=='none'?'FREQ='+task.repeat.toUpperCase():'',
  canEdit:true,canComplete:true,assigned:false,assignee:''};
}
function recentMonths(now){
 const first=new Date(now);first.setUTCDate(1);
 return Array.from({length:3},(_,index)=>{const d=new Date(first);d.setUTCMonth(first.getUTCMonth()-index);return d.toISOString().slice(0,7)});
}
async function personalTasks(input,options={}){
 if(input.actor!=='Диана')throw Error('calendar-owner-forbidden');
 const client=options.client||createRudiStateClient(options),now=new Date(options.now||Date.now()).getTime();
 const op=String(input.operation||'list');
 if(op==='list'){
  const month=String(input.month||'');
  if(month&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('calendar-month-invalid');
  const [records,historic]=await Promise.all([client.list(NAMESPACE),Promise.all(recentMonths(now).map(key=>client.list(historyNamespace(key))))]);
  const history=historic.flat().map(row=>row.value).filter(t=>t?.kind==='completion'&&retained(t.completedAt,now));
  const candidates=records.map(row=>row.value).filter(t=>t&&!t.deleted&&!t.completed&&!t.kind)
    .flatMap(task=>dates(task,month).map(date=>event(task,date)));
  const occurrenceMonths=[...new Set(candidates.map(item=>item.date.slice(0,7)))];
  const completedIds=new Set((await Promise.all(occurrenceMonths.map(key=>client.list(doneNamespace(key))))).flat().map(row=>row.key));
  const tasks=candidates.filter(item=>!completedIds.has(item.id));
  for(const saved of history){
   if(month&&saved.date.slice(0,7)!==month)continue;
   tasks.push({...saved.event,completed:true,completedAt:saved.completedAt,expiresAt:expiresAfterTwoMonths(saved.completedAt),canComplete:false,canEdit:false});
  }
  tasks.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id));
  return {ok:true,tasks};
 }
 if(!['create','save','move','delete','complete'].includes(op))throw Error('calendar-operation-invalid');
 let taskId=String(input.taskId||''),occurrenceDate='';
 if(op==='create'){
  const key=String(input.clientId||randomUUID());
  if(!/^[A-Za-z0-9_-]{1,140}$/.test(key)||key.includes('__'))throw Error('calendar-task-invalid');
  taskId='diana-'+key;
 }else ({seriesId:taskId,occurrenceDate}=parseId(taskId));
 const [record,tombstone]=await Promise.all([client.getRecord(NAMESPACE,taskId),client.getRecord(TOMBSTONES,taskId)]);
 const existing=record?.value;
 if(tombstone){
  if(op==='create'||op==='delete'||op==='complete')return {ok:true,taskId,[op==='create'?'created':op==='delete'?'deleted':'completed']:true};
  throw Error('calendar-task-not-found');
 }
 if(op!=='create'&&!existing)throw Error('calendar-task-not-found');
 if(op==='delete'){
  await client.setIfAbsent(TOMBSTONES,taskId,{deleted:true});
  await client.remove(NAMESPACE,taskId);
  return {ok:true,taskId,deleted:true};
 }
 if(op==='complete'){
  const date=occurrenceDate||existing.date;
  if(!date||!matches(existing,date))throw Error('calendar-occurrence-invalid');
  const item=event(existing,date),ns=doneNamespace(date.slice(0,7));
  if((await client.getRecord(ns,item.id))?.value)return {ok:true,taskId:item.id,completed:true};
  const completedAt=new Date(now).toISOString(),expiresAt=expiresAfterTwoMonths(completedAt);
  await client.setIfAbsent(historyNamespace(completedAt.slice(0,7)),item.id,{kind:'completion',id:item.id,seriesId:taskId,date,event:item,completedAt},{expiresAt});
  await client.setIfAbsent(ns,item.id,{completed:true});
  if(!existing.repeat||existing.repeat==='none'){
   await client.setIfAbsent(TOMBSTONES,taskId,{completed:true});
   await client.remove(NAMESPACE,taskId);
  }
  return {ok:true,taskId:item.id,completed:true};
 }
 const title=String(input.title??existing?.title??'').trim().slice(0,500);
 if(!title)throw Error('ticktick-personal-title-required');
 const date=String(op==='move'?existing.date:(input.date??existing?.date??'')).trim();
 const time=date?String(input.time??existing?.time??'').trim():'';
 const repeat=recurrence(input,existing);
 if(!date)throw Error('ticktick-personal-date-required');
 dateTime(date,time);
 const task={id:taskId,title:op==='create'?decorateSharedTaskTitle(title).slice(0,500):title,date,time,description:String(input.description??existing?.description??'').slice(0,5000),...repeat};
 if(op==='create')await client.setIfAbsent(NAMESPACE,taskId,task);
 else await client.set(NAMESPACE,taskId,task);
 // A delete racing a delayed create/edit wins even across server instances.
 if((await client.getRecord(TOMBSTONES,taskId))?.value)await client.remove(NAMESPACE,taskId);
 return {ok:true,taskId,date,[op==='create'?'created':'updated']:true};
}
module.exports={personalTasks};

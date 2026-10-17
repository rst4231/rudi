'use strict';
const {createHash}=require('node:crypto');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {calendarDateKey,calendarTime}=require('./ticktick-client.cjs');
const namespace=(actor,month)=>{
 if(!['Рустам','Диана'].includes(actor))throw Error('calendar-owner-forbidden');
 return 'rudi-completed-personal-v1:'+actor+':'+month;
};
function recentMonths(now){
 const date=new Date(now);date.setUTCDate(1);
 return Array.from({length:3},(_,index)=>{
  const month=new Date(date);month.setUTCMonth(date.getUTCMonth()-index);
  return month.toISOString().slice(0,7);
 });
}
function expiresAfterTwoMonths(value){
 const date=new Date(value),day=date.getUTCDate();
 date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+2);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(day,last));
 return date.toISOString();
}
const keyFor=(taskId,projectId,date)=>createHash('sha256').update(JSON.stringify([taskId,projectId,date])).digest('hex');
async function archiveCompletedTask(actor,task,options={}){
 if(!task?.id||!task.projectId)return;
 const now=new Date(options.now||Date.now()).toISOString();
 const raw=String(task.startDate||task.dueDate||now),date=calendarDateKey(raw);
 const completedAt=now,expiresAt=expiresAfterTwoMonths(now);
 const event={id:String(task.id),projectId:String(task.projectId),title:String(task.title||'').slice(0,500),
  description:String(task.desc||task.content||'').slice(0,5000),date,
  startTime:task.isAllDay?'':calendarTime(raw),allDay:Boolean(task.isAllDay),
  personal:true,responsible:actor,ownerScope:actor==='Рустам'?'rustam':'diana',
  completed:true,completedAt,expiresAt,canComplete:false,canEdit:false};
 const client=options.client||createRudiStateClient(options);
 await client.setIfAbsent(namespace(actor,now.slice(0,7)),keyFor(event.id,event.projectId,date),event,{expiresAt});
}
async function readCompletedTasks(actor,options={}){
 const client=options.client||createRudiStateClient(options),now=new Date(options.now||Date.now()).getTime();
 const rows=(await Promise.all(recentMonths(now).map(month=>client.list(namespace(actor,month))))).flat();
 return rows.map(row=>row.value)
  .filter(event=>event?.completed===true&&Date.parse(event.expiresAt)>now);
}
async function forgetCompletedTask(actor,task,options={}){
 const client=options.client||createRudiStateClient(options);
 const rows=(await Promise.all(recentMonths(options.now||Date.now()).map(async month=>{
  const ns=namespace(actor,month);
  return (await client.list(ns)).map(row=>({...row,archiveNamespace:ns}));
 }))).flat();
 for(const row of rows){
  const event=row.value;
  if(event?.id===String(task.id)&&event.projectId===String(task.projectId)&&
   (!task.startDate&&!task.dueDate||event.date===calendarDateKey(task.startDate||task.dueDate)))
   await client.remove(row.archiveNamespace,row.key);
 }
}
module.exports={expiresAfterTwoMonths,archiveCompletedTask,readCompletedTasks,forgetCompletedTask};

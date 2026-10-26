'use strict';
// Shared task storage is independent of Rustam's private TickTick lists.
const {randomUUID}=require('node:crypto');
const {assertTaskCompletionAllowed}=require('../public/task-completion-policy.js');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {fetchProjectData,loadTickTickConfig,resolveAssigneeName,buildTickTickCalendar,calendarDateKey,calendarTime}=require('./ticktick-client.cjs');
const {readToken}=require('./ticktick-store.cjs');
const {readSharedTaskMetaState}=require('./shared-task-meta-store.cjs');
const TASK_NS='rudi-shared-tasks-v1';
const STATE_NS='rudi-shared-tasks-state-v1';
const DONE_NS='rudi-shared-tasks-completions-v1';
const DAY=86400000;
const DAY_NAMES=['SU','MO','TU','WE','TH','FR','SA'];
const VALID_DATE=/^20\d{2}-\d{2}-\d{2}$/;
const VALID_TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const RECUR_LIMIT=10000;
function clientOf(options={}){return options.client||createRudiStateClient(options)}
function dateIsValid(date){if(!VALID_DATE.test(String(date||'')))return false;const d=new Date(date+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date}
function validateTime(date,start,end){
 if(!dateIsValid(date))throw Error('shared-task-date-invalid');
 if((start&&!VALID_TIME.test(start))||(end&&!VALID_TIME.test(end)))throw Error('shared-task-time-invalid');
 if(end&&!start)throw Error('shared-task-end-without-start');
 if(start&&end&&end<=start)throw Error('shared-task-time-range-invalid');
}
function utcDay(date){return Date.parse(date+'T00:00:00Z')/DAY}
function isoDay(n){return new Date(n*DAY).toISOString().slice(0,10)}
function taskDate(task){return String(task?.date||task?.startDate||task?.dueDate||'').slice(0,10)}
function taskTime(raw){return String(raw||'').match(/T(\d{2}:\d{2})/)?.[1]||''}
function encodeDate(date,time){return date+'T'+(time||'00:00')+':00+0300'}
function parseRule(flag){
 const rule={};for(const segment of String(flag||'').replace(/^(RRULE|ERULE):/i,'').split(';')){
 const index=segment.indexOf('=');if(index>0)rule[segment.slice(0,index).toUpperCase()]=segment.slice(index+1);
 }return rule;
}
function repeatOf(flag){const r=parseRule(flag);if(!r.FREQ)return 'none';if(r.FREQ==='WEEKLY'&&r.BYDAY==='MO,TU,WE,TH,FR')return 'weekdays';if(r.FREQ==='WEEKLY'&&r.BYDAY)return 'custom';return ({DAILY:'daily',WEEKLY:'weekly',MONTHLY:'monthly',YEARLY:'yearly'})[r.FREQ]||'none'} 
function daysOf(flag){return String(parseRule(flag).BYDAY||'').split(',').map(day=>DAY_NAMES.indexOf(day)).filter(day=>day>=0)}
function checkedDays(raw){return [...new Set((Array.isArray(raw)?raw:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))].sort((a,b)=>a-b)}
function dateMatches(task,date){
 const anchor=taskDate(task);if(!dateIsValid(anchor)||!dateIsValid(date)||date<anchor)return false;
 const rule=parseRule(task.repeatFlag),freq=rule.FREQ;
 if(!freq)return anchor===date;
 const interval=Math.max(1,Math.min(365,Number(rule.INTERVAL)||1));
 const diff=utcDay(date)-utcDay(anchor);
 if(rule.UNTIL){
 const limit=rule.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
 if(limit&&date>limit.slice(1,4).join('-'))return false;
 }
 if(rule.BYMONTH&&!rule.BYMONTH.split(',').map(Number).includes(Number(date.slice(5,7))))return false;
 if(rule.BYMONTHDAY&&!rule.BYMONTHDAY.split(',').map(Number).includes(Number(date.slice(8,10))))return false;
 const dow=DAY_NAMES[new Date(date+'T12:00:00Z').getUTCDay()];
 if(rule.BYDAY&&!rule.BYDAY.split(',').some(value=>value.replace(/^[+-]?\d+/,'')===dow))return false;
 if(freq==='DAILY')return diff%interval===0;
 if(freq==='WEEKLY'){
   const startDay=new Date(anchor+'T12:00:00Z').getUTCDay();
   const weekIndex=Math.floor((diff+((startDay+6)%7))/7);
   return weekIndex%interval===0&&(rule.BYDAY?true:startDay===new Date(date+'T12:00:00Z').getUTCDay());
 }
 if(freq==='MONTHLY'){
   const monthDiff=(Number(date.slice(0,4))-Number(anchor.slice(0,4)))*12+Number(date.slice(5,7))-Number(anchor.slice(5,7));
   return monthDiff%interval===0&&(rule.BYMONTHDAY||rule.BYDAY?true:date.slice(8,10)===anchor.slice(8,10));
 }
 if(freq==='YEARLY')return (Number(date.slice(0,4))-Number(anchor.slice(0,4)))%interval===0&&date.slice(5)===anchor.slice(5);
 return date===anchor;
}
function recurrenceCount(task){
 const rule=parseRule(task.repeatFlag);
 // Native weekday tasks used to inherit the form's accidental one-repeat default.
 if(String(task.id||'').startsWith('rudi-')&&task.repeatLimitExplicit!==true&&
  repeatOf(task.repeatFlag)==='weekdays'&&Number(rule.COUNT)===2&&Number(task.repeatCount)===1)return 0;
 return Math.max(0,Number(rule.COUNT)||0);
}
function recurrenceDates(task,first,last){
 const anchor=taskDate(task),rule=parseRule(task.repeatFlag);
 if(!rule.FREQ){return anchor>=first&&anchor<=last?[anchor]:[]}
 if(!dateIsValid(anchor))return [];
 const begin=Math.max(utcDay(first),utcDay(anchor)),end=Math.min(utcDay(last),begin+RECUR_LIMIT);
 const count=recurrenceCount(task),out=[];
 // COUNT counts occurrences from the first recurrence, not from month start.
 let occurrences=0;
 for(let i=utcDay(anchor);i<=end;i++){
  const date=isoDay(i);if(!dateMatches(task,date))continue;
  occurrences++;
  if(count&&occurrences>count)break;
  if(i>=begin)out.push(date);
 }
 return out;
}
function normalizeTask(input,previous={},actor=''){
 const title=String(input.title??previous.title??'').trim().slice(0,500);
 if(!title)throw Error('shared-task-title-required');
 const date=String(input.date??taskDate(previous)).trim();
 const time=String(input.time??(previous.isAllDay?'':taskTime(previous.startDate))).trim();
 const endTime=String(input.endTime??previous.endTime??'').trim();
 validateTime(date,time,endTime);
 const responsible=String(input.responsible??previous.responsible??'').trim();
 if(responsible&&!['Рустам','Диана'].includes(responsible))throw Error('shared-task-owner-invalid');
 const repeat=String(input.repeat??previous.repeat??'none');
 const repeatCount=Math.max(0,Math.min(365,Math.round(Number(input.repeatCount??previous.repeatCount??0)||0)));
 const flags={daily:'RRULE:FREQ=DAILY;INTERVAL=1',weekdays:'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR',weekly:'RRULE:FREQ=WEEKLY;INTERVAL=1',monthly:'RRULE:FREQ=MONTHLY;INTERVAL=1',yearly:'RRULE:FREQ=YEARLY;INTERVAL=1'};
 const repeatDays=checkedDays(input.repeatDays??previous.repeatDays??[]);
 if(repeat==='custom'&&!repeatDays.length)throw Error('shared-task-weekdays-required');
 if(repeat!=='none'&&repeat!=='custom'&&!flags[repeat])throw Error('shared-task-repeat-invalid');
 const recurrenceRule=repeat==='custom'?'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY='+repeatDays.map(day=>DAY_NAMES[day]).join(','):flags[repeat];
 const repeatFlag=input.preserveRepeat===true?String(previous.repeatFlag||''):(repeat==='none'?'':recurrenceRule+(repeatCount?';COUNT='+(repeatCount+1):''));
 return {...previous,id:String(previous.id||input.taskId||'rudi-'+randomUUID()),title,date,
  startDate:encodeDate(date,time),dueDate:encodeDate(date,endTime||time),isAllDay:!time,
  timeZone:'Europe/Moscow',endTime:time&&endTime||'',responsible,
  assigneeUsername:responsible==='Рустам'?'rudi-rustam':responsible==='Диана'?'rudi-diana':'',
  desc:String(input.description??previous.desc??previous.content??'').trim().slice(0,5000),
  content:String(input.description??previous.desc??previous.content??'').trim().slice(0,5000),
  repeat,repeatDays,repeatCount,repeatFlag,repeatLimitExplicit:input.preserveRepeat===true?previous.repeatLimitExplicit:true,
  status:Number(previous.status||0),createdBy:previous.createdBy||actor,
  createdTime:previous.createdTime||new Date().toISOString(),modifiedTime:new Date().toISOString(),
  items:Array.isArray(previous.items)?previous.items:[],version:Number(previous.version||0)+1};
}
function importTask(source,meta){
 const responsible=['Рустам','Диана'].includes(meta?.responsible)?meta.responsible:
  resolveAssigneeName(source.assigneeUsername)==='RST'?'Рустам':resolveAssigneeName(source.assigneeUsername)==='Ди'?'Диана':'';
 const rawStart=source.startDate||source.dueDate||'';
 const date=rawStart?calendarDateKey(rawStart):'';
 const time=source.isAllDay||!rawStart?'':calendarTime(rawStart);
 const end=source.isAllDay||!source.dueDate?'':calendarTime(source.dueDate);
 // Older TickTick records store the same start/due timestamp. This is not a time range.
 const endTime=end>time?end:'';
 return {...source,id:String(source.id),date:dateIsValid(date)?date:'',responsible,
  startDate:date?encodeDate(date,time):'',dueDate:date?encodeDate(date,endTime||time):'',endTime,
  repeatFlag:String(source.repeatFlag||''),repeat:repeatOf(source.repeatFlag),repeatDays:daysOf(source.repeatFlag),
  repeatCount:Math.max(1,Number(String(source.repeatFlag||'').match(/COUNT=(\d+)/)?.[1]||2)-1),
  createdBy:meta?.createdBy||'',isAllDay:!time,version:1,
  status:Number(source.status||0),items:Array.isArray(source.items)?source.items:[]};
}
function parseTaskId(id){
 const match=String(id||'').match(/^([a-zA-Z0-9_-]{1,180}?)(?:__(20\d{2}-\d{2}-\d{2}))?$/);
 if(!match)throw Error('shared-task-id-invalid');
 return {id:match[1],date:match[2]||''};
}
function responsibility(task){return ['Рустам','Диана'].includes(task?.responsible)?task.responsible:''}
function permitted(task,actor){return !responsibility(task)||responsibility(task)===actor}
function view(task,date=task.date,actor=''){
 const recurring=Boolean(parseRule(task.repeatFlag).FREQ);
 const id=recurring?task.id+'__'+date:task.id;
 const startTime=task.isAllDay?'':taskTime(task.startDate);
 const endTime=task.isAllDay?'':String(task.endTime||'');
 return {id,seriesId:task.id,title:task.title,date,allDay:!!task.isAllDay,
  startTime,endTime,description:String(task.desc||task.content||''),
  location:String(task.location||''),responsible:responsibility(task),ownerScope:responsibility(task)==='Рустам'?'rustam':responsibility(task)==='Диана'?'diana':'shared',
  assignee:responsibility(task)==='Рустам'?'RST':responsibility(task)==='Диана'?'Ди':'Не назначен',
  assigned:!!responsibility(task),responsibilityKnown:true,together:!responsibility(task),
  repeat:repeatOf(task.repeatFlag),repeatDays:daysOf(task.repeatFlag),repeatFlag:task.repeatFlag||'',repeatCount:recurrenceCount(task)?recurrenceCount(task)-1:0,
  canEdit:permitted(task,actor),canDelete:permitted(task,actor),canComplete:permitted(task,actor),
  checklist:(task.items||[]).map(item=>({id:item.id,title:item.title,completed:Number(item.status||0)===1,changedBy:item.changedBy||'',changedAt:item.changedAt||''})),
  personal:false,completed:false,projectId:'native-shared',projectName:'Общий'};
}
async function ready(options={}){return (await clientOf(options).getRecord(STATE_NS,'ready'))?.value||null}
async function migrate(options={}){
 const client=clientOf(options);
 const existing=await ready({...options,client});if(existing?.complete)return existing;
 const sharedToken=await (options.readTokenImpl||readToken)(options);
 if(!sharedToken?.accessToken)throw Error('shared-migration-token-required');
 const config=await (options.loadConfigImpl||loadTickTickConfig)(options);
 if(!config?.projectId)throw Error('shared-migration-project-required');
 const source=await (options.fetchProjectImpl||fetchProjectData)(sharedToken.accessToken,config.projectId,options);
 if(!Array.isArray(source?.tasks)||source.tasks.length===0)
  throw Error('shared-migration-source-unavailable');
 if(source?.project?.id&&String(source.project.id)!==String(config.projectId))
  throw Error('shared-migration-project-mismatch');
 if(source.tasks.some(task=>!String(task?.id||'').trim()))
  throw Error('shared-migration-id-missing');
 const meta=await (options.readMetaImpl||readSharedTaskMetaState)(options);
 let imported=0;
 for(const task of source.tasks){
  const normalized=importTask(task,meta?.entries?.[String(task.id)]||null);
  if(await client.setIfAbsent(TASK_NS,normalized.id,normalized))imported++;
 }
 const verified=await client.list(TASK_NS),byId=new Map(verified.map(row=>[row.key,row.value]));
 if(source.tasks.some(task=>{
   const saved=byId.get(String(task.id));
   return !saved||String(saved.title||'')!==String(task.title||'');
 }))throw Error('shared-migration-verification-failed');
 const state={complete:true,imported,total:source.tasks.length,sourceProjectId:config.projectId,migratedAt:new Date().toISOString()};
 await client.set(STATE_NS,'ready',state);
 return state;
}
async function initialize(options={}){
 const state=await ready(options);return state?.complete?state:migrate(options);
}
async function list(options={}) {
 await initialize(options);
 const client=clientOf(options);
 return (await client.list(TASK_NS)).map(row=>row.value).filter(task=>task&&!task.deleted&&Number(task.status||0)===0);
}
function explicitlyDeleted(task){return Boolean(task?.deleted&&(!task.completed||task.deletedAt))}
function completionSnapshot(task,date){
 const {canEdit,canDelete,canComplete,...event}=view(task,date);
 return event;
}
function savedCompletionEvent(row,task,id,actor,completed=true){
 let parsed;try{parsed=parseTaskId(id)}catch(_){return null}
 let event=row?.event;
 if(event){
  if(event.personal!==false||event.projectId!=='native-shared'||event.id!==id||
   !dateIsValid(event.date)||(parsed.date&&parsed.date!==event.date))return null;
 }else{
  if(!task||explicitlyDeleted(task))return null;
  const date=parsed.date||task.date;if(!dateIsValid(date))return null;
  event=completionSnapshot(task,date);
 }
 const responsible=completed?responsibility(event):responsibility(task);
 const canAct=!!task&&!explicitlyDeleted(task)&&permitted(task,actor);
 return {...event,id,seriesId:parsed.id,responsible,
  assigned:!!responsible,together:!responsible,responsibilityKnown:true,
  assignee:responsible==='Рустам'?'RST':responsible==='Диана'?'Ди':'Не назначен',
  ownerScope:responsible==='Рустам'?'rustam':responsible==='Диана'?'diana':'shared',
  personal:false,projectId:'native-shared',completed,
  canEdit:!completed&&canAct,canDelete:!completed&&canAct,canComplete:!completed&&canAct,
  canReopen:completed&&canAct,completedAt:completed?String(row?.at||task?.completedAt||task?.modifiedTime||''):''};
}
async function occurrences(month,actor,options={}){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('shared-month-invalid');
 await initialize(options);
 const first=month+'-01',last=isoDay(utcDay(first)+new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).getUTCDate()-1);
 const client=clientOf(options);
 const [records,done]=await Promise.all([client.list(TASK_NS),client.list(DONE_NS+month)]);
 const tasks=records.map(row=>row.value).filter(Boolean),byId=new Map(tasks.map(task=>[task.id,task]));
 const completions=new Map(done.map(row=>[row.key,row.value]));
 const events=new Map();
 for(const task of tasks.filter(task=>!task.deleted&&!task.completed&&Number(task.status||0)===0)){
  for(const date of recurrenceDates(task,first,last)){
   const item=view(task,date,actor),completion=completions.get(item.id);
   if(!completion||completion.reopened===true)events.set(item.id,item);
  }
 }
 for(const [id,row] of completions){
  const parsed=(()=>{try{return parseTaskId(id)}catch(_){return null}})();
  if(!parsed)continue;
  const task=byId.get(parsed.id);
  if(row?.reopened===true){
   if(!task||explicitlyDeleted(task)||Number(task.status||0)!==0||events.has(id))continue;
   const item=savedCompletionEvent(row,task,id,actor,false);
   if(item?.date>=first&&item.date<=last)events.set(id,item);
  }else if(options.includeCompleted===true){
   const item=savedCompletionEvent(row,task,id,actor);
   if(item?.date>=first&&item.date<=last)events.set(id,item);
  }
 }
 // Older single completions lived only on the task tombstone, without a DONE row.
 if(options.includeCompleted===true)for(const task of tasks){
  if(!task.completed||explicitlyDeleted(task)||parseRule(task.repeatFlag).FREQ||
   task.date<first||task.date>last||completions.has(task.id))continue;
  const item=savedCompletionEvent(null,task,task.id,actor);if(item)events.set(item.id,item);
 }
 return [...events.values()];
}
async function agendaDates(dates,actor,options={}){
 const months=[...new Set(dates.map(date=>date.slice(0,7)))];
 const all=(await Promise.all(months.map(month=>occurrences(month,actor,options)))).flat();
 return dates.map(date=>all.filter(task=>task.date===date));
}
async function create(body,actor,options={}){
 const key=String(body.clientId||randomUUID()).trim();
 if(!/^[a-zA-Z0-9_-]{1,140}$/.test(key))throw Error('shared-task-id-invalid');
 const id='rudi-'+key,client=clientOf(options);
 const value=normalizeTask({...body,taskId:id}, {}, actor);
 await initialize(options);
 const inserted=await client.setIfAbsent(TASK_NS,id,value);
 const task=inserted?value:(await client.getRecord(TASK_NS,id))?.value;
 if(task?.deleted)throw Error('shared-task-deleted');
 return {ok:true,connected:true,writable:true,created:inserted,task:view(task,task.date,actor)};
}
async function modifyCompletion(action,body,actor,options={}){
 const client=clientOf(options),parsed=parseTaskId(body.taskId);
 if(!['Рустам','Диана'].includes(actor))throw Error('shared-task-forbidden');
 if(parsed.date&&!dateIsValid(parsed.date))throw Error('shared-task-occurrence-invalid');
 const original=(await client.getRecord(TASK_NS,parsed.id))?.value;
 if(!original)throw Error('shared-task-not-found');
 const date=parsed.date||original.date;
 if(!dateIsValid(date))throw Error('shared-task-occurrence-invalid');
 if(!permitted(original,actor))throw Error('shared-task-forbidden');
 // Reject future completions before even writing the transient mutation lock.
 if(action==='complete')assertTaskCompletionAllowed({date},options.now??Date.now());
 const id=(parsed.date||parseRule(original.repeatFlag).FREQ)?parsed.id+'__'+date:parsed.id;
 const lock='completion-lock:'+id;
 if(!await client.setIfAbsent(STATE_NS,lock,{actor},{ttl:20}))throw Error('shared-task-busy');
 try{
  const task=(await client.getRecord(TASK_NS,parsed.id))?.value;
  if(!task||explicitlyDeleted(task))throw Error('shared-task-not-found');
  if(!permitted(task,actor))throw Error('shared-task-forbidden');
  const ns=DONE_NS+date.slice(0,7),previous=(await client.getRecord(ns,id))?.value;
  if((!dateMatches(task,date)||parsed.date&&!parseRule(task.repeatFlag).FREQ)&&!previous)throw Error('shared-task-occurrence-invalid');
  const at=new Date(options.now??Date.now()).toISOString();
  const event=previous?.event||completionSnapshot(task,date);
  if(action==='reopen'){
   const legacy=task.completed===true&&!parsed.date;
   const wasCompleted=previous?previous.reopened!==true:legacy;
   if(wasCompleted){
    // Restore the single task before acknowledging its completion transition: a failed
    // restore must leave the DONE marker closed so the same request can safely retry.
    if(task.completed&&!parsed.date)await client.set(TASK_NS,task.id,{...task,deleted:false,completed:false,version:Number(task.version||0)+1});
    // Keep an open exception so a historical occurrence can return even after a series edit.
    await client.set(ns,id,{...previous,at:previous?.at||task.completedAt||at,
     actor:previous?.actor||actor,event,reopened:true,reopenedAt:at});
   }
   const taskSnapshot={...task,title:event.title,responsible:event.responsible,
    repeatFlag:parsed.date?event.repeatFlag||'RRULE:FREQ=DAILY':'',date};
   return {ok:true,reopened:true,wasCompleted,taskId:id,date,...(wasCompleted?{taskSnapshot}:{})};
  }
  assertTaskCompletionAllowed({date},options.now??Date.now());
  const wasOpen=previous?previous.reopened===true:!task.completed;
  const snapshot=wasOpen&&dateMatches(task,date)?completionSnapshot(task,date):event;
  if(!previous||wasOpen){
   await client.set(ns,id,{at,actor,event:{...snapshot,id},reopened:false});
   if(!parsed.date&&!parseRule(task.repeatFlag).FREQ)await client.set(TASK_NS,task.id,{...task,deleted:true,completed:true,completedAt:at});
  }
  return {ok:true,taskId:id,title:snapshot.title,completed:true,wasOpen,scoreDate:date,responsible:responsibility(snapshot)};
 }finally{await client.remove(STATE_NS,lock)}
}
async function modify(action,body,actor,options={}){
 await initialize(options);
 if(action==='complete'||action==='reopen')return modifyCompletion(action,body,actor,options);
 const client=clientOf(options),parsed=parseTaskId(body.taskId),record=await client.getRecord(TASK_NS,parsed.id),task=record?.value;
 if(!task||task.deleted) {
  if(action==='delete'||action==='complete')return {ok:true,taskId:body.taskId,[action==='delete'?'deleted':'completed']:true};
  throw Error('shared-task-not-found');
 }
 if(!permitted(task,actor))throw Error('shared-task-forbidden');
 const date=parsed.date||task.date;
 if(action==='checklist-toggle'){
  if(body.completed===true)assertTaskCompletionAllowed({date},options.now??Date.now());
  const item=task.items?.find(item=>String(item.id)===String(body.itemId));
  if(!item||typeof body.completed!=='boolean')throw Error('shared-checklist-invalid');
  const already=Number(item.status||0)===Number(body.completed);
  const next={...task,items:task.items.map(row=>String(row.id)===String(body.itemId)?{...row,status:Number(body.completed),changedBy:actor,changedAt:new Date().toISOString()}:row)};
  await client.set(TASK_NS,task.id,next);
  return {ok:true,connected:true,writable:true,item:{id:String(body.itemId),completed:body.completed,changedBy:actor,changedAt:new Date().toISOString()},wasOpen:!already};
 }
 if(action==='delete'){
  await client.set(TASK_NS,task.id,{...task,deleted:true,deletedAt:new Date().toISOString(),version:Number(task.version||0)+1});
  return {ok:true,taskId:body.taskId,deleted:true,taskSnapshot:task};
 }
 if(action==='move'){
  const date=String(body.date||'').trim(),time=String(body.time??taskTime(task.startDate)).trim();
  const endTime=String(body.endTime??task.endTime??'').trim();
  const moved=normalizeTask({date,time,endTime,repeat:task.repeat,repeatCount:task.repeatCount,preserveRepeat:true},task,actor);
  await client.set(TASK_NS,task.id,moved);
  return {ok:true,taskId:body.taskId,date,confirmed:true};
 }
 if(action==='update'){
  const updated=normalizeTask(body,task,actor);
  await client.set(TASK_NS,task.id,updated);
  return {ok:true,taskId:body.taskId,date:updated.date,confirmed:true,task:view(updated,updated.date,actor)};
 }
 throw Error('shared-task-operation-invalid');
}
module.exports={TASK_NS,STATE_NS,DONE_NS,dateIsValid,validateTime,taskDate,taskTime,parseRule,repeatOf,daysOf,checkedDays,dateMatches,recurrenceDates,normalizeTask,importTask,parseTaskId,permitted,view,ready,migrate,initialize,list,occurrences,agendaDates,create,modify};

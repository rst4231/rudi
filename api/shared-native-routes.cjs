'use strict';
// Compatibility API: keep existing app request URLs, replace only shared TickTick storage.
const store=require('./shared-native-tasks.cjs');
const {fetchPersonalProjectTasks,buildTickTickCalendar,loadTickTickConfig,calendarDateKey,calendarTime,tickTickTaskDateKeys}=require('./ticktick-client.cjs');
const {readPersonalToken}=require('./ticktick-store.cjs');
const {readCompletedTasks}=require('./completed-task-history.cjs');
function datePlus(date,n){return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
const monthKey=()=>calendarDateKey(new Date()).slice(0,7);
function errorCode(error){return String(error?.message||error)}
function status(error){
 const c=errorCode(error);
 if(c==='task-completion-future-forbidden'||c==='shared-task-busy')return 409;
 return /forbidden/.test(c)?403:/not-found/.test(c)?404:/invalid|required|without-start/.test(c)?400:503;
}
const nativeActions=new Set(['next','today','calendar','overdue','task-create','task-update','task-delete','task-restore','task-complete','task-reopen','task-completion-undo','task-move','checklist-toggle']);
function shouldHandle(action,body={}){
 if(!nativeActions.has(action))return false;
 if(action==='today'&&body.scope==='personal')return false;
 if((action==='task-completion-undo'||action==='task-reopen')&&body.personal===true)return false;
 return true;
}
function actionDates(options){
 const now=new Date(options.now||Date.now()),today=calendarDateKey(now);
 return {now,today,tomorrow:datePlus(today,1)};
}
async function personalCalendar(calendar,month,actor,options,sharedProjectId){
 if(actor!=='Рустам')return {unavailable:false,connected:false};
 let personalToken=null;
 try{personalToken=await readPersonalToken('Рустам',options)}catch(_){}
 if(!personalToken?.accessToken)return {unavailable:false,connected:false};
 try{
  const tasks=await fetchPersonalProjectTasks(personalToken.accessToken,sharedProjectId,options);
  const own=buildTickTickCalendar(tasks,new Date(options.now||Date.now()),'month','Europe/Moscow',month);
  const sources=new Map(tasks.map(task=>[String(task.id),task]));
  const map=new Map(calendar.days.map(day=>[day.date,day]));
  for(const day of own.days||[]){
   const target=map.get(day.date);if(!target)continue;
   for(const event of day.events||[]){
    const task=sources.get(String(event.id))||{};
    target.events.push({...event,date:day.date,personal:true,responsible:'Рустам',ownerScope:'rustam',
     projectId:String(task.projectId||''),projectName:String(task.projectName||'Список'),
     description:String(task.desc||task.content||'').slice(0,5000),
     repeatFlag:String(task.repeatFlag||''),canEdit:false,canComplete:true,
     assigned:false,assignee:'',originalStartDate:String(task.startDate||task.dueDate||''),
     originalTimeZone:String(task.timeZone||'')});
   }
  }
  return {unavailable:false,connected:true};
 }catch(error){
  console.warn('RUDI_NATIVE_PRIVATE_CALENDAR_WARN',errorCode(error));
  return {unavailable:true,connected:true};
 }
}
function calendarRows(month,events){
 const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 const days=Array.from({length:count},(_,i)=>({date:month+'-'+String(i+1).padStart(2,'0'),events:[]}));
 const lookup=new Map(days.map(d=>[d.date,d]));
 for(const e of events){const day=lookup.get(e.date);if(day)day.events.push(e);}
 for(const d of days){
  d.events.sort((a,b)=>String(a.startTime||'99:99').localeCompare(String(b.startTime||'99:99'))||String(a.title||'').localeCompare(String(b.title||''),'ru'));
  d.hasEvents=d.events.length>0;
 }
 return days;
}
async function nativeCalendar(body,actor,options={}){
 const {now,today}=actionDates(options),view=body.view==='next-month'?'next-month':'month';
 const month=/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(body.month||''))?body.month:
  new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1+(view==='next-month'?1:0),1)).toISOString().slice(0,7);
 const scope=['shared','rustam','diana'].includes(body.scope)?body.scope:'shared';
 if(scope==='rustam'&&actor!=='Рустам'||scope==='diana'&&actor!=='Диана')throw Error('calendar-owner-forbidden');
 const all=await store.occurrences(month,actor,{...options,includeCompleted:true});
 const filtered=scope==='shared'?all:all.filter(t=>t.ownerScope===scope||t.together);
 const search=String(body.search||'').trim().slice(0,100);
 if(search){
  const fold=v=>String(v||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  const words=fold(search).split(/\s+/).filter(Boolean);
  const results=filtered.filter(task=>words.every(w=>fold(task.title+' '+(task.description||'')).includes(w)));
  if(scope==='rustam'&&actor==='Рустам'){
    // Preserve search results from Rustam's separate personal TickTick account.
    try{
      const token=await readPersonalToken('Рустам',options);
      if(token?.accessToken){
        const cfg=await loadTickTickConfig(options);
        const tasks=await fetchPersonalProjectTasks(token.accessToken,cfg.projectId,options);
        for(const task of tasks){
          if(Number(task?.status||0)!==0)continue;
          const hay=fold(String(task.title||'')+' '+String(task.desc||task.content||''));
          if(!words.every(w=>hay.includes(w)))continue;
          const raw=task.startDate||task.dueDate||'';
          for(const date of tickTickTaskDateKeys(task)){
            results.push({id:String(task.id),title:String(task.title||''),date,
              startTime:task.isAllDay?'':calendarTime(raw),allDay:Boolean(task.isAllDay),
              description:String(task.desc||task.content||''),responsible:'Рустам',
              personal:true,ownerScope:'rustam',projectId:String(task.projectId||''),
              projectName:String(task.projectName||'Список'),canEdit:false,
              repeatFlag:String(task.repeatFlag||'')});
          }
        }
      }
    }catch(error){console.warn('RUDI_PRIVATE_TASK_SEARCH_WARN',errorCode(error))}
  }
  results.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||
    String(a.startTime||'').localeCompare(String(b.startTime||'')));
  return {ok:true,results:results.slice(0,500),truncated:results.length>500};
 }
 const calendar={ok:true,connected:true,enabled:true,writable:true,project:'Общий',
  view,monthStart:month+'-01',days:calendarRows(month,filtered),nativeShared:true};
 if(scope==='rustam'){
   const config=await loadTickTickConfig(options).catch(()=>({projectId:'6a97b9e80a2d51030e185acf'}));
   const personal=await personalCalendar(calendar,month,actor,options,config.projectId);
   calendar.personalConnected=personal.connected;calendar.personalUnavailable=personal.unavailable;
   try{
    const completed=await readCompletedTasks(actor,options);
    const map=new Map(calendar.days.map(d=>[d.date,d]));
    for(const item of completed){
     const target=map.get(item.date);
     if(target&&!target.events.some(e=>e.id===item.id&&e.projectId===item.projectId))target.events.push(item);
    }
   }catch(_){}
 }
 return calendar;
}
async function nativeToday(actor,options={}){
 const {today,tomorrow}=actionDates(options);
 const [todayTasks,tomorrowTasks]=await store.agendaDates([today,tomorrow],actor,options);
 return {ok:true,connected:true,configured:true,enabled:true,writable:true,project:'Общий',
  date:today,todayDate:today,tasks:todayTasks,tomorrowDate:tomorrow,tomorrowTasks};
}
async function nativeNext(actor,options={}){
 const today=actionDates(options).today,days=Array.from({length:31},(_,i)=>datePlus(today,i));
 const agendas=await store.agendaDates(days,actor,options);
 const task=agendas.flat().find(t=>t.canComplete!==false)||null;
 return {ok:true,connected:true,enabled:true,writable:true,project:'Общий',task:task?{
  id:task.id,title:task.title,startDate:task.date+'T'+(task.startTime||'00:00')+':00+0300',
  dueDate:task.date+'T'+(task.endTime||task.startTime||'00:00')+':00+0300',
  isAllDay:task.allDay,assignee:task.assignee,assigned:task.assigned,
  description:task.description,checklist:task.checklist}:null};
}
async function nativeOverdue(actor,options={}){
 const today=actionDates(options).today,records=await store.list(options);
 let count=0;
 const old=records.filter(t=>store.dateIsValid(store.taskDate(t))&&store.taskDate(t)<today);
 for(const task of old){
  if(!store.permitted(task,actor))continue;
  const seen=new Set();
  for(const date of store.recurrenceDates(task,store.taskDate(task),datePlus(today,-1))){
   if(seen.size>=90)break;
   seen.add(date);
  }
  if(seen.size){
    const client=options.client||require('./rudi-state-client.cjs').createRudiStateClient(options);
    const latest=Array.from(seen);
    const dates=latest.slice(-60);
    const done=await Promise.all(dates.map(async date=>{
      const key=task.repeatFlag?task.id+'__'+date:task.id;
      const completion=await client.getRecord(store.DONE_NS+date.slice(0,7),key);
      return Boolean(completion&&completion.value?.reopened!==true);
    }));
    if(done.some(value=>!value))count++;
  }
 }
 return {ok:true,count,asOf:new Date(options.now||Date.now()).toISOString()};
}
async function handle(req,res,action,actor,options={},hooks={}){
 const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
 try {
  await store.initialize(options);
  if(action==='calendar')return res.status(200).json(await nativeCalendar(body,actor,options));
  if(action==='today')return res.status(200).json(await nativeToday(actor,options));
  if(action==='next')return res.status(200).json(await nativeNext(actor,options));
  if(action==='overdue')return res.status(200).json(await nativeOverdue(actor,options));
  if(action==='task-create')return res.status(200).json(await store.create(body,actor,options));
  if(action==='task-update'||action==='task-move'||action==='task-delete'||action==='task-complete'||action==='task-reopen'||action==='checklist-toggle'){
   const op={'task-update':'update','task-move':'move','task-delete':'delete','task-complete':'complete','task-reopen':'reopen','checklist-toggle':'checklist-toggle'}[action];
   const result=await store.modify(op,body,actor,options);
   if(action==='task-delete'&&result.taskSnapshot&&hooks.seal){
    result.undoToken=hooks.seal({type:'rudi-shared-delete-v1',actor,task:result.taskSnapshot,expiresAt:Date.now()+30000});
    result.undoExpiresInMs=30000;
   }
   if(action==='task-complete'&&result.wasOpen){
    await hooks.onCompleted?.(result,actor);
    if(hooks.seal)result.undoToken=hooks.seal({type:'rudi-shared-completion-v1',actor,taskId:result.taskId,expiresAt:Date.now()+30000});
   }
   if(action==='task-reopen'&&result.wasCompleted)await hooks.onUndo?.(result.taskSnapshot,result.date,actor);
   delete result.taskSnapshot;
   return res.status(200).json(result);
  }
  if(action==='task-restore'||action==='task-completion-undo'){
   const snapshot=hooks.open?.(body.undoToken)||{};
   if(snapshot.actor!==actor||Number(snapshot.expiresAt||0)<Date.now())throw Error('shared-task-undo-invalid');
   if(action==='task-restore'&&snapshot.type==='rudi-shared-delete-v1'){
    const task=snapshot.task;if(!task?.id)throw Error('shared-task-undo-invalid');
    const client=options.client||require('./rudi-state-client.cjs').createRudiStateClient(options);
    const row=await client.getRecord(store.TASK_NS,task.id);
    if(!row?.value?.deleted)throw Error('shared-task-undo-invalid');
    await client.set(store.TASK_NS,task.id,{...task,deleted:false,version:(row.value.version||0)+1});
    return res.status(200).json({ok:true,taskId:task.id});
   }
   if(action==='task-completion-undo'&&snapshot.type==='rudi-shared-completion-v1'){
    const result=await store.modify('reopen',{taskId:snapshot.taskId},actor,options);
    if(result.wasCompleted)await hooks.onUndo?.(result.taskSnapshot,result.date,actor);
    delete result.taskSnapshot;
    return res.status(200).json(result);
   }
   throw Error('shared-task-undo-invalid');
  }
  return res.status(404).json({ok:false,error:'shared-task-action-invalid'});
 }catch(error){
  const code=errorCode(error);
  console.warn('RUDI_SHARED_NATIVE_ACTION',action,code);
  return res.status(status(error)).json({ok:false,error:code});
 }
}
module.exports={shouldHandle,handle,nativeActions,nativeCalendar,nativeToday,nativeNext};

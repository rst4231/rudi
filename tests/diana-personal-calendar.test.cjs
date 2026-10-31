'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const apiPath='../api/diana-personal-tasks.cjs';
function fixture(){
 const rows=new Map(),names=[];
 const client={list:async ns=>{names.push(ns);return [...rows.entries()].filter(([key])=>key.startsWith(ns+'|')).map(([key,value])=>({key:key.split('|')[1],value}))},getRecord:async(ns,id)=>({value:rows.get(ns+'|'+id)??null}),setIfAbsent:async(ns,id,v)=>{if(rows.has(ns+'|'+id))return false;rows.set(ns+'|'+id,v);return true},set:async(ns,id,v)=>rows.set(ns+'|'+id,v),remove:async(ns,id)=>rows.delete(ns+'|'+id)};
 return {rows,names,client};
}
test('Diana creates dated private tasks without category, reads and edits only her records; retries are idempotent',async()=>{
 assert.equal(fs.existsSync('api/diana-personal-tasks.cjs'),true,'private task module must exist');
 const {personalTasks}=require(apiPath),h=fixture();
 const input={actor:'Диана',operation:'create',clientId:'diana-a',title:'Врач',date:'2026-10-17',time:'16:15',description:'Документы',targetProjectId:'rustam-category'};
 const created=await personalTasks(input,{client:h.client});
 assert.equal(created.created,true);
 await personalTasks(input,{client:h.client});assert.equal(h.rows.size,1);
 let result=await personalTasks({actor:'Диана',operation:'list'},{client:h.client});
 assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].title,'🏥 Врач');assert.equal(result.tasks[0].projectId,'');assert.equal(result.tasks[0].responsible,'Диана');
 assert.equal(result.tasks[0].privateLocal,true);assert.equal(result.tasks[0].personal,true);
 await assert.rejects(personalTasks({...input,actor:'Рустам'},{client:h.client}),/owner-forbidden/);
 await assert.rejects(personalTasks({...input,date:'2026-02-31'},{client:h.client}),/date-invalid/);
 await assert.rejects(personalTasks({...input,title:' '},{client:h.client}),/title-required/);
 await assert.rejects(personalTasks({...input,time:'25:00'},{client:h.client}),/time-invalid/);
 await assert.rejects(personalTasks({...input,operation:'save',taskId:created.taskId,title:'Аптека',date:'',time:''},{client:h.client}),/date-required/);
 await personalTasks({...input,operation:'save',taskId:created.taskId,title:'Аптека',date:'2026-10-18',time:''},{client:h.client});
 result=await personalTasks({actor:'Диана',operation:'list'},{client:h.client});assert.equal(result.tasks[0].title,'Аптека');assert.equal(result.tasks[0].date,'2026-10-18');
 await personalTasks({actor:'Диана',operation:'delete',taskId:created.taskId},{client:h.client});
 assert.equal((await personalTasks({actor:'Диана',operation:'list'},{client:h.client})).tasks.length,0);
 await personalTasks(input,{client:h.client});assert.equal((await personalTasks({actor:'Диана',operation:'list'},{client:h.client})).tasks.length,0,'a delayed create retry never resurrects a deleted task');
 assert.ok(h.names.every(ns=>ns.startsWith('rudi-personal-calendar-v1:diana')));
});
test('Diana completion is private and retains idempotency tombstone',async()=>{
 assert.equal(fs.existsSync('api/diana-personal-tasks.cjs'),true);
 const {personalTasks}=require(apiPath),h=fixture();
 const saved=await personalTasks({actor:'Диана',operation:'create',title:'Дело',date:'2026-10-17',clientId:'complete-a'},{client:h.client});
 await personalTasks({actor:'Диана',operation:'complete',taskId:saved.taskId},{client:h.client});
 const history=(await personalTasks({actor:'Диана',operation:'list'},{client:h.client})).tasks;assert.equal(history.length,1);assert.equal(history[0].completed,true);
 await assert.rejects(personalTasks({actor:'Диана',operation:'save',taskId:'foreign',title:'x'},{client:h.client}),/task-not-found/);
});
test('Diana editor omits category from payload while retaining title, date, time and description',()=>{
 const vm=require('node:vm'),src=fs.readFileSync('public/personal-task-editor.js','utf8');
 const fields={title:{value:'Врач'},date:{value:'2026-10-17'},time:{value:'16:15'},project:{value:'rustam-only'},description:{value:'Документы'},repeat:{value:'weekly'},repeatEvery:{value:'2'}};
 const start=src.indexOf('function value(){'),end=src.indexOf('function submit(',start);
 const value=vm.runInNewContext(src.slice(start,end)+';value',{f:key=>fields[key],active:{ctx:{actor:'Диана'}},modal:{querySelectorAll:()=>[{value:'1'},{value:'3'}]},String});
 const result=value();assert.equal(result.time,'16:15');assert.equal(result.description,'Документы');assert.equal(Object.hasOwn(result,'targetProjectId'),false);assert.equal(result.repeat,'weekly');assert.equal(result.repeatEvery,2);assert.equal(result.repeatDays.join(','),'1,3');
});
test('Diana tasks preserve the same morning, day, evening and all-day grouping',()=>{
 const vm=require('node:vm'),src=fs.readFileSync('public/app.js','utf8');
 const start=src.indexOf('function calendarAgendaMinutes('),end=src.indexOf('async function requestPersonalTickTickTaskMove(',start);
 const group=vm.runInNewContext(src.slice(start,end)+';calendarTaskPeriod');
 assert.equal(group({privateLocal:true,startTime:'09:00'}),'morning');assert.equal(group({privateLocal:true,startTime:'12:00'}),'day');assert.equal(group({privateLocal:true,startTime:'18:00'}),'evening');assert.equal(group({privateLocal:true,startTime:'09:00',allDay:true}),'all-day');
});
test('Diana hides category and shares the existing delete button only for saved tasks',()=>{
 const vm=require('node:vm'),src=fs.readFileSync('public/personal-task-editor.js','utf8');
 const start=src.indexOf('function open(task,ctx={}){'),end=src.indexOf('async function persist(',start);
 function show(actor,isNew){
  const fields=Object.fromEntries(['title','date','time','description','project','repeat','repeatEvery','repeatEnd','repeatUntil','repeatCount'].map(key=>[key,{value:'',replaceChildren(){},closest(){return this.label||(this.label={hidden:false})}}]));
  const nodes={rudiPersonalTaskForm:{reset(){}},rudiPersonalRepeatNote:{},rudiPersonalTaskHeading:{},rudiPersonalTaskDelete:{},rudiPersonalTaskSubtitle:{},rudiPersonalTaskRepeatFields:{}};
  fields.repeat.options=['none','daily','weekly','monthly','yearly','keep'].map(value=>({value}));
  let projects=0;
  const ctx={readRepeatFlag:()=>({repeat:'none',repeatEvery:1,repeatDays:[],repeatEnd:'never',repeatUntil:'',repeatCount:10}),syncEditorViewport(){},active:null,init(){},closeMenu(){},byId:id=>nodes[id],refreshTemporalInputs(){},f:key=>fields[key],normalizedEditorWhen:()=>({date:'2026-10-17',time:'09:00'}),syncTime(){},message(){},enabled(){},modal:{setAttribute(){},querySelectorAll:()=>[]},syncRepeat(){},document:{body:{classList:{add(){}}}},requestAnimationFrame(){},Option:function(){},projects:()=>{projects++;return Promise.resolve()}};
  const open=vm.runInNewContext(src.slice(start,end)+';open',ctx);
  open({id:isNew?'new':'diana-task',personal:true,isNew,title:'Дело'},{actor});
  return {fields,nodes,projects};
 }
 const diana=show('Диана',false);assert.equal(diana.fields.project.label.hidden,true);assert.equal(diana.projects,0);assert.equal(diana.nodes.rudiPersonalTaskDelete.hidden,false);assert.equal(diana.nodes.rudiPersonalTaskSubtitle.textContent,'Личный календарь');
 assert.equal(show('Диана',true).nodes.rudiPersonalTaskDelete.hidden,true);
 const rustam=show('Рустам',false);assert.equal(rustam.fields.project.label.hidden,false);assert.equal(rustam.projects,1);assert.equal(rustam.nodes.rudiPersonalTaskDelete.hidden,false);
});
test('personal routes use authenticated actor, ignore spoofed actor and avoid TickTick credentials for Diana',async()=>{
 const vm=require('node:vm'),src=fs.readFileSync('api/partner-message.js','utf8');
 const start=src.indexOf('  // Dedicated private editor'),end=src.indexOf('  // Move a timed personal',start),h=fixture();
 const run=vm.runInNewContext('(async function(req,res,options){const action=req.action;'+src.slice(start,end)+'})',{
  authorizeRequest:req=>{if(!req.authActor)throw Error('rudi-session-required');return {actor:req.authActor}},
  statusForError:()=>401,credentialsConfigured:()=>{throw Error('must not read TickTick config')},
  require:name=>{assert.equal(name,'./diana-personal-tasks.cjs');return require(apiPath)}
 });
 const res=()=>({status(code){this.code=code;return this},json(body){this.body=body;return this}});
 let r=res();await run({method:'POST',action:'personal-task-create',authActor:'Диана',body:{actor:'Рустам',title:'Private',date:'2026-10-17',clientId:'route-a',targetProjectId:'rustam'}},r,{client:h.client});assert.equal(r.code,200);assert.equal(r.body.created,true);
 r=res();await run({method:'POST',action:'personal-task-list',authActor:'Диана',body:{actor:'Рустам'}},r,{client:h.client});assert.equal(r.body.tasks[0].responsible,'Диана');
 r=res();await run({method:'POST',action:'personal-task-list',authActor:'Рустам',body:{actor:'Диана'}},r,{client:h.client});assert.equal(r.code,403);
 r=res();await run({method:'POST',action:'personal-task-list',body:{actor:'Диана'}},r,{client:h.client});assert.equal(r.code,401);
});
test('fresh Diana tasks render and cache even when shared TickTick is unavailable; shared view never requests them',async()=>{
 const vm=require('node:vm'),src=fs.readFileSync('public/app.js','utf8');
 const start=src.indexOf('async function fetchCombinedCalendar('),end=src.indexOf('async function prefetchCalendarView(',start);
 for(const scope of ['personal','shared']){
  const calls=[],captures=[];
  const ctx={currentActor:'Диана',calendarScope:scope,calendarDisplayMode:'month',calendarPersonalTickTickConnected:false,
   window:{rudiCalendarOffline:{isOffline:()=>false,capture:async(...args)=>captures.push(args),cached:async()=>{throw Error('must not substitute stale private tasks')},materialize:async(_actor,_month,result)=>result}},
   calendarActiveMonth:()=> '2026-10',calendarCacheKey:()=>scope,calendarCacheFresh:()=>false,
   calendarViewCache:{[scope]:{ticktickDays:[{date:'2026-10-17',events:[{id:'old',privateLocal:true,date:'2026-10-17',title:'Old'}]}]}},calendarViewLoadedAt:new Map(),
   telegramInitData:()=> 'diana-session',currentStateBackupToken:'',todayState:()=>({key:'2026-10-17'}),
   fetchCalendarJson:async(resource)=>{calls.push(resource);if(resource.startsWith('ticktick-calendar'))throw Error('TickTick unavailable');if(resource.startsWith('diana-personal-calendar'))return {ok:true,tasks:[{id:'new',title:'Fresh',date:'2026-10-17',privateLocal:true,startTime:'09:00'}]};return {}},
   calendarDateShift:(date,days)=>{const d=new Date(date+'T12:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)},console
  };
  const fetchCombined=vm.runInNewContext(src.slice(start,end)+';fetchCombinedCalendar',ctx);
  if(scope==='shared'){ctx.window.rudiCalendarOffline.cached=async()=>null}
  const result=await fetchCombined('month','2026-10',false);
  if(scope==='personal'){assert.equal(result.ticktickDays[0].events[0].title,'Fresh');assert.equal(captures.length,1)}
  else assert.equal(calls.some(name=>name.startsWith('diana-personal-calendar')),false);
 }
});
test('Diana daily and weekly weekday recurrence expands only requested month; completing an instance preserves future and history',async()=>{
 const {personalTasks}=require(apiPath),h=fixture(),options={client:h.client,now:Date.parse('2026-10-19T10:00Z')};
 const saved=await personalTasks({actor:'Диана',operation:'create',clientId:'daily',title:'Витамины',date:'2026-10-17',time:'09:00',repeat:'daily',repeatEvery:2},options);
 let list=await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},options);
 assert.deepEqual(list.tasks.map(t=>t.date),['2026-10-17','2026-10-19','2026-10-21','2026-10-23','2026-10-25','2026-10-27','2026-10-29','2026-10-31']);
 const occurrence=list.tasks.find(t=>t.date==='2026-10-19');
 await personalTasks({actor:'Диана',operation:'complete',taskId:occurrence.id},options);
 list=await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},options);
 assert.equal(list.tasks.find(t=>t.date==='2026-10-19').completed,true);assert.equal(list.tasks.find(t=>t.date==='2026-10-21').completed,undefined);
 await personalTasks({actor:'Диана',operation:'save',taskId:occurrence.id,title:'Новые витамины',date:'2026-10-17',time:'18:00',repeat:'daily',repeatEvery:2},options);
 list=await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},options);assert.equal(list.tasks.find(t=>t.date==='2026-10-19').title,'📌 Витамины');assert.equal(list.tasks.find(t=>t.date==='2026-10-21').startTime,'18:00');
 await personalTasks({actor:'Диана',operation:'delete',taskId:occurrence.id},options);
 list=await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},options);assert.equal(list.tasks.length,1);assert.equal(list.tasks[0].completed,true);
 list=await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},{...options,now:Date.parse('2026-12-20T10:00Z')});assert.equal(list.tasks.length,0);
 await personalTasks({actor:'Диана',operation:'create',clientId:'weekly',title:'Спорт',date:'2026-10-01',time:'12:00',repeat:'weekly',repeatDays:[1,3,5]},options);
 list=await personalTasks({actor:'Диана',operation:'list',month:'2026-11'},options);
 assert.ok(list.tasks.length>0);assert.ok(list.tasks.every(t=>[1,3,5].includes(new Date(t.date+'T12:00Z').getUTCDay())));
 await assert.rejects(personalTasks({actor:'Диана',operation:'create',title:'x',date:'2026-10-17',repeat:'weekly',repeatDays:[]},options),/repeat-days-required/);
 await assert.rejects(personalTasks({actor:'Диана',operation:'create',title:'x',date:'2026-10-17',repeat:'daily',repeatEvery:0},options),/repeat-invalid/);
});
test('Diana creation adds existing shared task emoji logic once, while edits keep their exact title',async()=>{
 const {personalTasks}=require(apiPath),h=fixture();
 const saved=await personalTasks({actor:'Диана',operation:'create',clientId:'emoji',title:'Купить продукты',date:'2026-10-17'},{client:h.client});
 let tasks=(await personalTasks({actor:'Диана',operation:'list'},{client:h.client})).tasks;assert.equal(tasks[0].title,'🛒 Купить продукты');
 await personalTasks({actor:'Диана',operation:'save',taskId:saved.taskId,title:'📚 Читать',date:'2026-10-17'},{client:h.client});
 tasks=(await personalTasks({actor:'Диана',operation:'list'},{client:h.client})).tasks;assert.equal(tasks[0].title,'📚 Читать');
});
test('Diana timeline drag uses the shared gesture, saves time, and suppresses the release click',async()=>{
 const vm=require('node:vm'),src=fs.readFileSync('public/app.js','utf8');
 const start=src.indexOf('function calendarAttachTaskTimeDrag('),end=src.indexOf('function calendarWeekAgenda(',start);
 const listeners={},timers=[],saved=[],classes=new Set();
 const block={style:{top:'650px'},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},addEventListener:(name,fn)=>listeners[name]=fn,setPointerCapture(){},releasePointerCapture(){}};
 const ctx={calendarScope:'personal',currentActor:'Диана',CALENDAR_AGENDA_HOUR_HEIGHT:72,tg:null,
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},
  requestCalendarTickTickTaskMove:async(...args)=>{saved.push(args);return {ok:true}},refreshAfterTickTickTaskChange:async()=>{},
  requestAnimationFrame:fn=>fn(),document:{querySelector:()=>null},window:{scrollX:0,scrollY:0,scrollTo(){}},console};
 const attach=vm.runInNewContext(src.slice(start,end)+';calendarAttachTaskTimeDrag',ctx);
 const task={id:'diana-a__2026-10-21',privateLocal:true,personal:true,projectId:'',canComplete:true,repeatFlag:'FREQ=DAILY'};
 attach(block,{textContent:'09:00'},{task,start:540,end:585},'2026-10-21',{scrollTop:400},true);
 assert.equal(classes.has('calendar-week-draggable'),true);
 let prevented=false;listeners.click({preventDefault(){prevented=true},stopImmediatePropagation(){}});assert.equal(prevented,false);
 const event={isPrimary:true,pointerType:'touch',pointerId:1,button:0,clientX:0,clientY:0,target:{closest:()=>null},preventDefault(){},stopPropagation(){}};
 listeners.pointerdown(event);timers.find(timer=>timer.delay===420).fn();listeners.pointermove({...event,clientY:72});listeners.pointerup({...event,clientY:72});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saved.length,1);assert.equal(saved[0][2],'10:00');
 listeners.click({preventDefault(){prevented=true},stopImmediatePropagation(){}});assert.equal(prevented,true);
});
test('both actors tap timeline task text to open their editor, while checkbox taps only complete',()=>{
 const vm=require('node:vm'),src=fs.readFileSync('public/app.js','utf8');
 const start=src.indexOf('const attachCompletion=(row,task)=>{'),end=src.indexOf('// Weekly timeline shows',start);
 for(const actor of ['Рустам','Диана']){
  const listeners={},opened=[],completed=[],checkbox={setAttribute(){},addEventListener(name,fn){this[name]=fn},contains:target=>target==='checkbox-child'},row={classList:{add(){},contains:()=>false},style:{},setAttribute(){},prepend(){},addEventListener:(name,fn)=>listeners[name]=fn};
  const task={id:'task-a',personal:true,privateLocal:actor==='Диана',projectId:actor==='Рустам'?'rustam-list':'',title:'Дело'};
  const ctx={taskCompletionIsFuture:()=>false,dateKey:'2026-10-22',currentActor:actor,calendarScope:'personal',sharedWritable:true,document:{createElement:()=>checkbox},calendarTickTickTaskWebUrl:()=>actor==='Рустам'?'https://ticktick.com/task-a':'',calendarTaskCanReopen:()=>false,calendarPersonalTaskEditorContext:()=>({actor}),window:{RUDIPersonalTaskEditor:{open:(...args)=>opened.push(args),bind(){}}},completeCalendarTickTickTask:(...args)=>completed.push(args)};
  const attach=vm.runInNewContext(src.slice(start,end)+';attachCompletion',ctx);attach(row,task);
  listeners.click({target:{}});assert.equal(opened.length,1);assert.equal(opened[0][0].id,'task-a');
  listeners.click({target:checkbox});assert.equal(opened.length,1);
  checkbox.click({stopPropagation(){}});assert.equal(completed.length,1);assert.equal(opened.length,1);
 }
});
test('Diana drag updates series clock without resetting anchor or completion snapshots',async()=>{
 const {personalTasks}=require(apiPath),h=fixture(),options={client:h.client,now:Date.parse('2026-10-19T10:00Z')};
 await personalTasks({actor:'Диана',operation:'create',clientId:'drag-series',title:'Спорт',date:'2026-10-17',time:'09:00',repeat:'daily'},options);
 await personalTasks({actor:'Диана',operation:'complete',taskId:'diana-drag-series__2026-10-19'},options);
 await personalTasks({actor:'Диана',operation:'move',taskId:'diana-drag-series__2026-10-21',time:'18:15'},options);
 const list=await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},options);
 assert.equal(list.tasks.find(task=>task.date==='2026-10-21').startTime,'18:15');assert.equal(list.tasks.find(task=>task.date==='2026-10-21').seriesDate,'2026-10-17');
 assert.equal(list.tasks.find(task=>task.date==='2026-10-19').startTime,'09:00');
 const rows=[...h.rows.entries()];assert.ok(rows.filter(([key])=>key.startsWith('rudi-personal-calendar-v1:diana|')).every(([,task])=>!task.completed&&!task.deleted&&!task.kind));
 assert.ok(rows.filter(([key])=>key.includes(':done:')||key.includes(':tombstones')).every(([,value])=>!value.title&&!value.description));
});
test('Diana create persists and appears in calendar using real D1 missing-record response contract',async()=>{
 const {createD1StateClient}=require('../api/d1-state-client.cjs');
 const {personalTasks}=require(apiPath),records=new Map();
 const client=createD1StateClient({baseUrl:'https://worker.example',secret:'test',batchReads:false,fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body),key=body.namespace+'|'+body.key,path=new URL(url).pathname;
  let data;
  if(path==='/get')data={ok:true,value:records.get(key)??null};
  else if(path==='/set-if-absent'){
   const inserted=!records.has(key);if(inserted)records.set(key,body.value);data={ok:true,inserted};
  }else if(path==='/list')data={ok:true,items:[...records.entries()].filter(([key])=>key.startsWith(body.namespace+'|')).map(([key,value])=>({key:key.slice(body.namespace.length+1),value}))};
  else if(path==='/delete'){records.delete(key);data={ok:true,deleted:true}}
  else throw Error('Unexpected D1 request: '+path);
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 }});
 const saved=await personalTasks({actor:'Диана',operation:'create',clientId:'d1-real-contract',title:'Аптека',date:'2026-10-17',time:'18:15'},{client});
 assert.equal(saved.created,true);assert.equal(records.size,1,'acknowledged create must write a live task when tombstone value is null');
 const readback=await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},{client});
 assert.equal(readback.tasks.length,1);assert.equal(readback.tasks[0].id,saved.taskId);assert.equal(readback.tasks[0].title,'🏥 Аптека');
 await personalTasks({actor:'Диана',operation:'delete',taskId:saved.taskId},{client});
 await personalTasks({actor:'Диана',operation:'create',clientId:'d1-real-contract',title:'Аптека',date:'2026-10-17'},{client});
 assert.equal((await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},{client})).tasks.length,0,'a real tombstone still blocks resurrection');
});

test('Diana can reopen one completed occurrence without changing other dates',async()=>{
 const {personalTasks}=require(apiPath),h=fixture(),options={client:h.client,now:Date.parse('2026-10-24T10:00Z')};
 const created=await personalTasks({actor:'Диана',operation:'create',clientId:'reopen',title:'Дело',date:'2026-10-24',time:'12:00'},options);
 await personalTasks({actor:'Диана',operation:'complete',taskId:created.taskId},options);
 assert.equal((await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},options)).tasks[0].completed,true);
 await personalTasks({actor:'Диана',operation:'reopen',taskId:created.taskId},options);
 const tasks=(await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},options)).tasks;assert.equal(tasks.length,1);assert.notEqual(tasks[0].completed,true);assert.equal(tasks[0].startTime,'12:00');
});

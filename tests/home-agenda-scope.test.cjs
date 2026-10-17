'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/app.js','utf8');
function harness(){
 const start=src.indexOf("let sharedAgendaSelectedDay='today';"),end=src.indexOf('function renderTickTickTodayState(',start);
 const loaderStart=src.indexOf('async function loadTickTickNext('),loaderEnd=src.indexOf('function holidayDateLabel(',loaderStart);
 const values=new Map(),rendered=[],calls=[],nodes={};
 const ctx={currentActor:'Диана',localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
  document:{querySelectorAll:()=>[],getElementById:id=>nodes[id]||(nodes[id]={dataset:{},classList:{add(){},remove(){}},setAttribute(){},replaceChildren(){}})},tg:null,
  homeDashboardState:{tasks:[]},renderHomeDashboard(){},renderTickTickTodayState:payload=>rendered.push(payload),
  window:{rudiCalendarOffline:{isOffline:()=>false}},todayState:()=>({key:'2026-10-31'}),calendarDateShift:()=> '2026-11-01',telegramInitData:()=> 'session',currentStateBackupToken:'',
  invalidateManagedRequests(){},managedJsonRequest:async(resource,url,options)=>{calls.push({resource,url,body:options.body});return {ok:true,scope:options.body.scope||'shared',tasks:[],tomorrowTasks:[]}},console,setTimeout};
 assert.ok(src.slice(start,end).includes('function homeAgendaTasks('),'agenda must filter actor and selected scope');
 vm.runInNewContext(src.slice(start,end)+src.slice(loaderStart,loaderEnd)+';this.api={homeAgendaTasks,loadTickTickNext,setHomeAgendaScope,ensureHomeAgendaActor,cachedHomeAgenda,getScope:()=>sharedAgendaScope};',ctx);
 return {ctx,api:ctx.api,rendered,calls,values};
}
test('scope choice defaults shared, persists per actor and never shows another actor personal tasks',async()=>{
 const h=harness(),{api}=h;api.ensureHomeAgendaActor();assert.equal(api.getScope(),'shared');
 await api.setHomeAgendaScope('personal');assert.equal(api.getScope(),'personal');assert.equal(h.calls[0].body.scope,'personal');
 const tasks=[{id:'d',personal:true,privateLocal:true,responsible:'Диана'},{id:'r',personal:true,responsible:'Рустам'},{id:'s',personal:false}];
 assert.equal(api.homeAgendaTasks(tasks,'Диана','personal').map(t=>t.id).join(','),'d');assert.equal(api.homeAgendaTasks(tasks,'Диана','shared').map(t=>t.id).join(','),'s');
 h.ctx.currentActor='Рустам';api.ensureHomeAgendaActor();assert.equal(api.getScope(),'shared');h.ctx.currentActor='Диана';api.ensureHomeAgendaActor();assert.equal(api.getScope(),'personal');
});
test('late personal response cannot overwrite shared scope or another actor after switching',async()=>{
 const h=harness();h.api.ensureHomeAgendaActor();let finish;
 h.ctx.managedJsonRequest=async()=>new Promise(resolve=>{finish=resolve});
 const pending=h.api.setHomeAgendaScope('personal');await new Promise(resolve=>setImmediate(resolve));
 h.ctx.currentActor='Рустам';h.api.ensureHomeAgendaActor();const before=h.rendered.length;
 finish({ok:true,tasks:[{id:'d',personal:true,privateLocal:true,responsible:'Диана'}]});await pending;assert.equal(h.rendered.length,before);
});
test('offline agenda reads actor- and scope-matched calendar snapshots across month boundary',async()=>{
 const h=harness(),reads=[];h.api.ensureHomeAgendaActor();
 h.ctx.window.rudiCalendarOffline={isOffline:()=>true,cached:async(actor,scope,month)=>{reads.push({actor,scope,month});return {days:[{}],ticktickDays:[{date:month==='2026-10'?'2026-10-31':'2026-11-01',events:[{id:month,personal:true,privateLocal:true,responsible:'Диана'}]}]}},materialize:async(_a,_m,payload)=>payload};
 const payload=await h.api.cachedHomeAgenda('Диана','personal');assert.equal(payload.tasks.length,1);assert.equal(payload.tomorrowTasks.length,1);assert.equal(reads.map(row=>row.month).join(','),'2026-10,2026-11');assert.ok(reads.every(row=>row.actor==='Диана'&&row.scope==='personal'));
});
test('personal agenda today count ignores tomorrow selection; edit and checkbox use private handlers',async()=>{
 const h=harness(),opened=[],completions=[];
 function node(){return {dataset:{},style:{},children:[],events:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},replaceChildren(...children){this.children=children},append(...children){this.children.push(...children)},appendChild(child){this.children.push(child)},addEventListener(name,fn){this.events[name]=fn},querySelectorAll:()=>[],querySelector:()=>null}};
 const nodes={};h.ctx.document={querySelectorAll:()=>[],getElementById:id=>nodes[id]||(nodes[id]=node()),createElement:()=>node()};
 h.ctx.showTickTickWritePermission=()=>{};h.ctx.renderTickTickDetails=()=>{};h.ctx.tickTickTaskRecentlyCompleted=()=>false;h.ctx.tickTickTaskCanComplete=()=>true;
 h.ctx.tickTickAssigneeLabel=task=>task.personal?'Вместе':task.responsible||'Вместе';h.ctx.updateSharedAgendaAvatarPhoto=()=>{};
 h.ctx.window.RUDIPersonalTaskEditor={open:(...args)=>opened.push(args)};h.ctx.queueCalendarWhenOffline=async()=>null;
 h.ctx.completeTickTickTodayTask=(...args)=>completions.push(args);
 const start=src.indexOf('function renderTickTickTodayState('),end=src.indexOf('function setupTickTickDisclosure(',start);
 vm.runInNewContext(src.slice(start,end)+';this.renderActual=renderTickTickTodayState',h.ctx);
 await h.api.setHomeAgendaScope('personal');
 const personal={id:'diana-a',personal:true,privateLocal:true,responsible:'Диана',title:'Личное',date:'2026-10-31',startTime:'09:00'};
 h.ctx.renderActual({ok:true,writable:true,agendaActor:'Диана',agendaScope:'personal',tasks:[personal,{id:'shared',title:'Общее'}],tomorrowTasks:[{...personal,id:'tomorrow',date:'2026-11-01'}]});
 assert.equal(h.ctx.homeDashboardState.tasks.length,1);assert.equal(nodes.ticktickTodayList.children.length,1);
 const row=nodes.ticktickTodayList.children[0];assert.equal(row.children[1].children.length,1);assert.equal(row.children[1].children[0].dataset.person,'diana');row.children[2].events.click({stopPropagation(){}});
 assert.equal(opened.length,1);assert.equal(opened[0][0].id,'diana-a');assert.equal(opened[0][1].actor,'Диана');
 row.children[1].events.click({stopPropagation(){}});assert.equal(completions.length,1);assert.equal(completions[0][0].personal,true);
 vm.runInNewContext("sharedAgendaSelectedDay='tomorrow'",h.ctx);
 h.ctx.renderActual({ok:true,writable:true,agendaActor:'Диана',agendaScope:'personal',tasks:[personal],tomorrowTasks:[{...personal,id:'tomorrow',date:'2026-11-01'}]});
 assert.equal(nodes.ticktickTodayList.children[0].dataset.taskId,'tomorrow');assert.equal(h.ctx.homeDashboardState.tasks[0].id,'diana-a');
 h.ctx.tickTickTaskRecentlyCompleted=id=>id==='diana-a|2026-10-31';
 h.ctx.renderActual({ok:true,writable:true,agendaActor:'Диана',agendaScope:'personal',date:'2026-10-31',tasks:[personal],tomorrowTasks:[]});
 assert.equal(h.ctx.homeDashboardState.tasks.length,0,'a stale personal occurrence cannot reappear after completion');
 vm.runInNewContext("sharedAgendaSelectedDay='today'",h.ctx);
 h.ctx.renderActual({ok:true,writable:true,agendaActor:'Диана',agendaScope:'personal',tasks:[{...personal,id:'icloud-event',externalCalendar:true,canComplete:false,canEdit:false}],tomorrowTasks:[]});
 const external=nodes.ticktickTodayList.children[0];assert.equal(external.children[1].disabled,true);assert.equal(external.children[2].disabled,true);
 external.children[2].events.click({stopPropagation(){}});assert.equal(opened.length,1,'external iCloud event never opens private editor');
 h.ctx.tickTickTaskRecentlyCompleted=()=>false;h.ctx.currentActor='Рустам';h.api.ensureHomeAgendaActor();await h.api.setHomeAgendaScope('personal');
 h.ctx.renderActual({ok:true,writable:true,agendaActor:'Рустам',agendaScope:'personal',tasks:[{...personal,id:'rustam-a',privateLocal:false,responsible:'Рустам'}],tomorrowTasks:[]});
 const own=nodes.ticktickTodayList.children[0].children[1];assert.equal(own.children.length,1);assert.equal(own.children[0].dataset.person,'rustam');
 await h.api.setHomeAgendaScope('shared');h.ctx.renderActual({ok:true,writable:true,agendaActor:'Рустам',agendaScope:'shared',tasks:[{id:'shared',title:'Общее'}],tomorrowTasks:[]});
 assert.equal(nodes.ticktickTodayList.children[0].children[1].children.length,2);
 h.ctx.financeOverviewMoney=value=>String(value)+' ₽';await h.api.setHomeAgendaScope('personal');
 h.ctx.renderActual({ok:true,writable:false,agendaActor:'Рустам',agendaScope:'personal',tasks:[{id:'bill:rent:2026-10',title:'Квартира',financeObligation:true,amount:1000,personal:true,responsible:'Рустам',canEdit:false,canComplete:true}],tomorrowTasks:[]});
 const bill=nodes.ticktickTodayList.children[0];assert.equal(bill.children[1].disabled,false,'finance payment stays writable when personal TickTick is unavailable');assert.equal(bill.children[2].disabled,true);assert.match(bill.children[2].children[1].textContent,/1000 ₽/);
 bill.children[1].events.click({stopPropagation(){}});assert.equal(completions.at(-1)[3],true);
});
test('personal completion never calls shared completion endpoint',async()=>{
 const h=harness(),calls=[];h.ctx.completeCalendarTickTickTask=async(...args)=>{calls.push(args);return {ok:true}};
 h.ctx.requestTickTickTaskCompletion=()=>{throw Error('shared endpoint must not run')};
 const start=src.indexOf('async function completeTickTickTodayTask('),end=src.indexOf('let openTickTickTaskForEditing=',start);
 const complete=vm.runInNewContext(src.slice(start,end)+';completeTickTickTodayTask',h.ctx);
 await complete({id:'diana-a',personal:true,privateLocal:true},{},{},true);assert.equal(calls.length,1);
});
test('Home New opens the selected scope editor and selected day for both actors',()=>{
 const start=src.indexOf("add.addEventListener('click',()=>{\n          if(sharedAgendaScope==='personal')"),end=src.indexOf('openTickTickTaskForEditing=task=>open(task);',start);
 assert.ok(start>0&&end>start);
 for(const actor of ['Рустам','Диана'])for(const scope of ['personal','shared'])for(const day of ['today','tomorrow']){
  const personal=[],shared=[];let click;
  const ctx={sharedAgendaScope:scope,sharedAgendaSelectedDay:day,sharedAgendaLatestPayload:{tomorrowDate:'2026-11-01'},todayState:()=>({key:'2026-10-31'}),calendarDateShift:()=> '2026-11-01',financeNowDateTimeInputs:()=>({time:'18:15'}),homeAgendaPersonalContext:()=>({actor}),window:{RUDIPersonalTaskEditor:{create:payload=>personal.push(payload)}},open:(...args)=>shared.push(args),add:{addEventListener:(_event,fn)=>{click=fn}}};
  vm.runInNewContext(src.slice(start,end),ctx);click();
  const expected=day==='today'?'2026-10-31':'2026-11-01';
  if(scope==='personal'){assert.equal(personal.length,1);assert.equal(shared.length,0);assert.equal(personal[0].actor,actor);assert.equal(personal[0].date,expected)}
  else{assert.equal(shared.length,1);assert.equal(personal.length,0);assert.equal(shared[0][1].date,expected)}
 }
});
test('offline Home shows its durable agenda without requiring a calendar visit',async()=>{
 const h=harness();h.api.ensureHomeAgendaActor();
 h.ctx.window.rudiCalendarOffline={isOffline:()=>true,cached:async()=>null,cachedAgenda:async(actor,scope)=>({date:'2026-10-31',tomorrowDate:'2026-11-01',offlineSavedAt:1,tasks:[{id:'own',personal:true,privateLocal:true,responsible:'Диана'}],tomorrowTasks:[]}),materialize:async(_actor,_month,payload)=>payload};
 const payload=await h.api.cachedHomeAgenda('Диана','personal');assert.equal(payload.tasks.length,1);assert.equal(payload.tasks[0].id,'own');assert.equal(payload.offlineStale,true);
});
test('combined icon merges only own personal and assigned shared tasks, sorted, with no New button',async()=>{
 const h=harness();h.ctx.tickTickAssigneeLabel=t=>t.assignee||'Вместе';
 h.ctx.managedJsonRequest=async(_r,_url,{body})=>({ok:true,date:'2026-10-31',tasks:body.scope==='personal'?
  [{id:'own',personal:true,privateLocal:true,responsible:'Диана',startTime:'10:00'},{id:'other-private',personal:true,responsible:'Рустам'}]:
  [{id:'both',assignee:'Вместе',startTime:'11:00'},{id:'mine',assignee:'Диана',startTime:'09:00'},{id:'other',assignee:'Рустам'}],tomorrowTasks:[]});
 await h.api.setHomeAgendaScope('combined');const result=h.rendered.at(-1);
 assert.equal(result.tasks.map(t=>t.id).join(','),'mine,own,both');assert.equal(result.agendaScope,'combined');
 const html=fs.readFileSync('public/index.html','utf8');assert.match(html,/data-home-agenda-scope="combined"[^>]*aria-label="Все мои дела"/);
 assert.match(src,/add.hidden=sharedAgendaScope==='combined'/);
 h.ctx.currentActor='Рустам';h.api.ensureHomeAgendaActor();h.ctx.currentActor='Диана';h.api.ensureHomeAgendaActor();assert.equal(h.api.getScope(),'combined');
});
test('combined scope retains available calendar when the other fails and preserves row write permissions',async()=>{
 const h=harness();h.ctx.tickTickAssigneeLabel=t=>t.assignee||'Вместе';
 h.ctx.managedJsonRequest=async(_r,_u,{body})=>{if(body.scope==='personal')throw Object.assign(Error('missing-oauth'),{status:401});return {ok:true,writable:false,tasks:[{id:'shared',assignee:'Диана'}],tomorrowTasks:[]}};
 await h.api.setHomeAgendaScope('combined');const payload=h.rendered.at(-1);
 assert.equal(payload.tasks.length,1);assert.equal(payload.tasks[0].agendaWritable,false);assert.equal(payload.agendaPartial,true);
 assert.match(src,/const canComplete=task.agendaWritable!==false/);assert.match(src,/const canEdit=!task.financeObligation&&task.agendaWritable!==false/);
});
test('Home bill completion marks the exact finance month paid without invoking task APIs',async()=>{
 const h=harness(),paid=[],refresh=[];h.ctx.setCalendarObligationPaid=async(...args)=>{paid.push(args);return true};
 h.ctx.markTickTickTaskRecentlyCompleted=()=>{};h.ctx.refreshAfterTickTickTaskChange=async()=>refresh.push(true);
 h.ctx.completeCalendarTickTickTask=()=>{throw Error('bill cannot complete a calendar task')};
 const start=src.indexOf('async function completeTickTickTodayTask('),end=src.indexOf('let openTickTickTaskForEditing=',start);
 const complete=vm.runInNewContext(src.slice(start,end)+';completeTickTickTodayTask',h.ctx);
 const bill={id:'bill:rent:2026-11',personal:true,financeObligation:true,responsible:'Диана',obligation:{id:'rent'},obligationMonth:'2026-11'},row={dataset:{}},button={};
 await complete(bill,row,button,true);assert.equal(paid.length,1);assert.equal(paid[0][0].id,'rent');assert.equal(paid[0][1],'2026-11');assert.equal(paid[0][2],true);assert.equal(refresh.length,1);
 await complete({...bill,responsible:'Рустам'},row,button,true);assert.equal(paid.length,1);
});

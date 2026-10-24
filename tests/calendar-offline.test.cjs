'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(responder=null){
  const records=new Map();
  let upgraded=false, online=false, fail=false;
  const calls=[];
  const db={
    objectStoreNames:{contains:name=>records.has(name)},
    createObjectStore:name=>records.set(name,new Map()),
    transaction(name){
      const tx={
        objectStore(){
          const table=records.get(name);
          const request=result=>({result});
          const copy=value=>value===undefined?value:JSON.parse(JSON.stringify(value));
          return {
            getAll:()=>request([...table.values()].map(copy)),
            get:id=>request(copy(table.get(id))),
            add:value=>{if(table.has(value.id||value.key))throw Error('duplicate');table.set(value.id||value.key,copy(value));return request(value.id||value.key)},
            put:value=>{table.set(value.id||value.key,copy(value));return request(value.id||value.key)},
            delete:id=>{table.delete(id);return request(undefined)}
          };
        },oncomplete:null,onerror:null,onabort:null
      };
      setTimeout(()=>tx.oncomplete?.(),0);
      return tx;
    },close(){}
  };
  const indexedDB={open(){
    const request={result:db,onupgradeneeded:null,onsuccess:null,onerror:null};
    setTimeout(()=>{if(!upgraded){upgraded=true;request.onupgradeneeded?.()}request.onsuccess?.()},0);
    return request;
  }};
  const window={document:{body:{dataset:{offlineMode:''}}},dispatchEvent(){},crypto:{randomUUID:()=>String(Math.random())}};
  const fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    if(responder)return responder(url,JSON.parse(options.body));
    if(fail)throw TypeError('Lost response');
    return {ok:true,json:async()=>({ok:true})};
  };
  const CustomEvent=function(type,options={}){this.type=type;this.detail=options.detail};
  const navigator={get onLine(){return online}};
  const code=fs.readFileSync('public/calendar-offline.js','utf8');
  vm.runInNewContext(code,{window,indexedDB,navigator,fetch,CustomEvent,Math,JSON,Date,Promise,Error,String,Number,Array});
  return {
    api:window.rudiCalendarOffline,calls,records,
    setOnline:value=>{online=value},setFail:value=>{fail=value},setOfflineHint:value=>{window.document.body.dataset.offlineMode=value?'1':''}
  };
}
test('reopen queued offline restores the checked task and sends the same stable ID',async()=>{
 const h=harness();await h.api.init('Рустам');
 const task={id:'done',projectId:'joy',date:'2026-10-24',title:'Выполнено',completed:true,canComplete:false,personal:true};
 await h.api.enqueue('Рустам','personal-reopen',{operation:'reopen',taskId:task.id,projectId:task.projectId,task});
 const view=await h.api.materialize('Рустам','2026-10',{ticktickDays:[{date:task.date,events:[task]}]},'personal');
 assert.equal(view.ticktickDays[0].events[0].completed,false);
 h.setOnline(true);assert.equal((await h.api.flush('Рустам',()=>({}))).pending,0);
 assert.equal(h.calls[0].body.operation,'reopen');assert.equal(h.calls[0].body.taskId,'done');
});

test('calendar works offline, isolates accounts, preserves unsent actions, and replays once',async()=>{
  const h=harness(),o=h.api;
  await o.init('Рустам');
  const base={days:[{date:'2026-10-10',working:false,events:[]}],ticktickDays:[
    {date:'2026-10-10',events:[{id:'t1',title:'Old',date:'2026-10-10',startTime:'09:00'}]}
  ]};
  await o.capture('Рустам','shared','2026-10',base);
  await o.enqueue('Рустам','create',{value:{title:'Офлайн',date:'2026-10-10',time:'11:00'}});
  await o.enqueue('Рустам','complete',{taskId:'t1'});
  const local=await o.cached('Рустам','shared','2026-10');
  assert.equal(local.offlineStale,true);
  const view=await o.materialize('Рустам','2026-10',local);
  assert.equal(view.offlinePending,2);
  assert.equal(view.ticktickDays[0].events.map(e=>e.title).join(','),'Офлайн');
  assert.equal(await o.cached('Диана','shared','2026-10'),null);
  assert.equal(h.calls.length,0,'nothing was sent without network');
  h.setOnline(true);
  h.setOfflineHint(true);
  assert.equal(o.isOffline(),true,'iPhone may report online despite a failed connection');
  const paused=await o.flush('Рустам',()=>({initData:'secret'}));
  assert.equal(paused.sent,0);
  assert.equal(h.calls.length,0,'do not transmit queued writes while browser has offline hint');
  h.setOfflineHint(false);
  let result=await o.flush('Рустам',()=>({initData:'secret',backupToken:'secret'}));
  assert.equal(result.sent,2);
  assert.equal(result.pending,0);
  assert.equal(h.calls.length,2);
  assert.equal(h.records.get('outbox').size,0);
  assert.equal(JSON.stringify([...h.records.get('snapshots').values()]).includes('secret'),false);
  await o.enqueue('Рустам','create',{value:{title:'Uncertain',date:'2026-10-10'}});
  h.setFail(true);
  result=await o.flush('Рустам',()=>({initData:'secret'}));
  assert.equal(result.needsReview,1);
  assert.equal(result.pending,1);
  h.setFail(false);
  result=await o.flush('Рустам',()=>({initData:'secret'}));
  assert.equal(result.sent,0,'do not blindly retry an operation with an ambiguous delivery result');
  assert.equal(h.calls.length,3);
});

test('offline shell is versioned and pre-caches critical calendar assets before activation',()=>{
  const build=fs.readFileSync('build.cjs','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  const sw=fs.readFileSync('public/sw.js','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(build,/'calendar-offline\.js'/);
  assert.match(html,/src="\/calendar-offline\.js\?v=/);
  assert.ok(html.indexOf('/calendar-offline.js?v=')<html.indexOf('/app.js?v='));
  assert.match(sw,/await Promise\.all\(critical\.map\(url=>cache\.add\(url\)\)\)/);
  assert.match(sw,/const CACHE_NAME='rudi-shell-/);
  assert.match(app,/await queueCalendarWhenOffline\('create',\{value\}\)/);
  assert.match(app,/await calendarNetworkUnavailable\(true\)/);
  assert.match(app,/rudiCalendarOffline\?\.isOffline/);
  assert.match(app,/offlineStore\.capture\(currentActor,offlineScope,month,result\)/);
  assert.match(app,/offlineStore\.materialize\(currentActor,month,result,offlineScope\)/);
});

test('calendar detects unreachable network before mutations even if navigator says online',async()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const from=app.indexOf('let calendarReachabilityAt=0');
  const to=app.indexOf('async function requestTickTickTaskCompletion(',from);
  assert.ok(from>0&&to>from,'need isolated reachability and queue helper');
  const source=app.slice(from,to);
  const instantiate=(online,offlineHint,fetch)=>{
    const document={body:{dataset:{offlineMode:offlineHint?'1':''}}};
    const queued=[];
    const window={rudiCalendarOffline:{
      isOffline:()=>document.body.dataset.offlineMode==='1',
      enqueue:async(who,kind,details)=>{queued.push({who,kind,details});return {ok:true,queued:true}}
    }};
    const navigator={onLine:online};
    const tools=Function('window','navigator','document','fetch','currentActor',
      'setTimeout','clearTimeout','AbortController',
      source+';return {queueCalendarWhenOffline,calendarNetworkUnavailable};'
    )(window,navigator,document,fetch,'Рустам',setTimeout,clearTimeout,AbortController);
    return {...tools,queued,document};
  };
  const hidden=instantiate(true,true,async()=>{throw Error('actual network unavailable')});
  assert.equal((await hidden.queueCalendarWhenOffline('create',{value:{title:'Тест'}})).queued,true);
  assert.equal(hidden.queued.length,1);
  const disconnected=instantiate(true,false,async()=>{throw new TypeError('Failed to fetch')});
  assert.equal((await disconnected.queueCalendarWhenOffline('complete',{taskId:'one'})).queued,true);
  assert.equal(disconnected.queued.length,1);
  assert.equal(disconnected.document.body.dataset.offlineMode,'1');
  const connected=instantiate(true,false,async()=>({ok:true,headers:{get:()=>null}}));
  assert.equal(await connected.queueCalendarWhenOffline('create',{value:{title:'Live'}}),null);
  assert.equal(connected.queued.length,0);
  const reconnected=instantiate(true,true,async()=>({ok:true,headers:{get:()=>null}}));
  assert.equal(await reconnected.queueCalendarWhenOffline('update',{taskId:'task1'}),null);
  assert.equal(reconnected.queued.length,0,'a stale offline flag must not trap new edits');
  assert.equal(reconnected.document.body.dataset.offlineMode,'0','successful probe clears the stale flag');
});

test('cached calendar renders first and probes before choosing offline path',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const start=app.indexOf('async function loadWorkCalendar(');
  const end=app.indexOf('function setSharedCalendarRangeActive(',start);
  const fn=app.slice(start,end);
  assert.match(fn,/offlineStore\.cached\(currentActor,calendarScope,calendarActiveMonth\(\)\)/);
  assert.match(fn,/renderWorkCalendar\(offlineSnapshot,\{force:true\}\)/);
  assert.ok(fn.indexOf('renderWorkCalendar(offlineSnapshot,{force:true})')<
    fn.indexOf("promise=fetchCombinedCalendar('month')"),'disk cache should render before fetch');
  assert.match(fn,/if\(offlineStore\?\.isOffline\?\.\(\)&&await calendarNetworkUnavailable\(true\)\)\{/);
  assert.match(fn,/if\(offlineSnapshot\)return offlineSnapshot;/);
  assert.match(fn,/Офлайн · нет сохранённых данных/);
  assert.match(app,/hasRecentOfflineIdentity\?1800:5000/);
});

test('reconnection refreshes the calendar without restarting iOS PWA',async()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const start=app.indexOf('let reconnectCalendarPromise=null');
  const end=app.indexOf("window.addEventListener('online'",start);
  assert.ok(start>=0&&end>start);
  const reconnectSource=app.slice(start,end);
  const make=offline=>{
    const counts={probes:0,flushed:0,rendered:0,recovered:0};
    const func=Function('navigator','currentActor','appAccessReady','calendarNetworkUnavailable',
      'flushCalendarOffline','currentAppTab','loadWorkCalendar','currentWorkCalendarView',
      'window','CustomEvent','console','Date','Promise',
      'let calendarReachabilityAt=0;'+reconnectSource+';return reconnectCalendar;'
    )({onLine:true},'Рустам',true,async force=>{assert.equal(force,true);counts.probes++;return offline},
      async()=>{counts.flushed++;return {sent:0}},'schedule',
      async(_view,opt)=>{assert.equal(opt.force,true);counts.rendered++},'month',
      {dispatchEvent:()=>{counts.recovered++}},function(type){this.type=type},console,Date,Promise);
    return {func,counts};
  };
  const active=make(false);
  assert.equal(await active.func({force:true}),true);
  assert.deepEqual(active.counts,{probes:1,flushed:1,rendered:1,recovered:1});
  const failed=make(true);
  assert.equal(await failed.func({force:true}),false);
  assert.deepEqual(failed.counts,{probes:1,flushed:0,rendered:0,recovered:0});
});

test('offline calendar periodically rechecks network and refresh swipe attempts reconnect',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  assert.match(app,/window\.addEventListener\('online',\(\)=>\{reconnectCalendar\(\{force:true\}\)\}\)/);
  assert.match(app,/document\.visibilityState==='visible'&&window\.rudiCalendarOffline\?\.isOffline\?\.\(\)/);
  assert.match(app,/await reconnectCalendar\(\{force:true\}\)/);
  assert.match(app,/reconnectCalendar\(\);[\s\S]*?if\(offlineSnapshot\)return offlineSnapshot;/);
  assert.match(app,/rudi-calendar-network-recovered/);
  assert.match(pwa,/addEventListener\('rudi-calendar-network-recovered'/);
  assert.match(pwa,/banner\.hidden=true;[\s\S]*?document\.body\.dataset\.offlineMode='0'/);
});

test('personal TickTick edits are durable and use the personal API endpoint',async()=>{
  const h=harness(),store=h.api;
  const task={id:'t-one',projectId:'p-one',personal:true,title:'Старое',
    date:'2026-10-18',startTime:'10:00'};
  const saved={ok:true,ticktickDays:[{date:'2026-10-18',events:[task]}],days:[]};
  await store.capture('Рустам','personal','2026-10',saved);
  await store.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,
    projectId:task.projectId,title:'Новое',date:'2026-10-18',time:'11:30',task});
  const cached=await store.cached('Рустам','personal','2026-10');
  const view=await store.materialize('Рустам','2026-10',cached,'personal');
  assert.equal(view.ticktickDays[0].events[0].title,'Новое');
  assert.equal(view.ticktickDays[0].events[0].startTime,'11:30');
  assert.equal(view.ticktickDays[0].events[0].offlinePending,true);
  assert.equal((await store.summary('Рустам')).pending,1);
  const calendar=fs.readFileSync('public/calendar-offline.js','utf8');
  assert.match(calendar,/k==='personal-update'\|\|k==='personal-delete'/);
  const editor=fs.readFileSync('public/personal-task-editor.js','utf8');
  assert.match(editor,/kind=local/);
  assert.match(editor,/'personal-update'/);
});

test('Diana private offline create/edit/delete stays actor- and scope-isolated and replays only private endpoints',async()=>{
 const h=harness(),o=h.api;
 const base={days:[{date:'2026-10-17',events:[]}],ticktickDays:[]};
 await o.enqueue('Диана','diana-create',{clientId:'local-a',title:'Аптека',date:'2026-10-17',time:'18:15',description:'Личное'});
 let own=await o.materialize('Диана','2026-10',base,'personal');
 assert.equal(own.ticktickDays[0].events[0].id,'diana-local-a');assert.equal(own.ticktickDays[0].events[0].privateLocal,true);
 assert.equal(own.ticktickDays[0].events[0].startTime,'18:15');
 assert.equal((await o.materialize('Рустам','2026-10',base,'personal')).ticktickDays.length,0);
 assert.equal((await o.materialize('Диана','2026-10',base,'shared')).ticktickDays.length,0);
 await o.enqueue('Диана','diana-update',{taskId:'diana-local-a',operation:'save',title:'Магазин',date:'2026-10-17',time:'09:00'});
 own=await o.materialize('Диана','2026-10',base,'personal');assert.equal(own.ticktickDays[0].events[0].title,'Магазин');assert.equal(own.ticktickDays[0].events[0].startTime,'09:00');
 await o.enqueue('Диана','diana-delete',{taskId:'diana-local-a',operation:'delete'});
 own=await o.materialize('Диана','2026-10',base,'personal');assert.equal(own.ticktickDays[0].events.length,0);
 h.setOnline(true);const sent=await o.flush('Диана',()=>({initData:'diana-session'}));assert.equal(sent.sent,3);
 assert.ok(h.calls.every(call=>call.url.includes('ticktickAction=personal-task-')));
 assert.equal(h.calls[0].body.clientId,'local-a');assert.equal(h.calls[2].body.operation,'delete');assert.ok(h.calls.every(call=>!call.body.targetProjectId));
});
test('Diana uncertain create retries use the same idempotency id and never duplicate',async()=>{
 const h=harness();await h.api.enqueue('Диана','diana-create',{clientId:'stable-id',title:'Дело',date:'2026-10-17'});
 h.setOnline(true);h.setFail(true);await h.api.flush('Диана',()=>({initData:'diana'}));
 const queued=[...h.records.get('outbox').values()][0];queued.checkAt=0;h.records.get('outbox').set(queued.id,queued);
 h.setFail(false);const result=await h.api.flush('Диана',()=>({initData:'diana'}));
 assert.equal(result.sent,1);assert.equal(h.calls.length,2);assert.equal(h.calls[0].body.clientId,h.calls[1].body.clientId);
});
test('Diana recurring offline create, occurrence completion, series edit/delete preserves completed history',async()=>{
 const h=harness(),o=h.api,base={days:[{date:'2026-10-17',events:[]}],ticktickDays:[]};
 await o.enqueue('Диана','diana-create',{clientId:'repeat-a',title:'Витамины',date:'2026-10-17',time:'09:00',repeat:'daily',repeatEvery:2});
 let result=await o.materialize('Диана','2026-10',base,'personal');
 assert.equal(result.ticktickDays.length,8);assert.equal(result.ticktickDays[0].events[0].id,'diana-repeat-a__2026-10-17');
 await o.enqueue('Диана','diana-complete',{taskId:'diana-repeat-a__2026-10-19',operation:'complete'});
 result=await o.materialize('Диана','2026-10',base,'personal');assert.equal(result.ticktickDays.find(day=>day.date==='2026-10-19').events[0].completed,true);assert.equal(result.ticktickDays.find(day=>day.date==='2026-10-21').events[0].completed,undefined);
 await o.enqueue('Диана','diana-update',{taskId:'diana-repeat-a__2026-10-21',operation:'move',time:'18:15'});
 result=await o.materialize('Диана','2026-10',base,'personal');assert.equal(result.ticktickDays.find(day=>day.date==='2026-10-21').events[0].startTime,'18:15');assert.equal(result.ticktickDays.find(day=>day.date==='2026-10-19').events[0].startTime,'09:00');
 await o.enqueue('Диана','diana-delete',{taskId:'diana-repeat-a__2026-10-21',operation:'delete'});
 result=await o.materialize('Диана','2026-10',base,'personal');const remaining=result.ticktickDays.flatMap(day=>day.events);assert.equal(remaining.length,1);assert.equal(remaining[0].completed,true);
});
test('Home agenda durable snapshots isolate scope and actor without overwriting calendar or storing credentials',async()=>{
 const h=harness(),o=h.api;
 assert.equal(typeof o.captureAgenda,'function');
 await o.capture('Диана','personal','2026-10',{days:[{date:'2026-10-17'}],ticktickDays:[]});
 await o.captureAgenda('Диана','personal',{ok:true,date:'2026-10-17',tomorrowDate:'2026-10-18',tasks:[{id:'d',personal:true,privateLocal:true,title:'Дело',accessToken:'secret'}],tomorrowTasks:[],initData:'secret',backupToken:'secret'});
 assert.equal((await o.cachedAgenda('Диана','personal')).tasks[0].id,'d');assert.equal(await o.cachedAgenda('Рустам','personal'),null);assert.equal(await o.cachedAgenda('Диана','shared'),null);
 assert.equal((await o.cached('Диана','personal','2026-10')).days.length,1);
 assert.equal(JSON.stringify([...h.records.get('snapshots').values()]).includes('secret'),false);
});

function agendaFixture(date='2026-10-20',tomorrowDate='2026-10-21'){
  const task={id:'personal-date',personal:true,projectId:'joy',responsible:'Рустам',title:'Увидеться с друзьями',date,startTime:'19:30'};
  return {task,payload:{ok:true,date,tomorrowDate,tasks:[task],tomorrowTasks:[],writable:true}};
}
async function loadHomeForTest(h,payload){
  const source=fs.readFileSync('public/app.js','utf8');
  const from=source.indexOf('async function loadTickTickNext('),to=source.indexOf('function holidayDateLabel()',from);
  let rendered;
  const store=h.api;
  const context={currentActor:'Рустам',sharedAgendaScope:'personal',ensureHomeAgendaActor(){},
    window:{rudiCalendarOffline:store},invalidateManagedRequests(){},telegramInitData:()=>'',currentStateBackupToken:'',
    managedJsonRequest:async()=>payload,renderTickTickTodayState:value=>{rendered=value},
    cachedHomeAgenda:async()=>store.cachedAgenda('Рустам','personal'),
    mergeHomeAgendas(){throw Error('unexpected combined scope')},setTimeout,Promise};
  const load=vm.runInNewContext(source.slice(from,to)+';loadTickTickNext',context);
  await load({force:true});return rendered;
}
test('Home online refresh uses queued date instead of stale TickTick response',async()=>{
  const h=harness(),{task,payload}=agendaFixture();h.setOnline(true);
  await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,projectId:'joy',targetProjectId:'joy',task,title:task.title,date:'2026-10-27',time:'19:30'});
  const rendered=await loadHomeForTest(h,payload);
  assert.equal(rendered.tasks.length,0,'a task moved to 27 October must disappear from today immediately');
  assert.equal(payload.tasks[0].date,'2026-10-20','server data must not be mutated');
});
test('Home online refresh moves an edited task to tomorrow across a month boundary',async()=>{
  const h=harness(),{task,payload}=agendaFixture('2026-10-31','2026-11-01');h.setOnline(true);
  await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,projectId:'joy',task,title:task.title,date:'2026-11-01',time:'20:15'});
  const rendered=await loadHomeForTest(h,payload);
  assert.equal(rendered.tasks.length,0);
  assert.equal(rendered.tomorrowTasks.length,1);assert.equal(rendered.tomorrowTasks[0].startTime,'20:15');
});
test('acknowledged date persists in Home and calendar snapshots after queue removal',async()=>{
  const h=harness(),o=h.api,{task,payload}=agendaFixture();
  await o.captureAgenda('Рустам','personal',payload);
  await o.captureAgenda('Диана','personal',{...payload,tasks:[{...task,responsible:'Диана'}]});
  await o.capture('Рустам','personal','2026-10',{days:[{date:task.date}],ticktickDays:[{date:task.date,events:[task]}]});
  await o.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,projectId:'joy',task,title:task.title,date:'2026-10-27',time:'19:30'});
  h.setOnline(true);assert.equal((await o.flush('Рустам',()=>({initData:'secret'}))).sent,1);
  assert.equal((await o.summary('Рустам')).pending,0);
  h.setOnline(false);
  const home=await o.cachedAgenda('Рустам','personal');assert.equal(home.tasks.length,0,'going offline after sync must not resurrect the old date');
  const calendar=await o.cached('Рустам','personal','2026-10');
  assert.equal(calendar.ticktickDays.find(day=>day.date==='2026-10-27').events[0].date,'2026-10-27');
  assert.equal((await o.cachedAgenda('Диана','personal')).tasks.length,1,'other actor remains unchanged');
  assert.equal(JSON.stringify([...h.records.get('snapshots').values()]).includes('secret'),false);
});
test('failed sync keeps the edited Home date visible and retryable',async()=>{
  const h=harness(),{task,payload}=agendaFixture();h.setOnline(true);h.setFail(true);
  await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,projectId:'joy',task,title:task.title,date:payload.tomorrowDate,time:'18:45'});
  const result=await h.api.flush('Рустам',()=>({}));assert.equal(result.pending,1);
  const rendered=await loadHomeForTest(h,payload);
  assert.equal(rendered.tasks.length,0);assert.equal(rendered.tomorrowTasks[0].startTime,'18:45');
});
test('Home projection isolates actors and shared tasks from personal date edits',async()=>{
  const h=harness(),{task,payload}=agendaFixture();
  await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,projectId:'joy',task,title:task.title,date:'2026-10-27',time:'19:30'});
  assert.equal((await h.api.materializeAgenda('Диана','personal',payload)).tasks.length,1);
  assert.equal((await h.api.materializeAgenda('Рустам','shared',payload)).tasks.length,1);
});
test('online Home remains readable if local IndexedDB projection is unavailable',async()=>{
  const h=harness(),{payload}=agendaFixture();h.setOnline(true);
  h.api.materializeAgenda=async()=>{throw Error('offline-db-blocked')};
  const rendered=await loadHomeForTest(h,payload);
  assert.equal(rendered.tasks.length,1);
});
test('moving one task preserves unrelated today tasks from the same server response',async()=>{
 const h=harness(),{task,payload}=agendaFixture();h.setOnline(true);
 payload.tasks.push({...task,id:'study',title:'Практика с ДПС',startTime:'20:00'});
 await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,projectId:'joy',task,title:task.title,date:'2026-10-27',time:'19:30'});
 const rendered=await loadHomeForTest(h,payload);
 assert.deepEqual(Array.from(rendered.tasks,task=>task.id),['study']);
});

test('twelve interrupted same-list edits recover without a calendar read or duplicate tasks',async()=>{
 const h=harness();h.setOnline(true);
 for(let n=0;n<12;n++)await h.api.enqueue('Рустам','personal-update',{
  operation:'save',taskId:'task-'+n,projectId:'joy',targetProjectId:'joy',title:'Дело '+n,date:'2026-10-27',time:'19:30'});
 for(const row of h.records.get('outbox').values()){row.state='review';row.checkAt=0;}
 const result=await h.api.flush('Рустам',()=>({initData:'session'}));
 assert.equal(result.sent,12);assert.equal(result.pending,0);
 assert.equal(h.calls.length,12);
 assert.ok(h.calls.every(call=>call.url.includes('personal-task-edit')));
});
test('an uncertain project move does not block an independent task but preserves same-task ordering',async()=>{
 const h=harness();h.setOnline(true);
 await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:'move',projectId:'old',targetProjectId:'new',date:'2026-10-27',title:'Move'});
 const first=[...h.records.get('outbox').values()][0];first.state='review';first.createdAt-=1000;
 await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:'move',projectId:'old',targetProjectId:'old',date:'2026-10-28',title:'Later'});
 await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:'other',projectId:'joy',targetProjectId:'joy',date:'2026-10-27',title:'Independent'});
 const result=await h.api.flush('Рустам',()=>({}));
 assert.equal(result.sent,1);assert.equal(result.pending,2);
 const writes=h.calls.filter(call=>call.url.includes('personal-task-edit'));
 assert.equal(writes.length,1);assert.equal(writes[0].body.taskId,'other');
});
test('rejected transfers cannot hide server tasks and retain their unsent changes for recovery',async()=>{
 const h=harness(),{task,payload}=agendaFixture();
 await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,projectId:'joy',targetProjectId:'joy',task,date:'2026-10-27',title:task.title});
 const row=[...h.records.get('outbox').values()][0];row.state='blocked';row.error='Проверь авторизацию RUDI';
 const home=await h.api.materializeAgenda('Рустам','personal',payload);
 assert.equal(home.tasks.length,1,'a server refusal must not masquerade as a successful move');
 assert.equal(home.offlineNeedsReview,1);assert.equal((await h.api.summary('Рустам')).pending,1);
 assert.equal(row.details.date,'2026-10-27','the requested change is retained');
});
test('private completion readback succeeds even while the unrelated shared integration is unavailable',async()=>{
 const task={id:'done',projectId:'joy',personal:true,date:'2026-10-20'};
 const h=harness(async url=>{
  assert.equal(url,'/api/partner-message?ticktickAction=personal-task-state');
  return {ok:true,json:async()=>({ok:true,sharedUnavailable:true,personalUnavailable:false,personalConnected:true,
   found:true,task:{...task,completed:true}})};
 });h.setOnline(true);
 await h.api.enqueue('Рустам','personal-complete',{taskId:task.id,projectId:'joy',task});
 for(const row of h.records.get('outbox').values())row.state='review';
 const result=await h.api.flush('Рустам',()=>({}));
 assert.equal(result.sent,1);assert.equal(result.pending,0);assert.equal(h.calls.length,1);
});

test('three uncertain private actions reconcile by task without a full calendar read or repeated completion',async()=>{
 const tasks={daily:{date:'2026-10-21',startTime:'20:00',recurring:true,completed:false},moved:{date:'2026-10-20',startTime:'19:45',completed:false}};
 const h=harness(async(url,body)=>{
  if(!url.includes('personal-task-state'))return {ok:false,status:429,json:async()=>({ok:false})};
  return {ok:true,json:async()=>({ok:true,found:body.taskId!=='deleted',task:tasks[body.taskId]})};
 });h.setOnline(true);
 for(const [kind,id] of [['personal-complete','daily'],['personal-delete','deleted'],['personal-move','moved']]){
  await h.api.enqueue('Рустам',kind,{taskId:id,projectId:'own',date:'2026-10-20',time:'19:45',task:{id,personal:true,date:'2026-10-20'}});
 }
 for(const row of h.records.get('outbox').values()){row.state='review';row.createdAt=Date.now()-60000;}
 const result=await h.api.flush('Рустам',()=>({}));
 assert.equal(result.pending,0);assert.equal(result.sent,3);
 assert.equal(h.calls.length,3);assert.ok(h.calls.every(call=>call.url.includes('personal-task-state')));
});
test('acknowledging yesterdays recurring completion preserves the next occurrence in Home snapshots',async()=>{
 const task={id:'daily',projectId:'own',personal:true,title:'Практика',date:'2026-10-21',startTime:'20:00'};
 const payload={ok:true,date:'2026-10-20',tomorrowDate:'2026-10-21',tasks:[],tomorrowTasks:[task]};
 const h=harness(async()=>({ok:true,json:async()=>({ok:true,found:true,task:{...task,completed:false,recurring:true}})}));
 await h.api.captureAgenda('Рустам','personal',payload);
 await h.api.enqueue('Рустам','personal-complete',{taskId:task.id,projectId:task.projectId,task:{...task,date:'2026-10-20'}});
 for(const row of h.records.get('outbox').values())row.state='review';
 assert.equal((await h.api.materializeAgenda('Рустам','personal',payload)).tomorrowTasks.length,1);
 h.setOnline(true);assert.equal((await h.api.flush('Рустам',()=>({}))).pending,0);
 assert.equal((await h.api.cachedAgenda('Рустам','personal')).tomorrowTasks.length,1);
});
test('lost real editor reply recovers twelve ordered writes without creating or deleting any task',async()=>{
 const {editPersonalTask}=require('../api/personal-task-editor.cjs');
 const server=new Map([['meeting',{id:'meeting',projectId:'joy',status:0,title:'Встреча',startDate:'2026-10-20T19:30:00+0300'}],
  ['study',{id:'study',projectId:'joy',status:0,title:'Практика с ДПС',startDate:'2026-10-20T20:00:00+0300'}]]);
 let lost=false,updates=0;
 const h=harness(async(url,body)=>{
  assert.ok(url.includes('personal-task-edit'),'retry must not depend on the combined calendar');
  const output=await editPersonalTask({...body,actor:'Рустам',token:{accessToken:'test'},sharedProjectId:'shared'},{
   tokenHasWriteScope:()=>true,listTickTickProjects:async()=>[{id:'joy',name:'Личный'}],
   fetchTask:async(_token,_project,id)=>({...server.get(id)}),
   updateTickTickTask:async(_token,_project,id,changes)=>{updates++;server.set(id,{...server.get(id),...changes});},
   createTickTickTask:async()=>{throw Error('must not create task')},deleteTickTickTask:async()=>{throw Error('must not delete task')}
  });
  if(!lost){lost=true;throw TypeError('Reply lost after server committed')}
  return {ok:true,json:async()=>output};
 });h.setOnline(true);
 for(let n=0;n<12;n++){
  const id=n%2?'study':'meeting',task={...server.get(id),date:'2026-10-20',personal:true};
  await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:id,projectId:'joy',targetProjectId:'joy',
   task,title:task.title,date:id==='meeting'?'2026-10-27':'2026-10-20',time:'20:'+String(n).padStart(2,'0')});
 }
 const rows=[...h.records.get('outbox').values()];rows.forEach((row,index)=>{row.createdAt=Date.now()-20000+index;});
 assert.equal((await h.api.flush('Рустам',()=>({}))).pending,12);
 for(const row of h.records.get('outbox').values())row.checkAt=0;
 const restored=await h.api.flush('Рустам',()=>({}));
 assert.equal(restored.pending,0);assert.equal(restored.sent,12);
 assert.equal(server.size,2);assert.equal(updates,13,'one reply was lost, so that stable-ID update is replayed once');
 assert.equal(server.get('meeting').startDate,'2026-10-27T20:10:00+0300');
 assert.equal(server.get('study').startDate,'2026-10-20T20:11:00+0300');
});
test('persisted UUID key order cannot override a newer local edit with an older date',async()=>{
 const h=harness(),{task,payload}=agendaFixture();
 for(const date of ['2026-10-21','2026-10-27'])await h.api.enqueue('Рустам','personal-update',{operation:'save',taskId:task.id,projectId:'joy',targetProjectId:'joy',task,date,title:task.title,time:'19:30'});
 const table=h.records.get('outbox'),rows=[...table.values()];rows.forEach((row,index)=>{row.createdAt=Date.now()-1000+index});
 table.clear();for(const row of rows.reverse())table.set(row.id,row);
 const view=await h.api.materialize('Рустам','2026-10',{ticktickDays:[{date:task.date,events:[task]}]},'personal');
 assert.equal(view.ticktickDays.find(day=>day.date==='2026-10-27')?.events.length,1);
 const home=await h.api.materializeAgenda('Рустам','personal',payload);
 assert.equal(home.tomorrowTasks.length,0);
});

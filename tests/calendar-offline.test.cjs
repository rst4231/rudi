'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(){
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
  assert.match(app,/offlineStore\.capture\(currentActor,offlineScope,month,result\)/);
  assert.match(app,/offlineStore\.materialize\(currentActor,month,result,offlineScope\)/);
});

test('calendar detects unreachable network before mutations even if navigator says online',async()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const from=app.indexOf('let calendarReachabilityAt=0');
  const to=app.indexOf('async function requestTickTickTaskCompletion(taskId)',from);
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
  const hidden=instantiate(true,true,async()=>{throw Error('should not request')});
  assert.equal((await hidden.queueCalendarWhenOffline('create',{value:{title:'Тест'}})).queued,true);
  assert.equal(hidden.queued.length,1);
  const disconnected=instantiate(true,false,async()=>{throw new TypeError('Failed to fetch')});
  assert.equal((await disconnected.queueCalendarWhenOffline('complete',{taskId:'one'})).queued,true);
  assert.equal(disconnected.queued.length,1);
  assert.equal(disconnected.document.body.dataset.offlineMode,'1');
  const connected=instantiate(true,false,async()=>({ok:true}));
  assert.equal(await connected.queueCalendarWhenOffline('create',{value:{title:'Live'}}),null);
  assert.equal(connected.queued.length,0);
});

test('cached calendar renders immediately and offline path never waits for TickTick',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const start=app.indexOf('async function loadWorkCalendar(');
  const end=app.indexOf('function setSharedCalendarRangeActive(',start);
  const fn=app.slice(start,end);
  assert.match(fn,/offlineStore\.cached\(currentActor,calendarScope,calendarActiveMonth\(\)\)/);
  assert.match(fn,/renderWorkCalendar\(offlineSnapshot,\{force:true\}\)/);
  assert.ok(fn.indexOf('renderWorkCalendar(offlineSnapshot,{force:true})')<
    fn.indexOf("promise=fetchCombinedCalendar('month')"),'disk cache should render before fetch');
  assert.match(fn,/if\(offlineStore\?\.isOffline\?\.\(\)\)\{/);
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

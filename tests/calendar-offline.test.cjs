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
  const window={dispatchEvent(){},crypto:{randomUUID:()=>String(Math.random())}};
  const fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    if(fail)throw TypeError('Lost response');
    return {ok:true,json:async()=>({ok:true})};
  };
  const CustomEvent=function(type,options){this.type=type;this.detail=options.detail};
  const navigator={get onLine(){return online}};
  const code=fs.readFileSync('public/calendar-offline.js','utf8');
  vm.runInNewContext(code,{window,indexedDB,navigator,fetch,CustomEvent,Math,JSON,Date,Promise,Error,String,Number,Array});
  return {
    api:window.rudiCalendarOffline,calls,records,
    setOnline:value=>{online=value},setFail:value=>{fail=value}
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
  assert.match(app,/offlineStore\.materialize\(currentActor,month,result\)/);
});

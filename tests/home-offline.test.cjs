'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function createOfflineHarness(){
  let first=true;
  const rows=new Map();
  const events=[];
  const db={
    objectStoreNames:{contains:name=>name==='snapshots'&&!first},
    createObjectStore:name=>{assert.equal(name,'snapshots')},
    transaction(){
      const tx={oncomplete:null,onerror:null,onabort:null,objectStore(){
        return {
          get:actor=>({result:rows.get(actor)}),
          put:value=>{rows.set(value.actor,JSON.parse(JSON.stringify(value)));return {result:value.actor}}
        }
      }};
      setTimeout(()=>tx.oncomplete?.(),0);
      return tx;
    },close(){}
  };
  const window={
    indexedDB:{open(){
      const request={result:db,onsuccess:null,onupgradeneeded:null,onerror:null};
      setTimeout(()=>{
        if(first){request.onupgradeneeded?.();first=false;}
        request.onsuccess?.();
      },0);
      return request;
    }},
    document:{body:{dataset:{offlineMode:''}}},
    dispatchEvent:event=>events.push(event.type)
  };
  const navigator={onLine:true};
  const CustomEvent=function(type,options){this.type=type;this.detail=options?.detail};
  vm.runInNewContext(fs.readFileSync('public/home-offline.js','utf8'),{
    window,navigator,CustomEvent,Promise,JSON,Date,Object,String,Number,Array,Error
  });
  return {window,navigator,rows,events,api:window.rudiHomeOffline};
}

test('main screen persists snapshots across restart and isolates two accounts',async()=>{
  const t=createOfflineHarness();
  const o=t.api;
  o.init('Рустам');
  assert.equal(await o.snapshot(),null);
  assert.equal(await o.save('Рустам',{activity:{count:4},mood:{mine:'joy'},backupToken:'secret',
    nested:{initData:'private',password:'private',valid:'safe'}},'2026-10-16'),true);
  let row=await o.snapshot();
  assert.equal(row.actor,'Рустам');
  assert.equal(row.home.activity.count,4);
  assert.equal(row.home.backupToken,undefined);
  assert.equal(row.home.nested.initData,undefined);
  assert.equal(row.home.nested.valid,'safe');
  o.init('Диана');
  assert.equal(await o.snapshot(),null);
  await o.save('Диана',{counts:{wishlist:7}},'2026-10-16');
  assert.equal((await o.snapshot()).home.counts.wishlist,7);
  o.init('Рустам');
  assert.equal((await o.snapshot()).home.activity.count,4);
  t.window.document.body.dataset.offlineMode='1';
  o.showCachedStatus(row.savedAt);
  assert.ok(t.events.includes('rudi-offline-snapshot-used'));
});

test('main screen uses disk before network and never caches fallback network responses',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  const build=fs.readFileSync('build.cjs','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  const sw=fs.readFileSync('public/sw.js','utf8');
  assert.ok(app.includes('const cached=await restoreHomeFromDisk();'));
  assert.ok(app.indexOf('const cached=await restoreHomeFromDisk();')<
    app.indexOf("fetchWithTimeout('/api/partner-message?rudiAction=home-bootstrap'"));
  assert.match(app,/if\(window\.rudiHomeOffline\?\.isOffline\?\.\(\)\)return cached\?\.home/);
  assert.match(app,/response\.headers\?\.get\?\.\('X-RUDI-Offline'\)!=='1'/);
  assert.match(app,/snapshot\.actor!==actor/);
  assert.match(pwa,/url\.pathname==='\/api\/supplements'&&operation==='overview'/);
  assert.match(pwa,/url\.pathname==='\/api\/finances'/);
  assert.ok(html.indexOf('/home-offline.js?v=')<html.indexOf('/app.js?v='));
  assert.match(build,/'home-offline\.js'/);
  assert.match(sw,/home-offline\\\.js/);
});

test('main screen reconnects, refreshes and clears offline without restarting app',async()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  const a=app.indexOf('let homeReconnectPromise=null');
  const b=app.indexOf("window.addEventListener('online'",a);
  assert.ok(a>0&&b>a);
  const source=app.slice(a,b);
  const trigger=online=>{
    const calls={home:0,tasks:0,supplements:0,sync:0,events:[],probes:0};
    const body={dataset:{offlineMode:'1'}};
    const func=Function('currentActor','appAccessReady','navigator','fetch','document',
      'window','CustomEvent','flushCalendarOffline','loadHomeBootstrap','loadTickTickNext',
      'loadSupplementIntakeOverview','currentAppTab','homeBootstrapHashes',
      'homeBootstrapLoadedAt','setTimeout','clearTimeout','AbortController',
      'console','Promise','Date',
      source+';return reconnectHome;'
    )('Рустам',true,{onLine:true},async()=>{
        calls.probes++;return {ok:online};
      },{body},{dispatchEvent:event=>calls.events.push(event.type)},
      function(type){this.type=type},async()=>{calls.sync++},
      async()=>{calls.home++},async()=>{calls.tasks++},async()=>{calls.supplements++},
      'home',null,0,setTimeout,clearTimeout,AbortController,console,Promise,Date);
    return {calls,body,func};
  };
  const recovered=trigger(true);
  assert.equal(await recovered.func({force:true}),true);
  assert.equal(recovered.body.dataset.offlineMode,'0');
  assert.deepEqual(recovered.calls.events,['rudi-home-network-recovered']);
  assert.equal(recovered.calls.sync,1);
  assert.equal(recovered.calls.home,1);
  assert.equal(recovered.calls.tasks,1);
  assert.equal(recovered.calls.supplements,1);
  const failed=trigger(false);
  assert.equal(await failed.func({force:true}),false);
  assert.equal(failed.body.dataset.offlineMode,'1');
  assert.equal(failed.calls.sync,0);
  assert.ok(pwa.includes("window.addEventListener('rudi-home-network-recovered'"));
  assert.match(app,/},15000\)/);
  assert.match(app,/const restored=wasHomeOffline\?await reconnectHome\(\{force:true\}\):false/);
});

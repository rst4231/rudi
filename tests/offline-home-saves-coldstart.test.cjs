'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const savesSource=fs.readFileSync('public/rudi-offline-saves.js','utf8');

function harness(){
  const tables=new Map();let initialized=false;const records=[];
  const db={
    objectStoreNames:{contains:name=>tables.has(name)},
    createObjectStore:name=>tables.set(name,new Map()),
    transaction(name){
      const table=tables.get(name),tx={oncomplete:null,onerror:null,onabort:null};
      const copy=data=>data===undefined?data:JSON.parse(JSON.stringify(data));
      tx.objectStore=()=>({
        get:key=>({result:copy(table.get(key))}),
        getAll:()=>({result:[...table.values()].map(copy)}),
        put:row=>{table.set(row.id??row.actor,copy(row));return {result:row.id??row.actor}},
        delete:key=>{table.delete(key);return {result:undefined}}
      });
      setTimeout(()=>tx.oncomplete?.(),0);
      return tx;
    },close(){}
  };
  const indexedDB={open(){
    const req={result:db,onupgradeneeded:null,onsuccess:null,onerror:null};
    setTimeout(()=>{if(!initialized){initialized=true;req.onupgradeneeded?.()}req.onsuccess?.()},0);
    return req;
  }};
  const nav={onLine:false},body={dataset:{rudiActor:'Рустам',offlineMode:'1'}};
  const root={indexedDB,document:{body,visibilityState:'visible',addEventListener(){}},
    __rudiNetworkReachable:false,crypto:{randomUUID:()=>String(Math.random())},
    dispatchEvent:e=>records.push(e.type),addEventListener(){}};
  function boot(){
    vm.runInNewContext(savesSource,{window:root,indexedDB,navigator:nav,Date,Promise,JSON,Math,Error,
      CustomEvent:class{constructor(type){this.type=type}},
      setInterval:()=>0,setTimeout});
    return root.rudiOfflineSaves;
  }
  return {boot,root,nav,tables,records};
}
test('saved dates survive offline cold restart; actor-scoped; credentials not stored',async()=>{
  const h=harness(),api=h.boot(),sender=async()=>{throw Error('offline send invoked')};
  const out=await api.request('add',{type:'date',payload:{title:'Дома',backupToken:'secret'}},sender);
  assert.equal(out.queued,true);
  assert.equal(out.items[0].payload.title,'Дома');
  assert.equal(JSON.stringify(h.tables.get('outbox')).includes('secret'),false);
  const relaunched=h.boot();
  assert.equal((await relaunched.project('Рустам')).items.length,1);
  h.root.document.body.dataset.rudiActor='Диана';
  assert.equal((await relaunched.project('Диана')).items.length,0);
});
test('saved dates replay in order after reconnection without re-sending deleted local adds',async()=>{
  const h=harness(),api=h.boot();
  let calls=0;const sender=async(op,payload)=>{calls++;return {ok:true,items:op==='add'?
    [{id:'server1',type:payload.type,payload:payload.payload}]:[]}};
  const first=await api.request('add',{type:'date',payload:{title:'Тест'}},sender);
  await api.request('remove',{id:first.item.id},sender);
  assert.equal((await api.pending('Рустам')).length,0);
  const keep=await api.request('add',{type:'recipe',payload:{title:'Ужин'}},sender);
  h.nav.onLine=true;h.root.__rudiNetworkReachable=true;h.root.document.body.dataset.offlineMode='';
  assert.equal((await api.flush()).sent,1);
  assert.equal(calls,1);
  assert.equal((await api.pending('Рустам')).length,0);
  assert.equal((await api.project('Рустам')).items[0].id,'server1');
});
test('smart home commands remain disabled offline, including scenarios and vacuum',()=>{
  const src=fs.readFileSync('public/smart-home.js','utf8');
  assert.match(src,/if\(operation!=='list'&&controlsOffline\(\)\)/);
  assert.match(src,/if\(controlsOffline\(\)\)\{updateOfflineControls\(\);return\}/);
  assert.match(src,/actions\.appendChild\(lockOfflineControl\(button\)\)/);
  assert.match(src,/options\.appendChild\(lockOfflineControl\(button\)\)/);
  assert.match(src,/list\.appendChild\(lockOfflineControl\(button\)\)/);
  assert.match(src,/button\.disabled=controlsOffline\(\)\|\|!scenario\.active/);
  assert.match(src,/if\(state\.actor!==actor\)/);
});
test('offline cold launch serves cached HTML before waiting for network',()=>{
  const sw=fs.readFileSync('public/sw.js','utf8');
  const from=sw.indexOf("if(request.mode==='navigate')"),to=sw.indexOf('const isStatic=',from);
  assert.ok(from>0&&to>from);
  const src=sw.slice(from,to);
  assert.ok(src.indexOf("const cached=(await cache.match(request))")<src.indexOf('fetchWithTimeout'));
  assert.match(src,/return cached/);
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(html,/<style>html,body\{background:#0b0d12/);
  assert.match(html,/html body\.auth-pending #appGate\{display:grid!important/);
});
test('all referenced versioned assets, including saved module and home images, in worker cache',()=>{
  const sw=fs.readFileSync('public/sw.js','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  const assets=[...new Set(html.match(/\/[a-zA-Z0-9_-]+\.(?:js|css)\?v=[0-9.]+/g)||[])];
  assert.deepEqual(assets.filter(url=>!sw.includes('"'+url+'"')),[]);
  assert.match(sw,/home-scene-morning\.svg\?v=2\.104/);
  assert.match(sw,/changan-uni-v-header\.webp/);
  assert.match(sw,/rudi-offline-saves\.js/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/rudi-offline-content.js','utf8');
function makeHarness(){
 const data=new Map(), requests=[];
 let online=false, dropAnswer=false, ident=0,interceptor=null;
 const idb={open(){
  const request={};
  setImmediate(()=>{
   const db={
    objectStoreNames:{contains:name=>data.has(name)},
    createObjectStore:name=>data.set(name,new Map()),
    transaction(name){
     const tx={};
     tx.objectStore=()=>({
      get:key=>{const req={result:data.get(name).get(key)};setImmediate(()=>req.onsuccess?.());return req},
      getAll:()=>({result:[...data.get(name).values()]}),
      put:row=>{data.get(name).set(row.id||row.key,JSON.parse(JSON.stringify(row)));return {result:row}},
      delete:key=>{data.get(name).delete(key);return {result:null}},
     });
     setImmediate(()=>setImmediate(()=>tx.oncomplete?.()));
     return tx;
    },
    close(){}
   };
   request.result=db;
   request.onupgradeneeded?.();
   request.onsuccess?.();
  });
  return request;
 }};
 const nav={onLine:true};
 const document={visibilityState:'visible',body:{dataset:{appTab:'feed',offlineMode:'0'}},
  addEventListener(){},getElementById(){return {hidden:true,textContent:''}}};
 const fetch=async(url,options)=>{
  if(!online)throw Error('offline');
  if(url.startsWith('/version.json'))return {ok:true,headers:{get:()=>null}};
  const body=JSON.parse(options.body);
  requests.push({url,body});
  if(interceptor){const response=await interceptor(body);if(response)return response}
  if(body.operation==='answer'&&dropAnswer){
   dropAnswer=false;throw Error('response lost after server commit');
  }
  return {ok:true,json:async()=>({ok:true,note:{text:body.text||'',updatedAt:'server-revision'}})};
 };
 function mount(){
  const window={indexedDB:idb,navigator:nav,document,
   Telegram:{WebApp:{initData:'PRIVATE-SESSION'}},
   crypto:{randomUUID:()=>String(++ident)},
   addEventListener(){},dispatchEvent(){}};
  vm.runInNewContext(source,{
   window,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},
   fetch,setInterval:()=>0,setTimeout,clearTimeout,AbortController
  });
  return window.rudiOfflineContent;
 }
 return {mount,data,requests,online:value=>{online=value},drop:()=>{dropAnswer=true},intercept:fn=>{interceptor=fn},nav,document};
}

test('feed stays cached and operations survive restart, isolated by actor',async()=>{
 const h=makeHarness();
 let api=h.mount();api.init('Рустам');
 await api.capture('feed',{version:'feed-1',sections:{cinema:{parts:['Офлайн']}},token:'SECRET'});
 await api.enqueue('note','home',{text:'Локально',expectedUpdatedAt:'rev-1'});
 await api.enqueue('question','2026-10-16',{answer:'Ответ',expectedDate:'2026-10-16',
  expectedQuestionId:'dq-2026-10-16',offlineOperationId:'uuid-1'});
 await api.enqueue('feed-reaction','cinema:item',{target:{type:'cinema',key:'item'},liked:true});
 assert.equal((await api.entries()).length,3);
 assert.equal((await api.flush()).sent,0);
 api=h.mount();api.init('Диана');
 assert.equal((await api.entries()).length,0);
 assert.equal(await api.cached('feed'),null);
 api.init('Рустам');
 assert.equal((await api.entries()).length,3);
 assert.equal((await api.cached('feed')).version,'feed-1');
 const raw=JSON.stringify([...h.data.values()].flatMap(store=>[...store.values()]));
 assert.doesNotMatch(raw,/PRIVATE-SESSION|SECRET/);
});

test('lost reply keeps queue until verified retry, with no duplicate operation id',async()=>{
 const h=makeHarness();
 const api=h.mount();api.init('Рустам');
 await api.enqueue('question','2026-10-16',{answer:'Текст',expectedDate:'2026-10-16',
  expectedQuestionId:'dq-2026-10-16',offlineOperationId:'stable-uuid'});
 h.online(true);h.drop();
 assert.equal((await api.flush()).pending,1);
 assert.equal((await api.entries()).length,1);
 assert.equal((await api.flush()).pending,0);
 assert.equal((await api.entries()).length,0);
 assert.equal(h.requests.length,2);
 assert.deepEqual(h.requests.map(row=>row.body.offlineOperationId),['stable-uuid','stable-uuid']);
});

test('editing the same note before synchronizing does not lose latest text',async()=>{
 const h=makeHarness();const api=h.mount();api.init('Рустам');
 await api.enqueue('note','home',{text:'Первое',expectedUpdatedAt:'rev-0'});
 await api.enqueue('note','home',{text:'Второе',expectedUpdatedAt:'rev-999'});
 assert.equal((await api.entries()).length,1);
 assert.equal((await api.entries())[0].data.text,'Второе');
 assert.equal((await api.entries())[0].data.expectedUpdatedAt,'rev-0');
 await api.rebaseNote('rev-latest');
 assert.equal((await api.entries())[0].data.expectedUpdatedAt,'rev-latest');
 h.online(true);
 assert.equal((await api.flush()).pending,0);
 assert.equal(h.requests[0].body.text,'Второе');
});

test('shell, UI and API are connected without storing auth in snapshots',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 const html=fs.readFileSync('public/index.html','utf8');
 const sw=fs.readFileSync('public/sw.js','utf8');
 const note=fs.readFileSync('public/home-note.js','utf8');
 const api=fs.readFileSync('api/daily-question-store.cjs','utf8');
 assert.ok(html.includes('/rudi-offline-content.js?v='+JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.slice(1)));
 assert.ok(html.indexOf('src="/rudi-offline-content.js?v=')<html.indexOf('src="/app.js?v='));
 assert.match(sw,/rudi-offline-content\\\.js/);
 assert.match(app,/offline\?\.cached\?\.\('feed'\)/);
 assert.match(app,/offline\.enqueue\('question'/);
 assert.match(app,/offline\.enqueue\('feed-reaction'/);
 assert.match(note,/offline\.enqueue\('note',id/);
 assert.match(api,/expectedQuestionId/);
 assert.match(api,/alreadyAnswered:true/);
});

test('legacy home and multiple named notes coalesce independently and synchronize scoped revisions',async()=>{
 const h=makeHarness();let api=h.mount();api.init('Рустам');
 await api.capture('note',{text:'Старая заметка',updatedAt:'home-r',notes:[{id:'home',text:'Старая заметка',updatedAt:'home-r'},{id:'shopping',text:'Молоко и хлеб',title:'Покупки',pinned:true,updatedAt:'shop-r'}]});
 await api.enqueue('note','home',{text:'Старая заметка',expectedUpdatedAt:'home-r'});
 await api.enqueue('note','shopping',{id:'shopping',text:'Молоко',title:'Покупки',pinned:true,expectedUpdatedAt:'shop-r'});
 await api.enqueue('note','shopping',{id:'shopping',text:'Молоко и хлеб',title:'Покупки',pinned:true,expectedUpdatedAt:'ignored',localHistory:[{text:'Молоко',title:'Покупки'}]});
 api=h.mount();api.init('Рустам');
 assert.equal((await api.pending('note')).length,2);
 assert.equal((await api.pending('note','shopping'))[0].data.expectedUpdatedAt,'shop-r');
 h.online(true);assert.equal((await api.flush()).pending,0);
 assert.deepEqual(h.requests.map(r=>r.body.id),['home','shopping']);
 assert.equal(h.requests[1].body.localHistory[0].text,'Молоко');
 const snapshot=await api.cached('note');
 assert.equal(snapshot.notes.find(n=>n.id==='shopping').updatedAt,'server-revision');
 assert.equal(snapshot.notes.find(n=>n.id==='home').updatedAt,'server-revision');
 api.init('Диана');assert.equal(await api.cached('note'),null);assert.equal((await api.pending('note')).length,0);
});
test('one note conflict preserves its outbox and does not block independent notes',async()=>{
 const h=makeHarness();const api=h.mount();api.init('Рустам');
 await api.enqueue('note','home',{text:'Конфликт',expectedUpdatedAt:'old'});
 await api.enqueue('note','ideas',{id:'ideas',text:'Идея',expectedUpdatedAt:''});
 h.intercept(async body=>body.id==='home'?{ok:false,status:409,json:async()=>({ok:false,error:'note-conflict'})}:null);
 h.online(true);const result=await api.flush();
 assert.equal(result.sent,1);assert.equal(result.pending,1);
 assert.equal((await api.pending('note','home'))[0].error,'note-conflict');
 await api.rebaseNote('cloud-new',undefined,'home');
 assert.equal((await api.pending('note','home'))[0].data.expectedUpdatedAt,'cloud-new');
 h.intercept(null);assert.equal((await api.flush()).pending,0);
});
test('an edit made while its prior version is in flight remains queued with the acknowledged revision',async()=>{
 const h=makeHarness();const api=h.mount();api.init('Рустам');
 await api.enqueue('note','ideas',{id:'ideas',text:'Первое',expectedUpdatedAt:'r0'});
 let once=false;
 h.intercept(async body=>{
  if(!once&&body.id==='ideas'){
   once=true;await api.enqueue('note','ideas',{id:'ideas',text:'Второе',expectedUpdatedAt:'r0'});
  }
  return null;
 });
 h.online(true);const first=await api.flush();assert.equal(first.pending,1);
 const row=(await api.pending('note','ideas'))[0];assert.equal(row.data.text,'Второе');assert.equal(row.data.expectedUpdatedAt,'server-revision');
 assert.equal((await api.flush()).pending,0);assert.equal(h.requests.at(-1).body.text,'Второе');
});

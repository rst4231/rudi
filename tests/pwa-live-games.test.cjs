'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/pwa-extras.js','utf8');
function fixture(){
 const rows=new Map(),events=[],requests=[];let handler=async()=>new Response('{"ok":true}',{headers:{'content-type':'application/json'}}),opens=0;
 const indexedDB={open(){const request={};queueMicrotask(()=>{
  const db={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={};tx.objectStore=()=>({
   get(key){const r={};queueMicrotask(()=>{r.result=rows.get(key)||null;r.onsuccess?.()});return r},
   put(row){rows.set(row.key,structuredClone(row));queueMicrotask(()=>tx.oncomplete?.())}
  });return tx}};request.result=db;request.onsuccess?.();
 });opens++;return request}};
 const document={body:{dataset:{rudiActor:'Рустам'}},visibilityState:'visible',addEventListener(){}};
 const navigator={onLine:true};
 const window={location:{href:'https://rudi.test/',origin:'https://rudi.test'},indexedDB,
 fetch:async(...args)=>{requests.push(args);return handler(...args)},addEventListener(){},dispatchEvent:event=>events.push(event),setInterval(){},setTimeout(){}};
 const localStorage={getItem(){return null},setItem(){}};
 // Run the real wrapper and its dependencies, omitting unrelated UI installation.
 const boot=source.lastIndexOf('  installReleaseWatcher();');assert.ok(boot>0);
 vm.runInNewContext(source.slice(0,boot)+'  installBackgroundSync();window.__snapshotKey=snapshotRequestKey;})();',
  {window,document,navigator,indexedDB,localStorage,URL,URLSearchParams,Headers,Response,TypeError,Date,Map,Set,JSON,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}}});
 return {window,document,navigator,rows,events,requests,opens:()=>opens,key:window.__snapshotKey,fetch:window.fetch,native:fn=>{handler=fn}};
}
const options=()=>({method:'POST',body:JSON.stringify({operation:'get'})});
const routes=['battleship-game','duel-game','game-status'];
test('live game reads and mutations bypass offline snapshots through direct and index routes',async()=>{
 const h=fixture();
 for(const name of routes)for(const url of ['/api/'+name,'/api/index?route='+name])for(const init of [{},options(),{method:'POST',body:'{"operation":"move","index":4}'}]){
  assert.equal(h.key(url,init),'',url);
  await h.fetch(url,init);
 }
 assert.equal(h.opens(),0,'successful game requests must not store snapshot copies');
 assert.equal(h.requests.length,18);
});
test('canceled game polling rejects AbortError without showing offline state or a stale field',async()=>{
 const h=fixture();h.window.__rudiNetworkReachable=true;
 const oldKey='actor:Рустам|POST|/api/battleship-game||{"operation":"get"}';
 h.rows.set(oldKey,{key:oldKey,payload:{ok:true,room:{version:1}},updatedAt:Date.now()});
 h.native((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Canceled by caller','AbortError')),{once:true})));
 const controller=new AbortController();const result=h.fetch('/api/battleship-game',{...options(),signal:controller.signal});controller.abort();
 await assert.rejects(result,{name:'AbortError'});
 assert.equal(h.window.__rudiNetworkReachable,true);assert.equal(h.document.body.dataset.offlineMode,undefined);
 assert.ok(!h.events.some(event=>event.type==='rudi-offline-snapshot-used'));assert.equal(h.opens(),0);
});
test('failed game transport rejects even when an old snapshot exists and navigator reports offline',async()=>{
 const h=fixture();h.navigator.onLine=false;
 h.native(async()=>{throw new TypeError('Failed to fetch')});
 for(const name of routes)for(const url of ['/api/'+name,'/api/index?route='+name]){
  const oldKey='actor:Рустам|POST|'+url.split('?')[0]+'|'+(url.includes('?')?'route='+name:'')+'|{"operation":"get"}';
  h.rows.set(oldKey,{key:oldKey,payload:{ok:true,stale:true},updatedAt:Date.now()});
  await assert.rejects(h.fetch(url,options()),/Failed to fetch/);
 }
 assert.equal(h.requests.length,6);assert.equal(h.opens(),0);
 assert.equal(h.document.body.dataset.offlineMode,undefined);
 assert.ok(!h.events.some(event=>event.type==='rudi-offline-snapshot-used'));
});
test('ordinary section reads still capture successful responses and fall back to snapshots',async()=>{
 const h=fixture(),init=options(),url='/api/feed';
 h.native(async()=>new Response('{"ok":true,"items":["saved feed"]}',{headers:{'content-type':'application/json'}}));
 assert.deepEqual(await (await h.fetch(url,init)).json(),{ok:true,items:['saved feed']});
 for(let i=0;i<30&&!h.rows.has(h.key(url,init));i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(h.rows.has(h.key(url,init)),'the live read must persist its snapshot');
 h.native(async()=>{throw new TypeError('Failed to fetch')});
 const cached=await h.fetch(url,init);
 assert.equal(cached.headers.get('X-RUDI-Offline'),'1');
 assert.deepEqual(await cached.json(),{ok:true,items:['saved feed']});
 assert.equal(h.window.__rudiNetworkReachable,false);assert.equal(h.document.body.dataset.offlineMode,'1');
 assert.ok(h.events.some(event=>event.type==='rudi-offline-snapshot-used'));
});

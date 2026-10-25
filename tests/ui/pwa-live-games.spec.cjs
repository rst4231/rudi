const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const source=fs.readFileSync('public/pwa-extras.js','utf8');
const wrapper=source.slice(0,source.lastIndexOf('  installReleaseWatcher();'))+'  installBackgroundSync();})();';
test('PWA wrapper never substitutes stale multiplayer state or marks canceled game polls offline',async({page})=>{
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body data-rudi-actor="Рустам"></body>'}));
 await page.goto('/');
 await page.addScriptTag({content:wrapper});
 await page.evaluate(async()=>{
  window.__rudiNetworkReachable=true;window.__snapshotEvents=0;
  window.addEventListener('rudi-offline-snapshot-used',()=>window.__snapshotEvents++);
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rudi-offline-snapshot-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('responses',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  await new Promise((resolve,reject)=>{const tx=db.transaction('responses','readwrite');for(const [path,query] of [['/api/battleship-game',''],['/api/index','route=duel-game']])tx.objectStore('responses').put({key:'actor:Рустам|POST|'+path+'|'+query+'|{"operation":"get"}',payload:{ok:true,room:{version:1,stale:true}},updatedAt:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 });
 let pending;
 await page.route('**/api/battleship-game',route=>{pending=route});
 await page.evaluate(()=>{
  window.__pollController=new AbortController();
  window.__pollResult=fetch('/api/battleship-game',{method:'POST',body:'{"operation":"get"}',signal:window.__pollController.signal}).then(()=>({resolved:true}),error=>({name:error.name}));
 });
 await expect.poll(()=>!!pending).toBe(true);
 await page.evaluate(()=>window.__pollController.abort());
 expect(await page.evaluate(()=>window.__pollResult)).toEqual({name:'AbortError'});
 await pending.abort().catch(()=>{});
 expect(await page.evaluate(()=>({reachable:window.__rudiNetworkReachable,offline:document.body.dataset.offlineMode,events:window.__snapshotEvents}))).toEqual({reachable:true,offline:undefined,events:0});
 await page.route('**/api/index?route=duel-game',route=>route.abort('failed'));
 const failed=await page.evaluate(()=>fetch('/api/index?route=duel-game',{method:'POST',body:'{"operation":"get"}'}).then(()=>({resolved:true}),error=>({name:error.name})));
 expect(failed).toEqual({name:'TypeError'});
 expect(await page.evaluate(()=>({offline:document.body.dataset.offlineMode,events:window.__snapshotEvents}))).toEqual({offline:undefined,events:0});
 let feedOnline=true;
 await page.route('**/api/feed',route=>feedOnline?route.fulfill({json:{ok:true,items:['stored feed']}}):route.abort('failed'));
 expect(await page.evaluate(()=>fetch('/api/feed',{method:'POST',body:'{"operation":"get"}'}).then(response=>response.json()))).toEqual({ok:true,items:['stored feed']});
 await expect.poll(()=>page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('rudi-offline-snapshot-v1',1);r.onsuccess=()=>resolve(r.result)});
  const found=await new Promise(resolve=>{const r=db.transaction('responses').objectStore('responses').get('actor:Рустам|POST|/api/feed||{"operation":"get"}');r.onsuccess=()=>resolve(!!r.result)});db.close();return found;
 })).toBe(true);
 feedOnline=false;
 expect(await page.evaluate(async()=>{const r=await fetch('/api/feed',{method:'POST',body:'{"operation":"get"}'});return {offline:r.headers.get('X-RUDI-Offline'),data:await r.json()}})).toEqual({offline:'1',data:{ok:true,items:['stored feed']}});
});

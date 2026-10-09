'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('PWA watcher accepts real release labels and checks for updates',()=>{
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  const watcher=pwa.slice(pwa.indexOf('function installReleaseWatcher()'),pwa.indexOf('function installServiceWorker()'));
  assert.ok(watcher.length>300);
  const first=watcher.match(/if\(!([^\n]+?)\.test\(loadedVersion\)\)return;/);
  const remote=watcher.match(/if\(([^\n]+?)\.test\(version\)\&\&isNewer/);
  assert.ok(first&&remote,'release version validation must be present');
  const validate1=Function('v','return '+first[1]+'.test(v)');
  const validate2=Function('v','return '+remote[1]+'.test(v)');
  for(const valid of ['v4.112','v4.113','v4.114','v5']){
    assert.equal(validate1(valid),true,'loaded '+valid);
    assert.equal(validate2(valid),true,'remote '+valid);
  }
  assert.equal(validate1('error'),false);
  assert.match(watcher,/cache:'no-store'/);
});

function serviceWorkerSimulator({offline=false,hangingWrite=false}={}){
  const handlers={};
  const reqs=[];
  const fakeCache={
    match:async()=>null,
    put:()=>hangingWrite?new Promise(()=>{}):Promise.resolve()
  };
  const fakeCaches={open:async()=>fakeCache,keys:async()=>[]};
  const self={
    location:{origin:'https://rudi.test'},
    addEventListener:(event,handler)=>{handlers[event]=handler}
  };
  const FakeRequest=class{
    constructor(input){this.url=typeof input==='string'?input:input.url;this.method='GET';this.mode='navigate'}
  };
  const fetch=async()=>{
    if(offline)throw new TypeError('Network unavailable');
    return {ok:true,status:200,clone(){return {ok:true}}};
  };
  const code=fs.readFileSync('public/sw.js','utf8');
  new Function('self','caches','fetch','Request','Response','URL','AbortController','indexedDB','setTimeout','clearTimeout',code)(
    self,fakeCaches,fetch,FakeRequest,Response,URL,AbortController,null,setTimeout,clearTimeout
  );
  assert.equal(typeof handlers.fetch,'function');
  let received=null;
  const event={request:new FakeRequest('https://rudi.test/'),respondWith:p=>{received=p}};
  handlers.fetch(event);
  assert.ok(received);
  return {received,reqs};
}

test('PWA navigation resolves even when Safari Cache Storage never finishes saving',async()=>{
  const {received}=serviceWorkerSimulator({hangingWrite:true});
  const result=await Promise.race([
    received.then(()=>true),
    new Promise(resolve=>setTimeout(()=>resolve(false),300))
  ]);
  assert.equal(result,true,'network HTML must not wait for cache.put');
});

test('PWA has an offline fallback screen when cache and network are unavailable',async()=>{
  const {received}=serviceWorkerSimulator({offline:true});
  const result=await received;
  assert.equal(result.status,200);
  const html=await result.text();
  assert.match(html,/Повторить/);
  assert.match(html,/RUDI пока не загрузился/);
});

test('app shell exposes a non-destructive startup retry when bootstrap stalls',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(html,/rudiStartupRetry/);
  assert.match(html,/auth-pending/);
  assert.match(html,/RUDI долго загружается/);
  assert.match(html,/rudi-retry/);
  assert.doesNotMatch(html,/caches\.delete\(|indexedDB\.deleteDatabase\(/);
});

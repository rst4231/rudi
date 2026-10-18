'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

test('offline settings writes are queued without credentials; reads are not',()=>{
  const start=pwa.indexOf('  function queueableMutation(');
  const end=pwa.indexOf('  async function enqueueOfflineMutation(',start);
  assert.ok(start>0&&end>start);
  const fn=Function('readRequestBody','offlineSnapshotScope','Headers','URL','window',
    pwa.slice(start,end)+';return queueableMutation;')(
    init=>JSON.parse(init.body),
    ()=>'actor:Рустам',
    Headers,URL,{location:{href:'https://example.test/',origin:'https://example.test'}}
  );
  const result=fn('/api/partner-message?rudiAction=ui-preferences',{
    method:'POST',headers:{Authorization:'Bearer token','content-type':'application/json'},
    body:JSON.stringify({initData:'telegram',backupToken:'backup',uiPreferences:{viewStates:{a:true}}})
  });
  assert.equal(result.scope,'actor:Рустам');
  assert.ok(!Object.keys(result.headers).some(x=>/authorization|cookie/i.test(x)));
  assert.deepEqual(JSON.parse(result.body),{uiPreferences:{viewStates:{a:true}}});
  assert.equal(fn('/api/partner-message?rudiAction=ui-preferences',{
    method:'POST',body:JSON.stringify({initData:'telegram'})
  }),null);
});

test('service worker retains unacknowledged writes and asks foreground client to replay',async()=>{
  const from=sw.indexOf('async function flushOutbox(){');
  const to=sw.indexOf("self.addEventListener('install'",from);
  assert.ok(from>0&&to>from);
  const events=[];
  const fn=Function('readOutbox','notifyClients',sw.slice(from,to)+';return flushOutbox;')(
    async()=>[{id:'pending-write'}],async message=>events.push(message));
  assert.deepEqual(await fn(),{sent:0,pending:1});
  assert.equal(events[0].type,'RUDI_OUTBOX_REPLAY_REQUEST');
});

test('queue replays with live auth and never deletes failed writes',()=>{
  assert.match(pwa,/payload\.initData=String\(window\.Telegram\?\.WebApp\?\.initData\|\|''\)/);
  assert.match(pwa,/if\(response\.ok&&data\?\.ok===true\)/);
  assert.match(pwa,/blocked=response\.ok\|\|/);
  assert.match(pwa,/RUDI_OUTBOX_REPLAY_REQUEST/);
  assert.match(pwa,/rudiOfflineQueueSettings/);
});

test('legacy offline rows need explicit actor confirmation and strip stale credentials',()=>{
  assert.match(pwa,/async function adoptLegacyOutbox\(\)/);
  assert.match(pwa,/window\.confirm\(/);
  assert.match(pwa,/await adoptLegacyOutbox\(\)/);
  assert.match(pwa,/for\(const key of \['initData','backupToken','token','accessToken'/);
  assert.match(pwa,/Object\.entries\(row\.headers\|\|\{/);
});

test('offline cache contains version-matching scripts, styles and finance',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const urls=[...new Set(html.match(/\/[a-zA-Z0-9_-]+\.(?:js|css)\?v=[0-9.]+/g)||[])];
  assert.deepEqual(urls.filter(url=>!sw.includes('"'+url+'"')),[]);
  assert.match(sw,/finance-decisions-ui\.js\?v=4\.276/);
  assert.match(sw,/CACHE_NAME='rudi-shell-v4\.276'/);
});

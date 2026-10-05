const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v3.87 chat hot path is reduced and realtime is immediate',()=>{
  const store=read('api/messenger-store.cjs');
  const api=read('api/partner-message.js');
  const client=read('public/messenger.js');
  assert.match(store,/setIfAbsent\(dedupeKey/);
  assert.match(store,/typeof cache\.list!=='function'/);
  assert.doesNotMatch(api,/\/realtime\/publish/);
  assert.match(client,/publishRealtime\('message'/);
  assert.match(client,/publishRealtime\('reaction'/);
  assert.match(client,/publishRealtime\('delete'/);
  assert.doesNotMatch(api,/\?await maybeCreateRustamCycleAdvice/);
  assert.match(client,/realtimeHeartbeatTimer/);
  assert.match(client,/heartbeat-timeout/);
});

test('v3.87 push can carry the notification without background refetch',()=>{
  const pkg=JSON.parse(read('package.json'));
  const push=read('api/web-push.cjs');
  const sw=read('public/sw.js');
  assert.ok(pkg.dependencies['web-push']);
  assert.match(push,/keys: p256dh && auth/);
  assert.match(push,/generateRequestDetails/);
  assert.match(push,/rudiPush: 1/);
  assert.match(sw,/deliverDirectPushNotification/);
  assert.match(sw,/direct\?\.rudiPush===1/);
});

test('v3.87 task time inputs cannot overflow',()=>{
  const css=read('public/app.css');
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css,/input\[type="date"\],\.ticktick-task-field input\[type="time"\]/);
  assert.match(css,/overflow-x:hidden/);
});

test('v3.87 recipe buttons and timers have emoji, tasks do not get emoji field',()=>{
  const html=read('public/index.html');
  const app=read('public/app.js');
  assert.match(html,/🔥 Духовка/);
  assert.match(html,/🌅 Завтрак/);
  assert.match(html,/🇮🇹 Итальянская/);
  assert.match(html,/⏱️ 15 мин/);
  assert.match(app,/🥣 Каша/);
  assert.match(app,/🥗 Салат/);
  assert.match(app,/⏱️ Таймер/);
  assert.doesNotMatch(html,/ticktickTaskEmojiInput/);
  assert.doesNotMatch(app,/ticktickTaskEmojiInput/);
});

test('v3.87 edited JavaScript parses',()=>{
  for(const file of ['public/messenger.js','public/app.js','public/sw.js','api/messenger-store.cjs','api/partner-message.js','api/web-push.cjs']){
    assert.doesNotThrow(()=>new Function(read(file)),file);
  }
});

const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const messenger=fs.readFileSync(path.join(root,'public','messenger.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','messenger.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const partner=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'cloudflare','rudi-db-api','worker.js'),'utf8');
const wrangler=fs.readFileSync(path.join(root,'cloudflare','rudi-db-api','wrangler.jsonc'),'utf8');

test('messenger has realtime WebSocket with polling fallback',()=>{
  assert.match(messenger,/new WebSocket\(url\)/);
  assert.match(messenger,/messenger-realtime-token/);
  assert.match(messenger,/if\(realtimeIsOpen\(\)\) return 15000/);
  assert.match(messenger,/syncLiveMessages\(\)/);
});

test('backend publishes messenger mutations to realtime channel',()=>{
  for(const event of ['message','typing','delete','edit','reaction','read','presence']){
    assert.match(partner,new RegExp("queueMessengerRealtime\\('"+event+"'"));
  }
});

test('cloudflare durable object realtime room is configured',()=>{
  assert.match(worker,/export class MessengerRoom/);
  assert.match(worker,/acceptWebSocket/);
  assert.match(worker,/getWebSockets/);
  assert.match(worker,/\/realtime\/publish/);
  assert.match(wrangler,/MESSENGER_ROOM/);
  assert.match(wrangler,/new_sqlite_classes/);
});

test('system event reactions are centered and date shortcut copy updated',()=>{
  assert.match(css,/\.messenger-message\.is-system-event \.messenger-reactions\s*\{[\s\S]*justify-content:center/);
  assert.match(html,/Идеи для свиданий/);
  assert.doesNotMatch(html,/Сгенерировать свидание/);
});

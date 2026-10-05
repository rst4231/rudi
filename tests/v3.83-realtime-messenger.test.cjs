const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const messenger=fs.readFileSync(path.join(root,'public','messenger.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','messenger.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const partner=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');
const realtime=fs.readFileSync(path.join(root,'api','realtime.js'),'utf8');

test('messenger uses same-origin Vercel WebSocket with slow polling fallback',()=>{
  assert.match(messenger,/new WebSocket\(parsedUrl\.href\)/);
  assert.match(messenger,/messenger-realtime-token/);
  assert.match(messenger,/return realtimeIsOpen\(\)\?60000:12000/);
  assert.match(messenger,/syncLiveMessages\(\)/);
  assert.doesNotMatch(messenger,/return 1100|return 1600|return 2400/);
});

test('confirmed messenger mutations publish from browser to Vercel realtime',()=>{
  for(const event of ['message','typing','delete','edit','reaction','read','presence','delivered']){
    assert.match(messenger,new RegExp("publishRealtime\\('"+event+"'"),event);
  }
  assert.doesNotMatch(partner,/\/realtime\/publish/);
  assert.doesNotMatch(partner,/rudi-realtime\.cpateammail\.workers\.dev/);
});

test('Vercel WebSocket room authenticates and broadcasts realtime events',()=>{
  assert.match(realtime,/WebSocketServer/);
  assert.match(realtime,/verifyMessengerRealtimeToken/);
  assert.match(realtime,/RUDI_REALTIME_PUBLISH_TIMING/);
  assert.match(realtime,/RUDI_REALTIME_RECIPIENT_TIMING/);
  assert.match(realtime,/clients=new Set\(\)/);
});

test('system event reactions are centered and date shortcut copy updated',()=>{
  assert.match(css,/\.messenger-message\.is-system-event \.messenger-reactions\s*\{[\s\S]*justify-content:center/);
  assert.match(html,/Идеи для свиданий/);
  assert.doesNotMatch(html,/Сгенерировать свидание/);
});

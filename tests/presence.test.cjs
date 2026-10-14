const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {heartbeat,isActive,ACTIVE_WINDOW_MS}=require('../api/presence-store.cjs');

test('two independent actor heartbeats show the other user only while recent',async()=>{
  const rows=new Map(),cache={get:async key=>rows.get(key)||null,set:async(key,val)=>{rows.set(key,val);return true}};
  const start=Date.parse('2026-10-14T09:00:00.000Z');
  let result=await heartbeat('Рустам',{cache,now:start});
  assert.deepEqual(result.online,{'Рустам':true,'Диана':false});
  result=await heartbeat('Диана',{cache,now:start+4000});
  assert.deepEqual(result.online,{'Диана':true,'Рустам':true});
  result=await heartbeat('Рустам',{cache,now:start+ACTIVE_WINDOW_MS+5000});
  assert.deepEqual(result.online,{'Рустам':true,'Диана':false});
});
test('invalid or old timestamps are gray, not online',()=>{
  const now=Date.now();
  assert.equal(isActive({seenAt:now-1000},now),true);
  assert.equal(isActive({seenAt:now-ACTIVE_WINDOW_MS-1},now),false);
  assert.equal(isActive({seenAt:now+5000},now),false);
  assert.equal(isActive({seenAt:'bad'},now),false);
});
test('unknown actor cannot write a heartbeat',async()=>{
  await assert.rejects(heartbeat('anyone'),/rudi-access-denied/);
});
test('presence uses existing authenticated API without extra Vercel function',()=>{
 const root=path.join(__dirname,'..');
 const api=fs.readFileSync(path.join(root,'api/partner-message.js'),'utf8');
 const client=fs.readFileSync(path.join(root,'public/presence.js'),'utf8');
 const stylesheet=fs.readFileSync(path.join(root,'public/presence.css'),'utf8');
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 const build=fs.readFileSync(path.join(root,'build.cjs'),'utf8');
 assert.match(api,/action === 'presence'/);
 assert.match(api,/authorizeRequest\(req,body\.initData,options\)/);
 assert.match(client,/rudi:auth-ready/);
 assert.match(client,/document\.visibilityState/);
 assert.match(client,/homeRustamTile/);
 assert.match(client,/homeDianaTile/);
 assert.match(stylesheet,/\.rudi-online-dot\.is-online/);
 assert.match(html,/presence\.js/);
 assert.match(build,/presence\.css/);
 assert.equal(fs.existsSync(path.join(root,'api/presence.js')),false);
});

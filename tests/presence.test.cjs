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

test('last-seen date is retained when partner is no longer online',async()=>{
  const rows=new Map();
  const cache={get:async key=>rows.get(key)||null,set:async(key,val,opts)=>{rows.set(key,val);assert.equal(opts.ttl,90*24*60*60);return true}};
  const start=Date.parse('2026-10-14T09:00:00.000Z');
  await heartbeat('Диана',{cache,now:start});
  const later=await heartbeat('Рустам',{cache,now:start+ACTIVE_WINDOW_MS+5000});
  assert.equal(later.online['Диана'],false);
  assert.equal(later.lastSeen['Диана'],'2026-10-14T09:00:00.000Z');
  assert.equal(later.lastSeen['Рустам'],new Date(start+ACTIVE_WINDOW_MS+5000).toISOString());
});
test('status dot opens a last-seen dialog and supports keyboard and backdrop closing',()=>{
  const script=fs.readFileSync(path.join(__dirname,'../public/presence.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/presence.css'),'utf8');
  assert.match(script,/role="dialog"/);
  assert.match(script,/event\.key==='Escape'/);
  assert.match(script,/lastSeen\[actor\]/);
  assert.match(css,/pointer-events:auto!important/);
  assert.match(css,/\.rudi-presence-backdrop/);
});
test('role-symmetric mood layout and double-tap navigation without secondary fetches',()=>{
  const script=fs.readFileSync(path.join(__dirname,'../public/rudi-interactions.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/presence.css'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.match(script,/DOUBLE_TAP_MS=400/);
  assert.match(script,/scrollTabToTop\(tab\)/);
  assert.match(script,/stopImmediatePropagation/);
  assert.match(css,/\.profile-name-row > :is\(#moodCurrentButton,#partnerMoodValue\)/);
  assert.match(css,/font-size:9px!important/);
  assert.match(css,/background:none!important/);
  assert.match(html,/rudi-interactions\.js\?v=4\.260/);
  assert.doesNotMatch(script,/fetch\(/);
});
test('PWA and route backgrounds do not expose a white loading canvas',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/manifest.webmanifest'),'utf8'));
  const css=fs.readFileSync(path.join(__dirname,'../public/presence.css'),'utf8');
  const sw=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
  assert.equal(manifest.background_color,'#0b0d12');
  assert.match(css,/::view-transition-new\(root\)/);
  assert.match(css,/html\[data-rudi-resuming\]/);
  assert.match(sw,/rudi-shell-v4\.260/);
});

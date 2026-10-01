const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const {
  MESSAGE_TTL_SECONDS,
  addMessengerMessage,
  deleteMessengerMessage,
  setMessengerTyping,
  readMessengerTyping,
  readMessengerMessages,
  markMessengerRead,
  unreadMessengerCount,
  resetMutationQueueForTests,
}=require('../api/messenger-store.cjs');

function memoryCache(nowRef){
  const rows=new Map();
  const writes=[];
  return {
    rows,writes,
    async get(key){
      const row=rows.get(key);
      if(!row) return null;
      if(row.expiresAt<=nowRef.now){rows.delete(key);return null}
      return structuredClone(row.value);
    },
    async set(key,value,options={}){
      const ttl=Math.max(1,Number(options.ttl||1));
      rows.set(key,{value:structuredClone(value),expiresAt:nowRef.now+ttl*1000});
      writes.push({key,ttl,value:structuredClone(value)});
      return true;
    },
    async delete(key){
      rows.delete(key);
      return true;
    }
  };
}

test('each encrypted message has an exact 24 hour storage TTL',async()=>{
  resetMutationQueueForTests();
  const nowRef={now:Date.parse('2026-10-01T10:00:00Z')};
  const cache=memoryCache(nowRef);
  const options={now:nowRef.now,messengerCache:cache};
  const message=await addMessengerMessage('Рустам',{
    ciphertext:'A'.repeat(32),
    iv:'B'.repeat(16),
    keyVersions:{'Рустам':1,'Диана':1},
  },options);
  assert.equal(MESSAGE_TTL_SECONDS,86400);
  assert.equal(Date.parse(message.expiresAt)-Date.parse(message.createdAt),86400000);
  const write=cache.writes.find(row=>row.key==='message:'+message.id);
  assert.equal(write.ttl,86400);
});

test('read receipt keeps the original expiry instead of extending message life',async()=>{
  resetMutationQueueForTests();
  const nowRef={now:Date.parse('2026-10-01T10:00:00Z')};
  const cache=memoryCache(nowRef);
  const message=await addMessengerMessage('Рустам',{
    ciphertext:'C'.repeat(32),
    iv:'D'.repeat(16),
    keyVersions:{'Рустам':1,'Диана':1},
  },{now:nowRef.now,messengerCache:cache});
  nowRef.now+=60*60*1000;
  const result=await markMessengerRead('Диана',[message.id],{now:nowRef.now,messengerCache:cache});
  assert.equal(result.updated,1);
  const receiptWrite=[...cache.writes].reverse().find(row=>row.key==='message:'+message.id);
  assert.ok(receiptWrite.ttl<=23*60*60);
  assert.equal(result.messages[0].readAt,'2026-10-01T11:00:00.000Z');
});

test('server-side message rows contain ciphertext but no plaintext body or reply text',async()=>{
  resetMutationQueueForTests();
  const nowRef={now:Date.parse('2026-10-01T10:00:00Z')};
  const cache=memoryCache(nowRef);
  await addMessengerMessage('Диана',{
    ciphertext:'E'.repeat(64),
    iv:'F'.repeat(16),
    keyVersions:{'Рустам':2,'Диана':2},
  },{now:nowRef.now,messengerCache:cache});
  const rows=await readMessengerMessages({now:nowRef.now,messengerCache:cache});
  assert.equal(rows.length,1);
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0],'text'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0],'reply'),false);
  assert.equal(rows[0].ciphertext,'E'.repeat(64));
});

test('only the sender can delete a message and deletion removes it for both readers',async()=>{
  resetMutationQueueForTests();
  const nowRef={now:Date.parse('2026-10-01T10:00:00Z')};
  const cache=memoryCache(nowRef);
  const options={now:nowRef.now,messengerCache:cache};
  const message=await addMessengerMessage('Рустам',{
    ciphertext:'G'.repeat(48),
    iv:'H'.repeat(16),
    keyVersions:{'Рустам':1,'Диана':1},
  },options);
  await assert.rejects(
    deleteMessengerMessage('Диана',message.id,options),
    /messenger-delete-owner-required/
  );
  assert.equal((await readMessengerMessages(options)).length,1);
  const deleted=await deleteMessengerMessage('Рустам',message.id,options);
  assert.equal(deleted.deleted,true);
  assert.equal((await readMessengerMessages(options)).length,0);
});

test('typing presence is short-lived and can be cleared immediately',async()=>{
  const nowRef={now:Date.parse('2026-10-01T10:00:00Z')};
  const cache=memoryCache(nowRef);
  const options={now:nowRef.now,messengerCache:cache};
  assert.equal(await setMessengerTyping('Диана',true,options),true);
  assert.equal(await readMessengerTyping('Диана',options),true);
  assert.equal(await setMessengerTyping('Диана',false,options),false);
  assert.equal(await readMessengerTyping('Диана',options),false);
});

test('unread count is partner-only',()=>{
  const rows=[
    {sender:'Рустам',readAt:''},
    {sender:'Рустам',readAt:'2026-10-01T10:00:00.000Z'},
    {sender:'Диана',readAt:''},
  ];
  assert.equal(unreadMessengerCount(rows,'Диана'),1);
  assert.equal(unreadMessengerCount(rows,'Рустам'),1);
});

test('client uses ECDH plus AES-GCM and keeps reply, emoji, links and read status client-side',()=>{
  const client=fs.readFileSync('public/messenger.js','utf8');
  assert.match(client,/name:'ECDH',namedCurve:'P-256'/);
  assert.match(client,/name:'AES-GCM'/);
  assert.match(client,/payload\?\.reply/);
  assert.match(client,/data-emoji/);
  assert.match(client,/https\?:\\\/\\\/\[\^\\s<\]\+/);
  assert.match(client,/link\.textContent='ссылка'/);
  assert.match(client,/row\.readAt\?'Прочитано':'Отправлено'/);
});

test('messenger unread participates in profile badge and RUDI app badge',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const client=fs.readFileSync('public/messenger.js','utf8');
  assert.match(app,/attentionCountFromDataset\('messengerUnreadCount'\)/);
  assert.match(client,/id='partnerMessengerButton'/);
  assert.match(client,/partnerMessengerBadge/);
  assert.match(client,/document\.documentElement\.dataset\.messengerUnreadCount/);
});

test('push routes force fresh messenger and partner-message reads',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  assert.match(api,/url:'\/\?tab=messenger&fresh=1'/);
  assert.match(api,/url: '\/\?item=partner&fresh=1'/);
  assert.match(app,/freshPartnerMessage=item==='partner'&&routeFreshRequested\(\)/);
  assert.match(app,/if\(!freshPartnerMessage\) ensureHomeBootstrap\(\)/);
  assert.match(app,/loadPartnerMessage\(\)[\s\S]*?ensureHomeBootstrap\(\{force:true\}\)/);
  assert.match(app,/window\.RUDI_MESSENGER\?\.open\?\.\(\{force:true,fromPush:routeFreshRequested\(\)\}\)/);
});

test('messenger push can be disabled but defaults enabled',()=>{
  const pref=fs.readFileSync('api/ui-preferences-store.cjs','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  const messengerPush=api.match(/async function sendMessengerNotificationToPartner[\s\S]*?\n\}/)?.[0]||'';
  assert.match(pref,/messengerNotificationsEnabled[\s\S]*?\? Boolean\(source\.messengerNotificationsEnabled\)[\s\S]*?: true/);
  assert.match(messengerPush,/preferences\?\.messengerNotificationsEnabled===false/);
  assert.match(messengerPush,/title:actor==='Диана'\?'Диана прислала сообщение':'Рустам прислал сообщение'/);
  assert.match(messengerPush,/body:''/);
  assert.doesNotMatch(messengerPush,/body:[^'\n]*text/);
});

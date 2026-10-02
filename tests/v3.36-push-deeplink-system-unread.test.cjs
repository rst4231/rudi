const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const {
  addMessengerMessage,
  markMessengerRead,
  unreadMessengerCount,
  readMessengerMessages,
  resetMutationQueueForTests,
}=require('../api/messenger-store.cjs');

function memoryCache(nowRef){
  const rows=new Map();
  return {
    async get(key){return rows.has(key)?structuredClone(rows.get(key)):null},
    async set(key,value){rows.set(key,structuredClone(value));return true},
    async delete(key){rows.delete(key);return true},
  };
}

test('all home-targeted push notifications use explicit home tab deep links',()=>{
  const partner=fs.readFileSync('api/partner-message.js','utf8');
  const lulu=fs.readFileSync('api/lulu-toilet-alert.cjs','utf8');
  const humidity=fs.readFileSync('api/smart-home-humidity-alert.cjs','utf8');

  assert.match(partner,/url: '\/\?tab=home&item=partner&fresh=1'/);
  assert.match(partner,/url: '\/\?tab=home&item=lulu'/);
  assert.match(partner,/url:'\/\?tab=home&item=daily-question'/);
  assert.match(partner,/url:'\/\?tab=home&item=priority'/);
  assert.match(partner,/url: '\/\?tab=home&item=' \+ item/);
  assert.match(lulu,/url: '\/\?tab=home&item=lulu'/);
  assert.match(humidity,/url:'\/\?tab=home&item=smart-home'/);

  assert.doesNotMatch(partner,/url:\s*['"]\/\?item=/);
  assert.doesNotMatch(lulu,/url:\s*['"]\/\?item=/);
  assert.doesNotMatch(humidity,/url:\s*['"]\/\?item=/);
  assert.match(partner,/systemRecipients:\['Рустам','Диана'\]/);
});

test('messenger client uses per-viewer system unread state for the bottom badge',()=>{
  const messenger=fs.readFileSync('public/messenger.js','utf8');
  assert.match(messenger,/function rowUnreadForActor\(row,actor=state\.actor\)/);
  assert.match(messenger,/recipients\.includes\(viewer\)&&!readBy\.includes\(viewer\)/);
  assert.match(messenger,/filter\(row=>rowUnreadForActor\(row\)/);
  assert.match(messenger,/getElementById\('messengerTabBadge'\)/);
});

test('system messenger events are unread independently for both actors until each opens them',async()=>{
  resetMutationQueueForTests();
  const nowRef={now:Date.parse('2026-10-02T16:30:00Z')};
  const cache=memoryCache(nowRef);
  const options={now:nowRef.now,messengerCache:cache};
  const message=await addMessengerMessage('Рустам',{
    scheme:'shared-v2',
    ciphertext:'A'.repeat(32),
    iv:'B'.repeat(16),
    keyVersions:{'Рустам':0,'Диана':0},
    systemRecipients:['Рустам','Диана'],
  },options);

  let rows=await readMessengerMessages(options);
  assert.equal(unreadMessengerCount(rows,'Рустам'),1);
  assert.equal(unreadMessengerCount(rows,'Диана'),1);

  await markMessengerRead('Рустам',[message.id],options);
  rows=await readMessengerMessages(options);
  assert.equal(unreadMessengerCount(rows,'Рустам'),0);
  assert.equal(unreadMessengerCount(rows,'Диана'),1);

  await markMessengerRead('Диана',[message.id],options);
  rows=await readMessengerMessages(options);
  assert.equal(unreadMessengerCount(rows,'Рустам'),0);
  assert.equal(unreadMessengerCount(rows,'Диана'),0);
});

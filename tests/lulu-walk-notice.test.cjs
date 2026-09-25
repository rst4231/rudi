const test=require('node:test');
const assert=require('node:assert/strict');
const {
  saveLuluWalkNotice,
  readLuluWalkNotice,
  deleteLuluWalkNotice,
}=require('../api/partner-notification-store.cjs');

function memoryCache(){
  const map=new Map();
  return {
    async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
    async set(key,value){map.set(key,structuredClone(value));return true;},
    async delete(key){map.delete(key);return true;},
  };
}

test('Lulu walk notice is stored and deleted by exact walkedAt',async()=>{
  const cache=memoryCache();
  const walkedAt='2026-09-25T16:00:00.000Z';
  await saveLuluWalkNotice(walkedAt,{
    recipient:'Диана',chatId:222,messageId:777,
  },{notificationCache:cache});

  const notice=await readLuluWalkNotice(walkedAt,{notificationCache:cache});
  assert.equal(notice.chatId,222);
  assert.equal(notice.messageId,777);
  assert.equal(notice.recipient,'Диана');

  assert.equal(await deleteLuluWalkNotice(walkedAt,{notificationCache:cache}),true);
  assert.equal(await readLuluWalkNotice(walkedAt,{notificationCache:cache}),null);
});

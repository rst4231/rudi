const test=require('node:test');
const assert=require('node:assert/strict');

const {
  addMessengerMessage,
  editMessengerMessage,
  markMessengerRead,
  readMessengerMessages,
  toggleMessengerReaction,
  resetMutationQueueForTests,
}=require('../api/messenger-store.cjs');

class MemoryCache{
  constructor(){this.map=new Map()}
  async get(key){return this.map.has(key)?structuredClone(this.map.get(key)):null}
  async set(key,value){this.map.set(key,structuredClone(value));return true}
  async delete(key){this.map.delete(key);return true}
  async expireTag(){return true}
}

function options(now){
  return {
    now,
    messengerCache:messageCache,
    messengerReactionCache:reactionCache,
  };
}

let messageCache;
let reactionCache;

test.beforeEach(()=>{
  resetMutationQueueForTests();
  messageCache=new MemoryCache();
  reactionCache=new MemoryCache();
});

test('reaction survives read and edit mutations and toggles off cleanly',async()=>{
  const base=Date.parse('2026-10-01T12:00:00.000Z');
  const created=await addMessengerMessage('Рустам',{
    scheme:'shared-v2',
    ciphertext:'A'.repeat(32),
    iv:'B'.repeat(16),
    keyVersions:{'Рустам':1,'Диана':1},
  },options(base));

  let reacted=await toggleMessengerReaction('Диана',created.id,'❤️',options(base+1000));
  assert.deepEqual(reacted.reactions,{'❤️':['Диана']});

  const read=await markMessengerRead('Диана',[created.id],options(base+2000));
  assert.deepEqual(read.messages[0].reactions,{'❤️':['Диана']});
  assert.ok(read.messages[0].readAt);

  await editMessengerMessage('Рустам',created.id,{
    scheme:'shared-v2',
    ciphertext:'C'.repeat(32),
    iv:'D'.repeat(16),
    keyVersions:{'Рустам':1,'Диана':1},
  },options(base+3000));

  let rows=await readMessengerMessages(options(base+4000));
  assert.deepEqual(rows[0].reactions,{'❤️':['Диана']});
  assert.ok(rows[0].editedAt);

  reacted=await toggleMessengerReaction('Диана',created.id,'❤️',options(base+5000));
  assert.deepEqual(reacted.reactions,{});

  rows=await readMessengerMessages(options(base+6000));
  assert.deepEqual(rows[0].reactions,{});
});

test('both users can keep independent reactions on the same message',async()=>{
  const base=Date.parse('2026-10-01T12:00:00.000Z');
  const created=await addMessengerMessage('Рустам',{
    scheme:'shared-v2',
    ciphertext:'E'.repeat(32),
    iv:'F'.repeat(16),
    keyVersions:{'Рустам':1,'Диана':1},
  },options(base));

  await toggleMessengerReaction('Рустам',created.id,'👍',options(base+1000));
  await toggleMessengerReaction('Диана',created.id,'❤️',options(base+2000));

  const rows=await readMessengerMessages(options(base+3000));
  assert.deepEqual(rows[0].reactions,{'❤️':['Диана'],'👍':['Рустам']});
});

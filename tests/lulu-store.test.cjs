const test=require('node:test');
const assert=require('node:assert/strict');
const {markLuluWalk,readLuluState,restoreLuluState,resetMutationQueueForTests}=require('../api/lulu-store.cjs');

function memoryCache(){
  const map=new Map();
  return {
    async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
    async set(key,value){map.set(key,structuredClone(value));return true;},
  };
}

test.beforeEach(()=>resetMutationQueueForTests());

test('Lulu walk stores actor and exact time',async()=>{
  const cache=memoryCache();
  const state=await markLuluWalk('Рустам',{luluCache:cache,now:Date.parse('2026-09-23T06:42:00.000Z')});
  assert.equal(state.lastWalk.actor,'Рустам');
  assert.equal(state.lastWalk.walkedAt,'2026-09-23T06:42:00.000Z');
  assert.equal((await readLuluState({luluCache:cache})).version,1);
});

test('Lulu state restores from a newer backup',async()=>{
  const cache=memoryCache();
  await restoreLuluState({
    initialized:true,
    version:4,
    lastWalk:{actor:'Диана',walkedAt:'2026-09-22T18:15:00.000Z'},
    updatedAt:'2026-09-22T18:15:00.000Z'
  },{luluCache:cache});
  const state=await readLuluState({luluCache:cache});
  assert.equal(state.version,4);
  assert.equal(state.lastWalk.actor,'Диана');
});

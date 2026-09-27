const test=require('node:test');
const assert=require('node:assert/strict');
const {markLuluWalk,cancelLuluWalk,restoreLuluWalk,readLuluState,resetMutationQueueForTests}=require('../api/lulu-store.cjs');

function memoryCache(){
  const map=new Map();
  return {
    async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
    async set(key,value){map.set(key,structuredClone(value));return true;},
  };
}

test.beforeEach(()=>resetMutationQueueForTests());

test('v2.61 restores an exactly canceled Lulu walk',async()=>{
  const cache=memoryCache();
  const first=await markLuluWalk('Рустам',{peed:true,pooped:false},{
    luluCache:cache,now:Date.parse('2026-09-27T07:00:00.000Z')
  });
  const original=structuredClone(first.lastWalk);
  await cancelLuluWalk(original.walkedAt,{
    luluCache:cache,now:Date.parse('2026-09-27T07:01:00.000Z')
  });
  const restored=await restoreLuluWalk(original,{
    luluCache:cache,now:Date.parse('2026-09-27T07:02:00.000Z')
  });
  assert.equal(restored.walksToday.length,1);
  assert.equal(restored.lastWalk.walkedAt,original.walkedAt);
  assert.equal(restored.lastWalk.actor,'Рустам');
  assert.equal(restored.lastWalk.peed,true);
  assert.equal(restored.lastWalk.pooped,false);
  assert.equal((await readLuluState({luluCache:cache})).lastPeeAt,original.walkedAt);
});

test('v2.61 rejects restoring a walk from another Moscow day',async()=>{
  const cache=memoryCache();
  await assert.rejects(
    restoreLuluWalk({actor:'Диана',walkedAt:'2026-09-26T10:00:00.000Z',peed:true,pooped:false},{
      luluCache:cache,now:Date.parse('2026-09-27T10:00:00.000Z')
    }),
    /lulu-walk-day-invalid/
  );
});

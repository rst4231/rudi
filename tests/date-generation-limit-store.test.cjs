const test=require('node:test');
const assert=require('node:assert/strict');
const {
  MAX_GENERATIONS,
  REFILL_MS,
  readDateGenerationQuota,
  recordSuccessfulDateGeneration,
  resetMutationQueueForTests,
}=require('../api/date-generation-limit-store.cjs');

function memoryCache(){
  const data=new Map();
  return {
    async get(key){return data.has(key)?data.get(key):null},
    async set(key,value){data.set(key,value);return true},
  };
}

test('date quota starts with five generations per actor',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  const now=Date.parse('2026-09-23T12:00:00Z');
  const rustam=await readDateGenerationQuota('Рустам',{dateGenerationCache:cache,now});
  const diana=await readDateGenerationQuota('Диана',{dateGenerationCache:cache,now});
  assert.equal(rustam.max,MAX_GENERATIONS);
  assert.equal(rustam.available,5);
  assert.equal(diana.available,5);
});

test('each successful generation refills separately after 24 hours',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  const start=Date.parse('2026-09-23T08:00:00Z');

  for(let index=0;index<5;index++){
    const quota=await recordSuccessfulDateGeneration('Рустам',{
      dateGenerationCache:cache,
      now:start+index*60*60*1000,
    });
    assert.equal(quota.available,4-index);
  }

  await assert.rejects(
    recordSuccessfulDateGeneration('Рустам',{
      dateGenerationCache:cache,
      now:start+4*60*60*1000+1000,
    }),
    /date-generation-limit/
  );

  const oneReturned=await readDateGenerationQuota('Рустам',{
    dateGenerationCache:cache,
    now:start+REFILL_MS+1000,
  });
  assert.equal(oneReturned.available,1);
  assert.equal(oneReturned.used,4);

  const twoReturned=await readDateGenerationQuota('Рустам',{
    dateGenerationCache:cache,
    now:start+REFILL_MS+60*60*1000+1000,
  });
  assert.equal(twoReturned.available,2);
  assert.equal(twoReturned.used,3);
});

test('Rustam and Diana quotas are independent',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  const now=Date.parse('2026-09-23T12:00:00Z');
  await recordSuccessfulDateGeneration('Рустам',{dateGenerationCache:cache,now});
  const rustam=await readDateGenerationQuota('Рустам',{dateGenerationCache:cache,now});
  const diana=await readDateGenerationQuota('Диана',{dateGenerationCache:cache,now});
  assert.equal(rustam.available,4);
  assert.equal(diana.available,5);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fastingRewardStars,
  startFasting,
  stopFasting,
  readFastingState,
  resetMutationQueueForTests,
} = require('../api/fasting-store.cjs');

function memoryCache(){
  const rows=new Map();
  return {
    async get(key){ return rows.has(key) ? structuredClone(rows.get(key)) : null; },
    async set(key,value){ rows.set(key,structuredClone(value)); return true; },
  };
}

test('fasting rewards use duration ranges',()=>{
  assert.equal(fastingRewardStars(15*60+59),0);
  assert.equal(fastingRewardStars(16*60),2);
  assert.equal(fastingRewardStars(23*60+59),2);
  assert.equal(fastingRewardStars(24*60),3);
  assert.equal(fastingRewardStars(31*60+59),3);
  assert.equal(fastingRewardStars(32*60),4);
  assert.equal(fastingRewardStars(39*60+59),4);
  assert.equal(fastingRewardStars(40*60),5);
  assert.equal(fastingRewardStars(80*60),5);
});

test('Rustam and Diana fasting histories stay isolated', async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  const start=Date.parse('2026-09-26T00:00:00.000Z');
  await startFasting('Рустам',{startedAt:new Date(start).toISOString(),goalHours:16},{cache,now:start});
  await stopFasting('Рустам',{cache,now:start+16*60*60*1000});

  const rustam=await readFastingState('Рустам',{cache});
  const diana=await readFastingState('Диана',{cache});

  assert.equal(rustam.history.length,1);
  assert.equal(rustam.history[0].durationMinutes,16*60);
  assert.equal(diana.history.length,0);
  assert.equal(diana.active,null);
});

test('starting twice does not overwrite active fasting', async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  const now=Date.parse('2026-09-26T12:00:00.000Z');
  await startFasting('Диана',{startedAt:new Date(now-60*60*1000).toISOString(),goalHours:18},{cache,now});
  await assert.rejects(
    ()=>startFasting('Диана',{startedAt:new Date(now).toISOString(),goalHours:18},{cache,now}),
    /fasting-already-active/
  );
  const state=await readFastingState('Диана',{cache});
  assert.equal(state.active.goalHours,18);
});

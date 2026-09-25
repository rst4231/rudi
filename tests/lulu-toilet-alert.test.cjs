const test=require('node:test');
const assert=require('node:assert/strict');
const {runLuluToiletAlert}=require('../api/lulu-toilet-alert.cjs');
const {markLuluWalk,readLuluState,resetMutationQueueForTests}=require('../api/lulu-store.cjs');

function memoryCache(){
  const map=new Map();
  return {
    async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
    async set(key,value){map.set(key,structuredClone(value));return true;},
  };
}

test.beforeEach(()=>resetMutationQueueForTests());

test('100% Lulu alert is sent once to each configured recipient for one walk',async()=>{
  const cache=memoryCache();
  await markLuluWalk('Рустам',{luluCache:cache,now:Date.parse('2026-09-25T03:00:00.000Z')});
  const calls=[];
  const options={
    luluCache:cache,
    recipients:{'Рустам':901637773,'Диана':941263519},
    now:Date.parse('2026-09-25T13:30:00.000Z'),
    telegramSendMessage:async(chatId,text)=>{
      calls.push({chatId,text});
      return {chatId,messageId:calls.length};
    },
  };
  const first=await runLuluToiletAlert(options);
  assert.equal(first.probability,100);
  assert.deepEqual(first.sent.map((row)=>row.actor),['Рустам','Диана']);
  assert.equal(calls.length,2);

  const second=await runLuluToiletAlert(options);
  assert.equal(second.sent.length,0);
  assert.equal(calls.length,2);
  const state=await readLuluState({luluCache:cache});
  assert.deepEqual(state.toiletAlert.recipients,['Рустам','Диана']);
});

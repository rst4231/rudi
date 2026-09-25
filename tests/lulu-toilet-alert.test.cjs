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

function baseOptions(cache,working,calls){
  return {
    luluCache:cache,
    recipients:{'Рустам':901637773,'Диана':941263519},
    now:Date.parse('2026-09-25T13:30:00.000Z'),
    getWorkWeek:async()=>({
      configured:true,
      days:[{date:'2026-09-25',working}],
    }),
    telegramSendMessage:async(chatId,text)=>{
      calls.push({chatId,text});
      return {chatId,messageId:calls.length};
    },
  };
}

test.beforeEach(()=>resetMutationQueueForTests());

test('100% Lulu alert goes only to Rustam when Diana works today',async()=>{
  const cache=memoryCache();
  await markLuluWalk('Рустам',{luluCache:cache,now:Date.parse('2026-09-25T03:00:00.000Z')});
  const calls=[];
  const options=baseOptions(cache,true,calls);

  const first=await runLuluToiletAlert(options);
  assert.equal(first.probability,100);
  assert.equal(first.targetActor,'Рустам');
  assert.equal(first.routing.working,true);
  assert.deepEqual(first.sent.map((row)=>row.actor),['Рустам']);
  assert.deepEqual(calls.map((row)=>row.chatId),[901637773]);

  const second=await runLuluToiletAlert(options);
  assert.equal(second.sent.length,0);
  assert.equal(calls.length,1);
  const state=await readLuluState({luluCache:cache});
  assert.deepEqual(state.toiletAlert.recipients,['Рустам']);
});

test('100% Lulu alert goes only to Diana when Diana rests today',async()=>{
  const cache=memoryCache();
  await markLuluWalk('Диана',{luluCache:cache,now:Date.parse('2026-09-25T03:00:00.000Z')});
  const calls=[];
  const result=await runLuluToiletAlert(baseOptions(cache,false,calls));

  assert.equal(result.probability,100);
  assert.equal(result.targetActor,'Диана');
  assert.equal(result.routing.working,false);
  assert.deepEqual(result.sent.map((row)=>row.actor),['Диана']);
  assert.deepEqual(calls.map((row)=>row.chatId),[941263519]);
});

test('100% Lulu alert falls back to Rustam if work calendar cannot be read',async()=>{
  const cache=memoryCache();
  await markLuluWalk('Рустам',{luluCache:cache,now:Date.parse('2026-09-25T03:00:00.000Z')});
  const calls=[];
  const options=baseOptions(cache,true,calls);
  options.getWorkWeek=async()=>{throw new Error('calendar-down');};

  const result=await runLuluToiletAlert(options);
  assert.equal(result.targetActor,'Рустам');
  assert.equal(result.routing.fallback,true);
  assert.equal(result.routing.reason,'work-calendar-error');
  assert.deepEqual(calls.map((row)=>row.chatId),[901637773]);
});

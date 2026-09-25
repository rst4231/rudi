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

function calendarOptions(cache,calls,now,events=[]){
  return {
    luluCache:cache,
    recipients:{'Рустам':901637773,'Диана':941263519},
    now:Date.parse(now),
    getWorkWeek:async()=>({
      configured:true,
      days:[
        {date:'2026-09-24',working:false,events:[]},
        {date:'2026-09-25',working:events.length>0,events},
      ],
    }),
    telegramSendMessage:async(chatId,text)=>{
      calls.push({chatId,text});
      return {chatId,messageId:calls.length};
    },
  };
}

async function makeOldWalk(cache){
  await markLuluWalk('Рустам',{
    luluCache:cache,
    now:Date.parse('2026-09-25T03:00:00.000Z'),
  });
}

test.beforeEach(()=>resetMutationQueueForTests());

test('100% Lulu alert goes to Rustam while Diana is inside her shift',async()=>{
  const cache=memoryCache();
  await makeOldWalk(cache);
  const calls=[];
  const result=await runLuluToiletAlert(calendarOptions(
    cache,calls,'2026-09-25T13:30:00.000Z',
    [{title:'Работа',allDay:false,startTime:'12:00',endTime:'20:00'}]
  ));
  assert.equal(result.targetActor,'Рустам');
  assert.equal(result.routing.onShift,true);
  assert.deepEqual(calls.map((row)=>row.chatId),[901637773]);
});

test('100% Lulu alert goes to Diana before her shift starts',async()=>{
  const cache=memoryCache();
  await makeOldWalk(cache);
  const calls=[];
  const result=await runLuluToiletAlert(calendarOptions(
    cache,calls,'2026-09-25T08:30:00.000Z',
    [{title:'Работа',allDay:false,startTime:'12:00',endTime:'20:00'}]
  ));
  assert.equal(result.targetActor,'Диана');
  assert.equal(result.routing.onShift,false);
  assert.deepEqual(calls.map((row)=>row.chatId),[941263519]);
});

test('100% Lulu alert goes to Diana after her shift ends',async()=>{
  const cache=memoryCache();
  await makeOldWalk(cache);
  const calls=[];
  const result=await runLuluToiletAlert(calendarOptions(
    cache,calls,'2026-09-25T17:30:00.000Z',
    [{title:'Работа',allDay:false,startTime:'12:00',endTime:'20:00'}]
  ));
  assert.equal(result.targetActor,'Диана');
  assert.equal(result.routing.onShift,false);
  assert.deepEqual(calls.map((row)=>row.chatId),[941263519]);
});

test('100% Lulu alert goes to Diana on a day off',async()=>{
  const cache=memoryCache();
  await makeOldWalk(cache);
  const calls=[];
  const result=await runLuluToiletAlert(calendarOptions(
    cache,calls,'2026-09-25T13:30:00.000Z',[]
  ));
  assert.equal(result.targetActor,'Диана');
  assert.equal(result.routing.onShift,false);
  assert.deepEqual(calls.map((row)=>row.chatId),[941263519]);
});

test('overnight Diana shift routes alert to Rustam after midnight',async()=>{
  const cache=memoryCache();
  await markLuluWalk('Рустам',{
    luluCache:cache,
    now:Date.parse('2026-09-24T13:00:00.000Z'),
  });
  const calls=[];
  const options=calendarOptions(cache,calls,'2026-09-25T00:30:00.000Z',[]);
  options.getWorkWeek=async()=>({
    configured:true,
    days:[
      {date:'2026-09-24',working:true,events:[
        {title:'Работа',allDay:false,startTime:'20:00',endTime:'08:00'},
      ]},
      {date:'2026-09-25',working:false,events:[]},
    ],
  });
  const result=await runLuluToiletAlert(options);
  assert.equal(result.targetActor,'Рустам');
  assert.equal(result.routing.onShift,true);
  assert.deepEqual(calls.map((row)=>row.chatId),[901637773]);
});

test('one walk produces only one 100% alert even after shift state changes',async()=>{
  const cache=memoryCache();
  await makeOldWalk(cache);
  const calls=[];
  const first=await runLuluToiletAlert(calendarOptions(
    cache,calls,'2026-09-25T13:30:00.000Z',
    [{title:'Работа',allDay:false,startTime:'12:00',endTime:'20:00'}]
  ));
  assert.deepEqual(first.sent.map((row)=>row.actor),['Рустам']);

  const second=await runLuluToiletAlert(calendarOptions(
    cache,calls,'2026-09-25T17:30:00.000Z',
    [{title:'Работа',allDay:false,startTime:'12:00',endTime:'20:00'}]
  ));
  assert.equal(second.sent.length,0);
  assert.equal(calls.length,1);
  const state=await readLuluState({luluCache:cache});
  assert.deepEqual(state.toiletAlert.recipients,['Рустам']);
});

test('100% Lulu alert falls back to Rustam if work calendar cannot be read',async()=>{
  const cache=memoryCache();
  await makeOldWalk(cache);
  const calls=[];
  const options=calendarOptions(cache,calls,'2026-09-25T13:30:00.000Z',[]);
  options.getWorkWeek=async()=>{throw new Error('calendar-down');};
  const result=await runLuluToiletAlert(options);
  assert.equal(result.targetActor,'Рустам');
  assert.equal(result.routing.fallback,true);
  assert.equal(result.routing.reason,'work-calendar-error');
  assert.deepEqual(calls.map((row)=>row.chatId),[901637773]);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const holiday=require('../api/holiday-rollover.cjs');

function fakeCache(initial={}){const m=new Map(Object.entries(initial));return{values:m,async get(k){return m.has(k)?structuredClone(m.get(k)):null},async set(k,v){m.set(k,structuredClone(v));return true},async delete(k){m.delete(k);return true}}}
function publishResponse(ids,status=200){const result=ids.map(id=>({message_id:id}));return new Response(JSON.stringify({ok:status===200,result:result.length===1?result[0]:result}),{status,headers:{'content-type':'application/json'}})}
function initBody(method='sendMessage'){return {body:JSON.stringify({chat_id:-100123,message_thread_id:44,text:'Новый праздник'}),method}}
function ok(){return new Response(JSON.stringify({ok:true,result:true}),{status:200,headers:{'content-type':'application/json'}})}

test('successful new holiday post deletes previous live post and stores new one',async()=>{
 const state=fakeCache(); await holiday.writeState(state,[10],100); const calls=[];
 await holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMessage',initBody(),publishResponse([20]),{stateCache:state,topicCache:fakeCache(),fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return ok();}});
 assert.deepEqual(calls[0].message_ids,[10]); assert.deepEqual((await holiday.readLatestState(state)).messageIds,[20]);
});

test('media group replaces all previous holiday messages with full new group',async()=>{
 const state=fakeCache(); await holiday.writeState(state,[10,11],100); const calls=[];
 await holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMediaGroup',initBody(),publishResponse([20,21,22]),{stateCache:state,topicCache:fakeCache(),fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return ok();}});
 assert.deepEqual(calls[0].message_ids,[10,11]); assert.deepEqual((await holiday.readLatestState(state)).messageIds,[20,21,22]);
});

test('failed publication never deletes previous holiday post',async()=>{
 const state=fakeCache(); await holiday.writeState(state,[10],100); let deletes=0;
 await holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMessage',initBody(),publishResponse([],500),{stateCache:state,topicCache:fakeCache(),fetchImpl:async()=>{deletes++;return ok();}});
 assert.equal(deletes,0); assert.deepEqual((await holiday.readLatestState(state)).messageIds,[10]);
});

test('delete failure preserves old and new ids so next publication can retry cleanup',async()=>{
 const state=fakeCache(); await holiday.writeState(state,[10],100);
 await assert.rejects(()=>holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMessage',initBody(),publishResponse([20]),{stateCache:state,topicCache:fakeCache(),fetchImpl:async()=>new Response('boom',{status:500})}),/deleteMessages failed/);
 assert.deepEqual(new Set((await holiday.readLatestState(state)).messageIds),new Set([10,20]));
});

test('first rollout bootstraps previous ids from topic-maintenance tracking',async()=>{
 const state=fakeCache(); const topic=fakeCache({'topic:44:2026-08-22:messages':[7,8]}); const calls=[];
 await holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMessage',initBody(),publishResponse([20]),{stateCache:state,topicCache:topic,now:new Date('2026-08-22T16:00:00Z'),lookbackDays:1,fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return ok();}});
 assert.deepEqual(calls[0].message_ids,[7,8]); assert.deepEqual((await holiday.readLatestState(state)).messageIds,[20]);
});

test('mixed batch with one already-gone message falls back to single deletes for the remaining ids',async()=>{
 const calls=[];
 const fetchImpl=async(url,init)=>{
   const body=JSON.parse(init.body); calls.push(body.message_ids);
   if(body.message_ids.length>1) return new Response(JSON.stringify({ok:false,description:'Bad Request: message to delete not found'}),{status:400});
   if(body.message_ids[0]===10) return new Response(JSON.stringify({ok:false,description:'Bad Request: message to delete not found'}),{status:400});
   return ok();
 };
 const count=await holiday.deleteMessages('https://api.telegram.org/bot1:abc',-100123,[10,11,12],fetchImpl);
 assert.equal(count,3);
 assert.deepEqual(calls,[[10,11,12],[10],[11],[12]]);
});

test('mixed already-deleted and live holiday ids are retried individually so live ids are not skipped', async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.message_ids);
    if (body.message_ids.length > 1) return new Response('message to delete not found', { status: 400 });
    if (body.message_ids[0] === 1) return new Response('message to delete not found', { status: 400 });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  await holiday.deleteMessages('https://api.telegram.org/bot1:abc', -100123, [1, 2], fetchImpl);
  assert.deepEqual(calls, [[1, 2], [1], [2]]);
});

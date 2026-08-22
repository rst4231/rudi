const test=require('node:test');
const assert=require('node:assert/strict');
const holiday=require('../api/holiday-rollover.cjs');

function fakeCache(initial={}){const m=new Map(Object.entries(initial));return{values:m,async get(k){return m.has(k)?structuredClone(m.get(k)):null},async set(k,v){m.set(k,structuredClone(v));return true},async delete(k){m.delete(k);return true}}}
function publishResponse(ids,status=200){const result=ids.map(id=>({message_id:id}));return new Response(JSON.stringify({ok:status===200,result:result.length===1?result[0]:result}),{status,headers:{'content-type':'application/json'}})}
function initBody(method='sendMessage'){return {body:JSON.stringify({chat_id:-100123,message_thread_id:44,text:'Новый праздник'}),method}}

test('successful new holiday post deletes previous live post and stores new one',async()=>{
 const state=fakeCache();
 await holiday.writeState(state,[10],100);
 const calls=[];
 const res=publishResponse([20]);
 await holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMessage',initBody(),res,{stateCache:state,topicCache:fakeCache(),fetchImpl:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({ok:true,result:true}),{status:200});}});
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].body.message_ids,[10]);
 assert.deepEqual((await holiday.readLatestState(state)).messageIds,[20]);
});

test('media group replaces all previous holiday messages with full new group',async()=>{
 const state=fakeCache();
 await holiday.writeState(state,[10,11],100);
 const calls=[];
 await holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMediaGroup',initBody(),publishResponse([20,21,22]),{stateCache:state,topicCache:fakeCache(),fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return new Response('{}',{status:200});}});
 assert.deepEqual(calls[0].message_ids,[10,11]);
 assert.deepEqual((await holiday.readLatestState(state)).messageIds,[20,21,22]);
});

test('failed publication never deletes previous holiday post',async()=>{
 const state=fakeCache(); await holiday.writeState(state,[10],100); let deletes=0;
 await holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMessage',initBody(),publishResponse([],500),{stateCache:state,topicCache:fakeCache(),fetchImpl:async()=>{deletes++;return new Response('{}',{status:200})}});
 assert.equal(deletes,0); assert.deepEqual((await holiday.readLatestState(state)).messageIds,[10]);
});

test('delete failure preserves old and new ids so next publication can retry cleanup',async()=>{
 const state=fakeCache(); await holiday.writeState(state,[10],100);
 await assert.rejects(()=>holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMessage',initBody(),publishResponse([20]),{stateCache:state,topicCache:fakeCache(),fetchImpl:async()=>new Response('boom',{status:500})}),/deleteMessages failed/);
 assert.deepEqual(new Set((await holiday.readLatestState(state)).messageIds),new Set([10,20]));
});

test('first rollout bootstraps previous ids from topic-maintenance tracking',async()=>{
 const state=fakeCache();
 const topic=fakeCache({'topic:44:2026-08-22:messages':[7,8]});
 const calls=[];
 await holiday.handleHolidayPublication('https://api.telegram.org/bot1:abc/sendMessage',initBody(),publishResponse([20]),{stateCache:state,topicCache:topic,now:new Date('2026-08-22T16:00:00Z'),lookbackDays:1,fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return new Response('{}',{status:200})}});
 assert.deepEqual(calls[0].message_ids,[7,8]);
 assert.deepEqual((await holiday.readLatestState(state)).messageIds,[20]);
});

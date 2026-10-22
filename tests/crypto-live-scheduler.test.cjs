'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
async function worker(){return (await import('../cloudflare/rudi-crypto-market-worker.mjs')).default;}
function environment(connected=true){
 const rows=new Map([['__cron_status',{body:JSON.stringify({ok:true,at:new Date().toISOString()}),fetched_at:Date.now()}]]);
 return {rows,CRON_SECRET:'test-cron-secret',VERCEL_AUTOMATION_BYPASS_SECRET:'test-bypass',MARKET_DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){if(sql.includes('rudi-crypto-live-config-v1'))return connected?{connected:1,enabled:1,active:0}:null;return rows.get(values[0])||null;},async run(){rows.set(values[0],{body:values[1],fetched_at:values[2]});return {success:true};}};}}};
}
test('minute live check runs independently of the 12 minute market cache window',async t=>{
 const env=environment(),calls=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push(url);assert.equal(init.headers.Authorization,'Bearer test-cron-secret');assert.equal(init.headers['x-vercel-protection-bypass'],'test-bypass');return Response.json({ok:true,checkedAt:new Date().toISOString()});});
 await (await worker()).scheduled({cron:'* * * * *'},env,{});
 assert.deepEqual(calls,['https://spb-daily-guide-bot.vercel.app/api/crypto-live-runner']);
 const health=await (await worker()).fetch(new Request('https://worker.invalid/health'),env);
 assert.equal((await health.json()).liveLastRun.ok,true);
});
test('disconnected live accounts produce no extra Vercel invocation',async t=>{
 const env=environment(false);t.mock.method(globalThis,'fetch',async()=>assert.fail('no endpoint request without connected accounts'));
 await (await worker()).scheduled({},env,{});
});
test('live endpoint failure is recorded without erasing successful market status',async t=>{
 const env=environment();t.mock.method(globalThis,'fetch',async()=>Response.json({ok:false},{status:503}));
 t.mock.method(console,'warn',()=>{});
 await (await worker()).scheduled({},env,{});
 assert.equal(JSON.parse(env.rows.get('__cron_status').body).ok,true);
 assert.equal(JSON.parse(env.rows.get('__live_cron_status').body).ok,false);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function database(){const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE rudi_state(namespace TEXT,key TEXT,value TEXT,tags TEXT,expires_at TEXT,updated_at TEXT,PRIMARY KEY(namespace,key))");return {db,prepare(sql){const statement=db.prepare(sql);let params=[];return {bind(...args){params=args;return this;},async first(){return statement.get(...params)||null;},async all(){return {results:statement.all(...params)};},async run(){const r=statement.run(...params);return {meta:{changes:Number(r.changes)}};}};}};}
async function load(){const p=path.resolve('cloudflare/univ-rudi-link/worker.mjs');assert.ok(fs.existsSync(p),'direct car endpoint must exist');return {worker:(await import(p)).default,store:(await import(path.resolve('cloudflare/univ-rudi-link/direct-store.mjs'))).createDirectCarStore,core:require('../api/car-device.cjs').createCarDeviceService};}
const id='synthetic-direct-device-1234567890';
test('direct endpoint pairs, uploads, and exposes its last point to existing Rudi service without Vercel fetches',async()=>{
 const {worker,store,core}=await load(),DB=database(),owner=core({client:store(DB)}),pairing=await owner.createPairing();
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Vercel must never be called');};
 try{const send=async(body,token)=>worker.fetch(new Request('https://car.test/v1/car-device',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),{DB});
 const response=await send({operation:'pair',code:pairing.code,deviceId:id});assert.equal(response.status,200);const paired=await response.json();
 const retry=await send({operation:'pair',code:pairing.code,deviceId:id});assert.equal((await retry.json()).deviceToken,paired.deviceToken);
 const capturedAt=new Date().toISOString();assert.equal((await send({operation:'location',latitude:12.5,longitude:-32.5,accuracy:10,capturedAt},paired.deviceToken)).status,200);
 assert.equal((await owner.readState()).lastLocation.capturedAt,capturedAt);
 await owner.revoke();assert.equal((await send({operation:'location',latitude:12.5,longitude:-32.5,accuracy:10,capturedAt},paired.deviceToken)).status,401);
 }finally{globalThis.fetch=originalFetch;DB.db.close();}
});
test('direct route rejects reads, owner operations, huge bodies and unrelated namespaces',async()=>{
 const {worker,store}=await load(),DB=database();
 for(const operation of ['get','create-device-pairing','admin-login']){const r=await worker.fetch(new Request('https://car.test/v1/car-device',{method:'POST',body:JSON.stringify({operation})}),{DB});assert.equal(r.status,400);}
 assert.equal((await worker.fetch(new Request('https://car.test/v1/car-device'),{DB})).status,405);
 assert.equal((await worker.fetch(new Request('https://car.test/v1/car-device',{method:'POST',body:' '.repeat(9000)}),{DB})).status,413);
 await assert.rejects(store(DB).set('unrelated-namespace','key',{}),/namespace/);DB.db.close();
});
test('D1 adapter preserves atomic claims and reuses only expired entries',async()=>{
 const {store}=await load(),DB=database();let now=1000000;const client=store(DB,{now:()=>now}),ns='rudi-car-pair-rate-v1';
 assert.equal(await client.setIfAbsent(ns,'slot',{used:true},{ttl:1}),true);assert.equal(await client.setIfAbsent(ns,'slot',{used:true}),false);
 now+=1001;assert.equal(await client.getRecord(ns,'slot'),null);assert.equal(await client.setIfAbsent(ns,'slot',{used:true}),true);
 assert.equal((await client.getRecords(ns,['slot','absent']))[1],null);DB.db.close();
});

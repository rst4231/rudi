'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { encodeSession } = require('../api/rudi-session.cjs');
const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const point = (offset = 0) => ({ latitude:12.5, longitude:-32.5, accuracy:15, capturedAt:new Date(NOW + offset).toISOString() });
function fixture() {
  const rows = new Map();
  let now = NOW;
  const client = {
    async getRecord(ns,key) { return rows.has(ns+'|'+key) ? {value:structuredClone(rows.get(ns+'|'+key))} : null; },
    async set(ns,key,value) { rows.set(ns+'|'+key,structuredClone(value)); return {ok:true}; },
    async remove(ns,key) { rows.delete(ns+'|'+key); return true; },
    async list(ns) { return [...rows].filter(([key])=>key.startsWith(ns+'|')).map(([key,value])=>({key:key.slice(ns.length+1),value:structuredClone(value)})); },
    async setIfAbsent(ns,key,value) { const k=ns+'|'+key; if(rows.has(k))return false; rows.set(k,structuredClone(value)); return true; },
  };
  return { rows, client, now:()=>now, advance(ms) {now+=ms;} };
}
function service(f) {
  assert.equal(fs.existsSync('api/car-device.cjs'),true,'real car device service exists');
  return require('../api/car-device.cjs').createCarDeviceService({client:f.client,now:f.now});
}
function response() { return { headers:{}, statusCode:200, setHeader(k,v){this.headers[k]=v;}, status(code){this.statusCode=code;return this;}, json(data){this.data=data;return this;} }; }
async function request(device,body,token='',method='POST') {
  if(body.operation==='pair')body={deviceId:'synthetic-installation-1234567890',...body};
  const res=response();
  await device.handleRequest({method,body,headers:token?{authorization:'Bearer '+token}:{}},res);
  assert.match(res.headers['Cache-Control'],/no-store/);
  assert.match(res.headers['Content-Type'],/application\/json/);
  return res;
}
async function paired(f) {
  const device=service(f), pairing=await device.createPairing();
  const result=await request(device,{operation:'pair',code:pairing.code});
  assert.equal(result.statusCode,200); assert.equal(result.data.ok,true);
  return {device,token:result.data.deviceToken,pairing};
}
test('pairing uses a single-use six-digit code and stores only a high entropy token hash',async()=>{
  const f=fixture(),{device,token,pairing}=await paired(f);
  assert.match(pairing.code,/^\d{6}$/);
  assert.equal(pairing.expiresAt,new Date(NOW+10*60000).toISOString());
  assert.match(token,/^[A-Za-z0-9_-]{43,}$/);
  assert.equal(JSON.stringify([...f.rows]).includes(token),false);
  assert.deepEqual(await device.readState(),{lastLocation:null,carDevice:{paired:true}});
  assert.equal((await request(device,{operation:'pair',code:pairing.code,deviceId:'other-installation-1234567890'})).statusCode,400);
});
test('expired, replaced and revoked pending codes cannot enroll a device',async()=>{
  const f=fixture(),device=service(f),old=await device.createPairing(),latest=await device.createPairing();
  assert.equal((await request(device,{operation:'pair',code:old.code})).statusCode,400);
  f.advance(10*60000);
  assert.equal((await request(device,{operation:'pair',code:latest.code})).statusCode,400);
  const pending=await device.createPairing();
  assert.deepEqual(await device.revoke(),{paired:false});
  assert.equal((await request(device,{operation:'pair',code:pending.code})).statusCode,400);
});
test('public endpoint denies reads, tokenless and invalid bearer writes',async()=>{
  const f=fixture(),{device,token}=await paired(f);
  assert.equal((await request(device,{operation:'location',...point()})).statusCode,401);
  assert.equal((await request(device,{operation:'location',...point()},'invalid')).statusCode,401);
  assert.equal((await request(device,{operation:'get'},token)).statusCode,400);
  assert.equal((await request(device,{},token,'GET')).statusCode,405);
  assert.equal((await request(device,{operation:'create-device-pairing'})).statusCode,400);
});
test('malformed coordinates, accuracy and capture dates are rejected without changing the last point',async()=>{
  const f=fixture(),{device,token}=await paired(f);
  const invalid=[{latitude:null},{latitude:'12'},{latitude:NaN},{latitude:Infinity},{latitude:91},{latitude:-91},{longitude:null},{longitude:181},{longitude:-181},{accuracy:null},{accuracy:-1},{accuracy:100.01},{accuracy:'15'},{capturedAt:null},{capturedAt:'2026-02-30T12:00:00Z'},{capturedAt:'2026-10-25'},{capturedAt:'2026-10-25T12:00:00+00:00'},{capturedAt:new Date(NOW+300001).toISOString()},{capturedAt:new Date(NOW-90*86400000-1).toISOString()}];
  for(const change of invalid) assert.equal((await request(device,{operation:'location',...point(),...change},token)).statusCode,400,JSON.stringify(change));
  assert.equal((await device.readState()).lastLocation,null);
  for(const p of [{latitude:90,longitude:-180,accuracy:0},{latitude:-90,longitude:180,accuracy:100}])assert.equal((await request(device,{operation:'location',...point(),...p},token)).statusCode,200);
});
test('accepted capture persists through service restart and duplicate/older uploads cannot overwrite it',async()=>{
  const f=fixture(),{device,token}=await paired(f);
  assert.deepEqual((await request(device,{operation:'location',...point(-3*86400000)},token)).data,{ok:true,accepted:true});
  assert.deepEqual((await request(device,{operation:'location',...point()},token)).data,{ok:true,accepted:true});
  for(const offset of [0,-1,-10*86400000])assert.deepEqual((await request(service(f),{operation:'location',...point(offset),latitude:44},token)).data,{ok:true,accepted:false});
  f.advance(60000);
  assert.deepEqual((await service(f).readState()).lastLocation,point());
});
test('rotating and revoking a device immediately denies the old token and keeps last known location',async()=>{
  const f=fixture(),{device,token}=await paired(f);
  await request(device,{operation:'location',...point()},token);
  const pairing=await device.createPairing();
  assert.equal((await request(device,{operation:'location',...point(1)},token)).statusCode,401);
  const next=await request(device,{operation:'pair',code:pairing.code});
  assert.notEqual(next.data.deviceToken,token);
  assert.equal((await request(device,{operation:'location',...point(1)},token)).statusCode,401);
  await device.revoke();
  assert.equal((await request(device,{operation:'location',...point(1)},next.data.deviceToken)).statusCode,401);
  assert.deepEqual(await device.readState(),{lastLocation:point(),carDevice:{paired:false}});
});
test('location writes cannot overwrite any unrelated car state',async()=>{
  const f=fixture(),other={mileage:12345,errors:[{id:'synthetic-error'}],notes:[{text:'keep'}]};
  await f.client.set('rudi-car-state-v1','changan-univ-2023',other);
  const {device,token}=await paired(f);
  await request(device,{operation:'location',...point(),state:{mileage:0},errors:[]},token);
  assert.deepEqual((await f.client.getRecord('rudi-car-state-v1','changan-univ-2023')).value,other);
});
test('concurrent uploads serialize safely and retrying an older loser never regresses the latest point',async()=>{
  const f=fixture(),{device,token}=await paired(f);
  const outcomes=await Promise.all([-1000,0,-500].map(offset=>request(service(f),{operation:'location',...point(offset)},token)));
  assert.ok(outcomes.every(res=>[200,503].includes(res.statusCode)));
  for(const offset of [0,-1000,-500])await request(device,{operation:'location',...point(offset)},token);
  assert.deepEqual((await device.readState()).lastLocation,point());
  const pairing=await device.createPairing();
  const enrollments=await Promise.all([request(device,{operation:'pair',code:pairing.code}),request(service(f),{operation:'pair',code:pairing.code,deviceId:'competing-installation-1234567890'})]);
  assert.equal(enrollments.filter(res=>res.statusCode===200).length,1);
});
test('transient storage failures return 503 without leaking store errors or secrets',async()=>{
  const f=fixture(),{device,token}=await paired(f),real=f.client.getRecord;
  f.client.getRecord=async()=>{throw Error('private-storage-credential');};
  const failed=await request(device,{operation:'location',...point()},token);
  assert.equal(failed.statusCode,503);assert.equal(JSON.stringify(failed.data).includes('private-storage-credential'),false);
  f.client.getRecord=real;
  const realList=f.client.list;f.client.list=async()=>{throw Error('private-storage-credential');};
  assert.equal((await request(device,{operation:'location',...point()},token)).statusCode,503);
  f.client.list=realList;
});
test('existing car route preserves Rustam authorization for pairing and revoke operations',async()=>{
  const {handleCarRequest}=require('../api/car-client.cjs');
  const f=fixture(),device=service(f),botToken='synthetic-car-test-token';
  const previous=process.env.TELEGRAM_BOT_TOKEN;process.env.TELEGRAM_BOT_TOKEN=botToken;
  try {
    for(const operation of ['create-device-pairing','revoke-car-device']) {
      const unauth=response(); await handleCarRequest({method:'POST',body:{operation},headers:{}},unauth,{carDeviceService:device});assert.equal(unauth.statusCode,401);
      const denied=response(); await handleCarRequest({method:'POST',body:{operation},headers:{cookie:'rudi_session='+encodeSession('Диана',botToken)}},denied,{carDeviceService:device});assert.equal(denied.data.visible,false);assert.equal(f.rows.size,0);
    }
    const paired=response();await handleCarRequest({method:'POST',body:{operation:'create-device-pairing'},headers:{cookie:'rudi_session='+encodeSession('Рустам',botToken)}},paired,{carDeviceService:device});
    assert.equal(paired.statusCode,200);assert.equal(paired.data.visible,true);assert.ok(paired.data.pairing.code);
    const revoked=response();await handleCarRequest({method:'POST',body:{operation:'revoke-car-device'},headers:{cookie:'rudi_session='+encodeSession('Рустам',botToken)}},revoked,{carDeviceService:device});
    assert.deepEqual(revoked.data,{ok:true,actor:'Рустам',visible:true,carDevice:{paired:false}});
  }finally{if(previous===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=previous;}
});

test('authenticated lightweight location reads expose only status and last captured point',async()=>{
  const {handleCarRequest}=require('../api/car-client.cjs');
  const f=fixture(),{device,token}=await paired(f),botToken='synthetic-car-test-token';
  await request(device,{operation:'location',...point()},token);
  const previous=process.env.TELEGRAM_BOT_TOKEN;process.env.TELEGRAM_BOT_TOKEN=botToken;
  try {
    const res=response();await handleCarRequest({method:'POST',body:{operation:'get-location'},headers:{cookie:'rudi_session='+encodeSession('Рустам',botToken)}},res,{carDeviceService:device});
    assert.deepEqual(res.data,{ok:true,actor:'Рустам',visible:true,lastLocation:point(),carDevice:{paired:true}});
  }finally{if(previous===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=previous;}
});
test('a pairing finishing after owner revocation cannot resurrect a device',async()=>{
  const f=fixture(),device=service(f),pairing=await device.createPairing(),real=f.client.set;
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),resume=new Promise(resolve=>{release=resolve;});
  f.client.set=async(ns,key,value,...args)=>{if(key.startsWith('token:')){entered();await resume;}return real(ns,key,value,...args);};
  const enrollment=request(device,{operation:'pair',code:pairing.code});await started;
  await service(f).revoke();release();const result=await enrollment;
  assert.equal(result.statusCode,400);
  assert.equal((await device.readState()).carDevice.paired,false);
});
test('a delayed older upload cannot delete a concurrently written newer point',async()=>{
  const f=fixture(),{device,token}=await paired(f),real=f.client.list;
  let entered,release,once=true;
  const started=new Promise(resolve=>{entered=resolve;}),resume=new Promise(resolve=>{release=resolve;});
  f.client.list=async ns=>{const snapshot=await real(ns);if(once&&ns.includes('location')){once=false;entered();await resume;}return snapshot;};
  const older=request(device,{operation:'location',...point(-1000)},token);await started;
  assert.deepEqual((await request(service(f),{operation:'location',...point()},token)).data,{ok:true,accepted:true});
  release();await older;
  assert.deepEqual((await device.readState()).lastLocation,point());
});
test('a late disconnect from an old headunit cannot revoke a replacement',async()=>{
  const f=fixture(),{device,token}=await paired(f),real=f.client.set;
  let entered,release;const started=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
  f.client.set=async(ns,key,value,...rest)=>{if(key==='registry'||key.startsWith('revoked:')){entered();await resume;}return real(ns,key,value,...rest);};
  const old=request(device,{operation:'disconnect'},token);await started;
  f.client.set=real;const code=await device.createPairing();const next=await device.pair(code.code);
  release();assert.equal((await old).statusCode,200);assert.equal((await device.readState()).carDevice.paired,true);
  assert.equal((await request(device,{operation:'location',...point()},next.deviceToken)).statusCode,200);
});

test('retrying pairing after a lost response returns the same token only to the original installation',async()=>{
 const f=fixture(),device=service(f),pairing=await device.createPairing();
 const first=await request(device,{operation:'pair',code:pairing.code});
 const retry=await request(service(f),{operation:'pair',code:pairing.code});
 assert.equal(first.statusCode,200);assert.equal(retry.statusCode,200);assert.equal(retry.data.deviceToken,first.data.deviceToken);
 const denied=response();await device.handleRequest({method:'POST',headers:{},body:{operation:'pair',code:pairing.code,deviceId:'different-installation-1234567890'}},denied);
 assert.equal(denied.statusCode,400);
});

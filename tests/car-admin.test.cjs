'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCarAdminService}=require('../api/car-device-admin.cjs');
function fixture(){const rows=new Map();let now=1000000;const client={getRecord:async(n,k)=>rows.has(n+'|'+k)?{value:rows.get(n+'|'+k)}:null,set:async(n,k,v)=>rows.set(n+'|'+k,v),setIfAbsent:async(n,k,v)=>{const id=n+'|'+k;if(rows.has(id))return false;rows.set(id,v);return true;}};return {rows,service:createCarAdminService({client,now:()=>now}),advance:ms=>now+=ms};}
const id='synthetic-installation-1234567890';
test('server environment verifier enables supplied owner password without plaintext storage',async()=>{
 const crypto=require('node:crypto'),salt='a'.repeat(48),password='synthetic-env-password';
 const digest=crypto.scryptSync(password,salt,32).toString('hex');
 const rows=new Map(),client={getRecord:async(n,k)=>rows.has(n+k)?{value:rows.get(n+k)}:null,set:async(n,k,v)=>rows.set(n+k,v),setIfAbsent:async(n,k,v)=>{if(rows.has(n+k))return false;rows.set(n+k,v);return true;}};
 const service=createCarAdminService({client,env:{UNI_V_ADMIN_PASSWORD_HASH:'scrypt:'+salt+':'+digest}});
 assert.equal((await service.status()).configured,true);const s=await service.login(password,id);await service.authorize(s.adminToken,id);assert.equal(JSON.stringify([...rows]).includes(password),false);
});
test('unconfigured admin rejects login and stores no plaintext password',async()=>{const f=fixture();await assert.rejects(f.service.login('test-password',id),/car-admin-not-configured/);await f.service.setPassword('test-password');assert.equal((await f.service.status()).configured,true);assert.equal(JSON.stringify([...f.rows]).includes('test-password'),false);await assert.rejects(f.service.login('wrong-password',id),/car-admin-invalid/);});
test('admin session binds installation, expires and is invalidated by password rotation',async()=>{const f=fixture();await f.service.setPassword('test-password');const s=await f.service.login('test-password',id);await f.service.authorize(s.adminToken,id);await assert.rejects(f.service.authorize(s.adminToken,id+'x'),/car-admin-unauthorized/);assert.equal(JSON.stringify([...f.rows]).includes(s.adminToken),false);f.advance(15*60000+1);await assert.rejects(f.service.authorize(s.adminToken,id),/car-admin-unauthorized/);const next=await f.service.login('test-password',id);await f.service.setPassword('changed-password');await assert.rejects(f.service.authorize(next.adminToken,id),/car-admin-unauthorized/);});
test('login budget is durable across service instances and rejects brute force',async()=>{const f=fixture();await f.service.setPassword('test-password');for(let i=0;i<5;i++)await assert.rejects(f.service.login('wrong-password',id),/car-admin-invalid/);await assert.rejects(f.service.login('test-password',id),/car-admin-rate-limited/);});
test('weak passwords cannot enable admin access',async()=>{const f=fixture();for(const value of ['',null,'1234567','x'.repeat(129)])await assert.rejects(f.service.setPassword(value),/car-admin-password-format/);assert.equal((await f.service.status()).configured,false);});
test('public pairing cannot bypass admin gate even with a correct pairing code',async()=>{
  const rows=new Map(),client={getRecord:async(n,k)=>rows.has(n+k)?{value:rows.get(n+k)}:null,set:async(n,k,v)=>rows.set(n+k,v),setIfAbsent:async(n,k,v)=>{if(rows.has(n+k))return false;rows.set(n+k,v);return true;}};
  const device=require('../api/car-device.cjs').createCarDeviceService({client});
  const pairing=await device.createPairing();
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await device.handleRequest({method:'POST',headers:{},body:{operation:'pair',code:pairing.code,deviceId:id}},res);
  assert.equal(res.code,401);assert.equal(res.body.error,'car-admin-unauthorized');
});

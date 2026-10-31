'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');

test('minute live scanner has its own protected Vercel function and no finance rewrite',()=>{
 const handler=require('../api/crypto-live-runner.js');
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.equal(typeof handler,'function');
 assert.equal(config.functions['api/crypto-live-runner.js'].maxDuration,60);
 assert.deepEqual(config.functions['api/crypto-live-runner.js'].regions,['fra1']);
 assert.deepEqual(config.rewrites.find(x=>x.source==='/api/crypto-live-cron'),{source:'/api/crypto-live-cron',destination:'/api/crypto-live-runner'});
});
test('live cron only runs with valid authorization and real GET requests',async()=>{
 const {createHandler}=require('../api/crypto-live-cron.cjs');
 let calls=0;
 const fn=createHandler({authorized:req=>req.headers?.authorization==='Bearer approved-test-token',run:async o=>{
  calls++;assert.equal(o.scheduled,true);return {ok:true,checkedAt:'2026-10-21T09:00:00.000Z',idle:true};
 }});
 function response(){return {code:0,setHeader(){},status(n){this.code=n;return this;},json(v){this.payload=v;return this;}};}
 let r=response();
 await fn({method:'GET',headers:{}},r);
 assert.equal(r.code,401);assert.equal(calls,0);
 r=response();await fn({method:'POST',headers:{authorization:'Bearer approved-test-token'}},r);
 assert.equal(r.code,405);assert.equal(calls,0);
 r=response();await fn({method:'GET',headers:{authorization:'Bearer approved-test-token'}},r);
 assert.equal(r.code,200);assert.equal(r.payload.ok,true);assert.equal(calls,1);
});

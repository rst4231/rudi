const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runDailyOrchestrator}=require('../api/daily-orchestrator.cjs');
const response=()=>({statusCode:200,payload:null,setHeader(){},status(n){this.statusCode=n;return this},json(p){this.payload=p;return p}});
test('retired feed returns Gone without fetching or restoring data',async()=>{
 const handler=require('../api/partner-message.js');const res=response();
 await handler({method:'POST',query:{rudiAction:'for-di-feed'},body:{operation:'list'},headers:{}},res,{fetch:()=>{throw Error('retired feed accessed network')}});
 assert.equal(res.statusCode,410);assert.equal(res.payload.error,'feature-removed');
});
test('legacy dedicated cron cannot start a morning report after retirement',async()=>{
 const handler=require('../api/feed-notify-cron.js');const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='retirement-test';
 try{const res=response();await handler({query:{mode:'for-di'},headers:{authorization:'Bearer retirement-test'}},res);assert.equal(res.statusCode,410);assert.equal(res.payload.error,'feature-removed')}finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous}
});
test('daily orchestration ignores legacy enabled settings and preserves other runtime sections',async()=>{
 const calls=[],res=response();
 await runDailyOrchestrator({query:{route:'daily'}},res,{date:'2026-10-29',settings:{sections:{labor:{enabled:true},cinema:{enabled:false}}},cleanup:async()=>{},runNative:async name=>{calls.push(name)},publishForDi:async()=>calls.push('retired-publication'),hasForDiSource:async()=>{calls.push('retired-read');return true},runRuntime:async(_q,r)=>{calls.push('runtime');return r.json({ok:true,results:{}})},updateFeed:async()=>{},recordGenerated:async()=>{},writeSummary:async()=>{},alert:async()=>{}});
 assert.deepEqual(calls,['runtime']);assert.equal(res.payload.ok,true);
});
test('retired date generator rejects generation without calling AI',async()=>{
 const handler=require('../api/partner-message.js');const res=response();
 await handler({method:'POST',query:{rudiAction:'dates'},body:{operation:'generate',period:'evening'},headers:{}},res,{fetch:()=>{throw Error('retired generator called AI')}});
 assert.equal(res.statusCode,410);assert.equal(res.payload.error,'feature-removed');
});

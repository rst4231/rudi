const test=require('node:test');const assert=require('node:assert/strict');const {runDailyOrchestrator}=require('../api/daily-orchestrator.cjs');
function res(){return{payload:null,statusCode:200,status(c){this.statusCode=c;return this},json(p){this.payload=p;return p}}}
test('native failure does not prevent generated runtime',async()=>{const calls=[];const response=res();const result=await runDailyOrchestrator({query:{route:'daily'}},response,{date:'2026-08-30',settings:{sections:{labor:{enabled:true},cinema:{enabled:true}}},cleanup:async()=>{},runNative:async section=>{calls.push(section);if(section==='cinema')throw new Error('boom');return{ok:true}},runRuntime:async(_req,r)=>r.json({ok:true,date:'2026-08-30',results:{facts:{sent:true}}}),writeSummary:async()=>{},recordGenerated:async()=>{},alert:async()=>{}});assert.ok(calls.includes('cinema'));assert.equal(calls.includes('weekend'),false);assert.equal(result.runtime.ok,true);});


test('cinema feed is persisted before generated runtime starts',async()=>{
  const order=[];
  const response=res();
  await runDailyOrchestrator({query:{route:'daily'}},response,{
    date:'2026-09-24',
    settings:{sections:{labor:{enabled:false},cinema:{enabled:true}}},
    cleanup:async()=>{},
    runNative:async()=>({feedMessage:'🎬 today',feedItems:[{title:'Film'}],titles:['Film']}),
    updateFeed:async sections=>{order.push('feed');assert.equal(sections.cinema.parts[0],'🎬 today');return{version:'1'}},
    runRuntime:async(_req,r)=>{order.push('runtime');return r.json({ok:true,date:'2026-09-24',results:{}})},
    writeSummary:async()=>{},
    recordGenerated:async()=>{},
    alert:async()=>{},
  });
  assert.deepEqual(order.slice(0,2),['feed','runtime']);
});

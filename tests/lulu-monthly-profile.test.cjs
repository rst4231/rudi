const test=require('node:test');
const assert=require('node:assert/strict');
const store=require('../api/lulu-store.cjs');
const cache=()=>{let value=null;return {get:async()=>structuredClone(value),set:async(k,v)=>{value=structuredClone(v)}}};
const opts=(c,at)=>({luluCache:c,now:Date.parse(at)});
test('history retains walks across days with stool and per-actor monthly totals',async()=>{
 const c=cache();
 await store.markLuluWalk('Диана',{peed:true,pooped:true,stool:'formed'},opts(c,'2026-10-29T06:00:00Z'));
 const state=await store.markLuluWalk('Рустам',{peed:true,pooped:false,stool:'liquid'},opts(c,'2026-10-30T06:00:00Z'));
 assert.equal(state.walksMonth.length,2);
 assert.equal(state.walksToday.length,1);
 assert.equal(state.walksMonth[0].stool,'formed');
 assert.equal(state.walksMonth[1].stool,'');
 assert.deepEqual(state.monthCounts,{'Диана':1,'Рустам':1});
});
test('Moscow month rollover removes old records from storage and backups',async()=>{
 const c=cache();const october=await store.markLuluWalk('Диана',{peed:true,pooped:true,stool:'soft'},opts(c,'2026-10-31T20:55:00Z'));
 const state=await store.readLuluState(opts(c,'2026-10-31T21:01:00Z'));
 assert.deepEqual(state.walksMonth,[]);assert.equal(state.lastWalk,null);assert.equal(state.lastPeeAt,'');
 assert.deepEqual((await c.get()).walksMonth,[]);
 const restored=await store.restoreLuluState({...october,version:99},opts(c,'2026-11-01T00:00:00Z'));
 assert.deepEqual(restored.walksMonth,[]);
});
test('yesterday cancellation is rejected even if it is the last walk',async()=>{
 const c=cache();const state=await store.markLuluWalk('Рустам',{peed:true,pooped:true},opts(c,'2026-10-29T06:00:00Z'));
 await assert.rejects(store.cancelLuluWalk(state.lastWalk.walkedAt,opts(c,'2026-10-30T06:00:00Z')),/lulu-walk-day-invalid/);
});
test('cancel and undo preserve month history and stool and update totals',async()=>{
 const c=cache();await store.markLuluWalk('Диана',{peed:true},opts(c,'2026-10-29T06:00:00Z'));
 const state=await store.markLuluWalk('Рустам',{pooped:true,stool:'mushy'},opts(c,'2026-10-30T06:00:00Z'));
 const removed=await store.cancelLuluWalk(state.lastWalk.walkedAt,opts(c,'2026-10-30T06:01:00Z'));
 assert.equal(removed.lastWalk.actor,'Диана');assert.equal(removed.walksMonth.length,1);assert.equal(removed.monthCounts['Рустам'],0);
 const undo=await store.restoreLuluWalk(state.lastWalk,opts(c,'2026-10-30T06:02:00Z'));
 assert.equal(undo.walksMonth.length,2);assert.equal(undo.lastWalk.stool,'mushy');
});
test('offline retry across days is idempotent and old-month uploads are rejected',async()=>{
 const c=cache();const o={...opts(c,'2026-10-30T06:00:00Z'),walkedAt:'2026-10-29T06:00:00Z',offlineOperationId:'walk-12345678'};
 await store.markLuluWalk('Рустам',{peed:true},o);const state=await store.markLuluWalk('Рустам',{peed:true},o);
 assert.equal(state.walksMonth.length,1);assert.equal(state.duplicateOperation,true);
 await assert.rejects(store.markLuluWalk('Рустам',{peed:true},{...o,...opts(c,'2026-11-01T06:00:00Z')}),/lulu-walk-month-invalid/);
});
test('stale high-version backup cannot erase new month walks',async()=>{
 const c=cache();const old=await store.markLuluWalk('Диана',{peed:true},opts(c,'2026-10-31T20:55:00Z'));
 await c.set('lulu',null);
 await store.markLuluWalk('Рустам',{peed:true},opts(c,'2026-11-01T06:00:00Z'));
 const state=await store.restoreLuluState({...old,version:100},opts(c,'2026-11-01T06:01:00Z'));
 assert.equal(state.walksMonth.length,1);assert.equal(state.lastWalk.actor,'Рустам');
});
test('canceling today walks out of order cannot restore an already canceled toilet timestamp',async()=>{
 const c=cache();const a=await store.markLuluWalk('Рустам',{peed:true},opts(c,'2026-10-30T06:00:00Z'));
 const b=await store.markLuluWalk('Рустам',{peed:true},opts(c,'2026-10-30T07:00:00Z'));
 await store.cancelLuluWalk(a.lastWalk.walkedAt,opts(c,'2026-10-30T08:00:00Z'));
 const state=await store.cancelLuluWalk(b.lastWalk.walkedAt,opts(c,'2026-10-30T08:01:00Z'));
 assert.equal(state.lastPeeAt,'');assert.equal(state.lastWalk,null);
});

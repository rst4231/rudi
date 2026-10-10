'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../api/personal-center-store.cjs');
const cron=require('../api/personal-center-cron-handler.cjs');
const map=new Map();
function client(){return {
 getRecord:async(ns,k)=>map.has(ns+':'+k)?{value:map.get(ns+':'+k)}:null,
 set:async(ns,k,value)=>{map.set(ns+':'+k,value);return true},
 setIfAbsent:async(ns,k,value)=>{if(map.has(ns+':'+k))return false;map.set(ns+':'+k,value);return true},
 list:async(ns)=>[...map].filter(([k])=>k.startsWith(ns+':')).map(([k,value])=>({key:k.slice(ns.length+1),value})),
 remove:async(ns,k)=>{map.delete(ns+':'+k);return true},
};}
test('independent user records and mandatory ratings',async()=>{
 map.clear();const c=client();const now=Date.parse('2026-10-10T04:00:00Z');
 await store.mutate('Рустам','checkin',{mood:8,energy:7,stress:3},{client:c,now});
 assert.equal((await store.read('Рустам',{client:c})).checkins['2026-10-10'].mood,8);
 assert.deepEqual((await store.read('Диана',{client:c})).checkins,{});
 await assert.rejects(()=>store.mutate('Диана','checkin',{mood:12,energy:1,stress:2},{client:c,now}),/invalid-rating/);
});
test('once-per-slot reports and green halo state',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-10T04:00:00Z');
 const first=await store.saveReport('Диана','2026-10-10','morning',{narrative:{overview:'ok'}},{client:c,now});
 assert.equal(first.created,true);
 assert.equal((await store.saveReport('Диана','2026-10-10','morning',{},{client:c,now})).created,false);
 assert.equal((await store.unread('Диана',{client:c})).unread,true);
 await store.seen('Диана',{client:c});
 assert.equal((await store.unread('Диана',{client:c})).unread,false);
});
test('per-account erase does not delete existing finance or partner entries',async()=>{
 map.clear();const c=client();await store.mutate('Рустам','weight',{kg:86.2},{client:c});
 await store.mutate('Диана','weight',{kg:62},{client:c});
 await store.erase('Рустам','all',{client:c});
 assert.equal((await store.read('Рустам',{client:c})).weights.length,0);
 assert.equal((await store.read('Диана',{client:c})).weights.length,1);
});
test('Moscow scheduled slots use UTC+3',()=>{
 assert.equal(cron.slotAt(Date.parse('2026-10-10T04:00:00Z')),'morning');
 assert.equal(cron.slotAt(Date.parse('2026-10-10T18:00:00Z')),'evening');
 assert.equal(cron.slotAt(Date.parse('2026-10-10T12:00:00Z')),'');
});
test('scheduler does not regenerate existing reports',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-10T04:00:00Z');
 let generated=0;
 const generate=async actor=>{generated++;return {narrative:{overview:actor},model:'test'}};
 const first=await cron.run({client:c,now,generate});
 assert.equal(first.ok,true);assert.equal(generated,2);
 const second=await cron.run({client:c,now,generate});
 assert.equal(second.ok,true);assert.equal(generated,2);
});

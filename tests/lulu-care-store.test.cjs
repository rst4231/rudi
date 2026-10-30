const test=require('node:test'),assert=require('node:assert/strict');
const care=require('../api/lulu-care-store.cjs');
function setup(){const map=new Map();return {careCache:{get:async key=>structuredClone(map.get(key)),set:async(key,value)=>{map.set(key,structuredClone(value))},setIfAbsent:async(key,value)=>{if(map.has(key))return false;map.set(key,structuredClone(value));return true},delete:async key=>{map.delete(key)},list:async()=>[...map].map(([key,value])=>({key,value:structuredClone(value)}))},now:Date.parse('2026-10-30T10:00:00Z')}}
const command=(kind,id,data,expectedUpdatedAt='')=>({kind,id,data,expectedUpdatedAt});
test('four kinds persist shared records across months with no invented medical values',async()=>{
 const o=setup();
 await care.saveLuluCare('Рустам',command('weight','w1',{date:'2026-10-30',kg:12.4}),o);
 await care.saveLuluCare('Диана',command('nutrition','current',{food:'Корм',grams:220,treats:'',date:'2026-10-30'}),o);
 await care.saveLuluCare('Диана',command('prevention','p1',{type:'vaccine',product:'По паспорту',date:'2026-10-29',nextDate:''}),o);
 await care.saveLuluCare('Рустам',command('prescription','rx1',{name:'Назначение',dose:'По рецепту',schedule:'Утром',start:'2026-10-29',end:'',doctor:'',note:''}),o);
 const result=await care.readLuluCare({...o,now:Date.parse('2026-11-02T10:00:00Z')});
 assert.equal(result.records.length,4);assert.equal(result.records.find(r=>r.kind==='prevention').data.nextDate,'');
 assert.equal(result.records.find(r=>r.kind==='weight').data.kg,12.4);
});
test('retries are idempotent and stale edits are rejected without losing other records',async()=>{
 const o=setup(),input=command('weight','w1',{date:'2026-10-30',kg:12});
 const first=await care.saveLuluCare('Рустам',input,o),retry=await care.saveLuluCare('Рустам',input,o);
 assert.equal(first.updatedAt,retry.updatedAt);
 await care.saveLuluCare('Диана',command('weight','w2',{date:'2026-10-29',kg:11.9}),o);
 await assert.rejects(care.saveLuluCare('Диана',command('weight','w1',{date:'2026-10-30',kg:13}),o),/lulu-care-conflict/);
 assert.equal((await care.readLuluCare(o)).records.length,2);
});
test('invalid weight, dates, record ids and doctor-free auto dosing are never accepted',async()=>{
 const o=setup();
 for(const data of [{date:'2026-10-30',kg:0},{date:'2026-02-30',kg:12},{date:'2026-10-31',kg:12}])await assert.rejects(care.saveLuluCare('Рустам',command('weight','bad',data),o),/lulu-care-invalid/);
 await assert.rejects(care.saveLuluCare('Рустам',command('weight','../bad',{date:'2026-10-30',kg:12}),o),/lulu-care-invalid/);
 await assert.rejects(care.saveLuluCare('Рустам',command('prevention','p',{type:'vaccine',product:'',date:'2026-10-30'}),o),/lulu-care-invalid/);
 await assert.rejects(care.saveLuluCare('Рустам',command('prescription','rx',{name:'Rx',start:'2026-11-01',end:'2026-10-01'}),o),/lulu-care-invalid/);
});
test('delete leaves a tombstone that prevents stale resurrection',async()=>{
 const o=setup(),r=await care.saveLuluCare('Диана',command('weight','w',{date:'2026-10-30',kg:12}),o);
 const removed=await care.saveLuluCare('Рустам',{kind:'weight',id:'w',deleted:true,expectedUpdatedAt:r.updatedAt},o);
 assert.equal(removed.deleted,true);assert.equal((await care.readLuluCare(o)).records.length,0);
 await assert.rejects(care.saveLuluCare('Диана',command('weight','w',{date:'2026-10-30',kg:12}),o),/lulu-care-conflict/);
});
test('intake references an existing prescription and records each real intake once',async()=>{
 const o=setup();
 await assert.rejects(care.saveLuluCare('Диана',command('intake','dose1',{prescriptionId:'missing',at:'2026-10-30T09:00:00Z'}),o),/lulu-care-prescription-missing/);
 await care.saveLuluCare('Рустам',command('prescription','rx',{name:'Назначение',dose:'По рецепту',schedule:'Утро',start:'2026-10-29'}),o);
 const input=command('intake','dose1',{prescriptionId:'rx',at:'2026-10-30T09:00:00Z'});await care.saveLuluCare('Диана',input,o);await care.saveLuluCare('Диана',input,o);
 assert.equal((await care.readLuluCare(o)).records.filter(r=>r.kind==='intake').length,1);
});
test('separate server instances cannot both accept conflicting edits to the same revision',async()=>{
 const o=setup(),path=require.resolve('../api/lulu-care-store.cjs');
 delete require.cache[path];const instanceA=require(path);delete require.cache[path];const instanceB=require(path);
 const results=await Promise.allSettled([
  instanceA.saveLuluCare('Рустам',command('weight','same',{date:'2026-10-30',kg:12}),o),
  instanceB.saveLuluCare('Диана',command('weight','same',{date:'2026-10-30',kg:13}),o)
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.message==='lulu-care-conflict').length,1);
});

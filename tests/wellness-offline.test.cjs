'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fasting=require('../api/fasting-store.cjs');
const meditation=require('../api/meditation-store.cjs');
const supp=require('../api/supplements-store.cjs');
const cache=()=>{const map=new Map();return {get:async k=>map.get(k)||null,set:async(k,v)=>{map.set(k,structuredClone(v));return true}}};
test('fasting offline replay keeps one closed session',async()=>{
 fasting.resetMutationQueueForTests();const fastingCache=cache(),now=Date.parse('2026-10-16T12:00:00Z');
 const options={fastingCache,now};const id='uuid-unique-fasting';
 await fasting.startFasting('Рустам',{startedAt:'2026-10-16T10:00:00Z',goalHours:16,activeId:id},options);
 await fasting.startFasting('Рустам',{startedAt:'2026-10-16T10:00:00Z',goalHours:16,activeId:id},options);
 const close={...options,expectedActiveId:id,stopAt:'2026-10-16T11:30:00Z'};
 await fasting.stopFasting('Рустам',close);
 await fasting.stopFasting('Рустам',close);
 assert.equal((await fasting.readFastingState('Рустам',options)).history.length,1);
 assert.equal((await fasting.readFastingState('Диана',options)).history.length,0);
});
test('meditation offline replay keeps original start/end',async()=>{
 const meditationCache=cache(),options={meditationCache,now:Date.parse('2026-10-16T12:00:00Z')};
 const id='meditation-offline-unique';
 await meditation.start('Рустам',10,{...options,activeId:id,startedAt:'2026-10-16T11:00:00Z'});
 await meditation.start('Рустам',10,{...options,activeId:id,startedAt:'2026-10-16T11:00:00Z'});
 await meditation.finish('Рустам',id,false,{...options,endedAt:'2026-10-16T11:11:00Z'});
 const result=await meditation.finish('Рустам',id,false,{...options,endedAt:'2026-10-16T11:11:00Z'});
 assert.equal(result.alreadyFinished,true);
 assert.equal(result.state.history.length,1);
 assert.equal(result.state.history[0].durationSeconds,660);
});
test('supplements offline take and replay never duplicate',async()=>{
 supp.resetMutationQueuesForTests();const supplementsCache=cache();
 const options={supplementsCache,now:Date.parse('2026-10-16T18:00:00Z')};
 const id='supp-unique-offline-01',at='2026-10-16T14:00:00Z';
 await supp.applyOfflineOperation('Рустам','uuid-offline-add-01','add',{id,name:'Витамин D',at},options);
 await supp.applyOfflineOperation('Рустам','uuid-offline-add-01','add',{id,name:'Витамин D',at},options);
 await supp.applyOfflineOperation('Рустам','uuid-offline-take-01','take',{id,at},options);
 await supp.applyOfflineOperation('Рустам','uuid-offline-take-01','take',{id,at},options);
 assert.equal((await supp.readSupplements('Рустам',options)).items[0].intakes.length,1);
 assert.equal((await supp.readSupplements('Диана',options)).items.length,0);
});
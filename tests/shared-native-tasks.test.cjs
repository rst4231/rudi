'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const tasks=require('../api/shared-native-tasks.cjs');
function stateClient(){
 const rows=new Map(),k=(ns,key)=>ns+'\0'+key;
 const copy=x=>structuredClone(x);
 return {
  async getRecord(ns,key){return rows.has(k(ns,key))?{key,value:copy(rows.get(k(ns,key)))}:null},
  async set(ns,key,value){rows.set(k(ns,key),copy(value));return true},
  async setIfAbsent(ns,key,value){if(rows.has(k(ns,key)))return false;rows.set(k(ns,key),copy(value));return true},
  async list(ns){return [...rows].filter(([key])=>key.startsWith(ns+'\0')).map(([key,value])=>({key:key.slice(ns.length+1),value:copy(value)}))},
  async remove(ns,key){return rows.delete(k(ns,key))}
 };
}
function fixture(client){
 return {
  client,readTokenImpl:async()=>({accessToken:'fixture'}),
  loadConfigImpl:async()=>({projectId:'shared-fixture'}),
  fetchProjectImpl:async()=>({tasks:[
   {id:'old-a',title:'Магазин',status:0,startDate:'2026-10-19T06:00:00Z',dueDate:'2026-10-19T07:00:00Z',repeatFlag:'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=4'},
   {id:'old-undated',title:'Без срока',status:0}
  ]}),
  readMetaImpl:async()=>({entries:{'old-a':{responsible:'Диана'}}})
 };
}
test('task end must follow start and time is optional',()=>{
 const task=tasks.normalizeTask({title:'Встреча',date:'2026-10-19',time:'09:00',endTime:'10:00',repeat:'none'});
 assert.equal(task.endTime,'10:00');
 assert.throws(()=>tasks.normalizeTask({title:'Встреча',date:'2026-10-19',time:'10:00',endTime:'09:00'}),/time-range-invalid/);
 assert.equal(tasks.normalizeTask({title:'Задача',date:'2026-10-19',time:'',endTime:''}).isAllDay,true);
});
test('selecting weekdays preserves every selected weekday',()=>{
 const t=tasks.normalizeTask({title:'Уборка',date:'2026-10-19',time:'09:00',endTime:'10:00',repeat:'custom',repeatDays:[1,3,5],repeatCount:5});
 assert.equal(tasks.repeatOf(t.repeatFlag),'custom');
 assert.deepEqual(tasks.daysOf(t.repeatFlag),[1,3,5]);
 assert.deepEqual(tasks.recurrenceDates(t,'2026-10-01','2026-10-31'),
 ['2026-10-19','2026-10-21','2026-10-23','2026-10-26','2026-10-28','2026-10-30']);
 assert.throws(()=>tasks.normalizeTask({title:'Срок',date:'2026-10-19',repeat:'custom',repeatDays:[]}),/weekdays-required/);
});
test('import is verified and idempotent, preserving undated tasks',async()=>{
 const client=stateClient(),options=fixture(client);
 const r=await tasks.migrate(options);
 assert.equal(r.complete,true);
 assert.equal(r.total,2);
 assert.equal((await tasks.migrate(options)).total,2);
 assert.equal((await client.list(tasks.TASK_NS)).length,2);
 const t=(await client.getRecord(tasks.TASK_NS,'old-a')).value;
 assert.match(t.startDate,/T09:00/);
 assert.equal(t.endTime,'10:00');
 assert.equal(t.repeat,'custom');
 assert.deepEqual(t.repeatDays,[1,3,5]);
 assert.equal((await client.getRecord(tasks.TASK_NS,'old-undated')).value.date,'');
});
test('migration fails closed and never marks incomplete imports ready',async()=>{
 const client=stateClient();
 const options={...fixture(client),fetchProjectImpl:async()=>{throw Error('source-offline')}};
 await assert.rejects(tasks.migrate(options),/source-offline/);
 assert.equal(await tasks.ready(options),null);
});
test('offline replay cannot duplicate create or complete',async()=>{
 const client=stateClient(),options=fixture(client);
 await tasks.migrate(options);
 const body={clientId:'saved-id-123',title:'Дело',date:'2026-10-19',time:'09:00',endTime:'10:00',repeat:'custom',repeatDays:[1,3,5],repeatCount:5,responsible:'Диана'};
 const first=await tasks.create(body,'Рустам',options),second=await tasks.create(body,'Рустам',options);
 assert.equal(first.created,true);
 assert.equal(second.created,false);
 assert.equal(first.task.id,second.task.id);
 const doneId='rudi-saved-id-123__2026-10-21';
 await assert.rejects(tasks.modify('complete',{taskId:doneId},'Рустам',options),/forbidden/);
 assert.equal((await tasks.modify('complete',{taskId:doneId},'Диана',options)).wasOpen,true);
 assert.equal((await tasks.modify('complete',{taskId:doneId},'Диана',options)).wasOpen,false);
 assert.equal((await tasks.occurrences('2026-10','Диана',options)).some(x=>x.id===doneId),false);
});

test('Lulu nail task completion records real Moscow time once; reopen removes it and offline time survives replay',async()=>{
 const client=stateClient(),options={...fixture(client),now:Date.parse('2026-10-30T14:00:00Z')};await tasks.migrate(options);
 const created=await tasks.create({clientId:'lulu-nails-fixture',title:'Стрижка когтей Лулу',date:'2026-10-29',repeat:'none',responsible:''},'Рустам',options);
 const taskId=created.task.id,completedAt='2026-10-29T15:20:00Z';
 await tasks.modify('complete',{taskId,completedAt},'Диана',options);
 await tasks.modify('complete',{taskId},'Рустам',options);
 const read=()=>require('../api/lulu-care-store.cjs').readLuluCare({cacheOptions:{stateClient:client}});
 let records=(await read()).records;assert.equal(records.length,1);assert.equal(records[0].data.date,'2026-10-29');assert.equal(records[0].data.time,'18:20');assert.equal(records[0].actor,'Диана');
 await tasks.modify('reopen',{taskId},'Диана',options);assert.equal((await read()).records.length,0);
 await tasks.modify('complete',{taskId,completedAt:'2026-10-30T12:05:00Z'},'Рустам',options);
 records=(await read()).records;assert.equal(records.length,1);assert.equal(records[0].data.time,'15:05');assert.equal(records[0].actor,'Рустам');
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../api/shared-native-tasks.cjs'),routes=require('../api/shared-native-routes.cjs');
function fixture(){
 const rows=new Map(),key=(ns,id)=>ns+'\0'+id;
 const client={getRecord:async(ns,id)=>rows.has(key(ns,id))?{key:id,value:structuredClone(rows.get(key(ns,id)))}:null,
  set:async(ns,id,value)=>{rows.set(key(ns,id),structuredClone(value));return true},
  setIfAbsent:async(ns,id,value)=>{if(rows.has(key(ns,id)))return false;rows.set(key(ns,id),structuredClone(value));return true},
  remove:async(ns,id)=>rows.delete(key(ns,id)),list:async ns=>[...rows].filter(([id])=>id.startsWith(ns+'\0')).map(([id,value])=>({key:id.slice(ns.length+1),value:structuredClone(value)}))};
 rows.set(key(store.STATE_NS,'ready'),{complete:true});
 const options={client,now:Date.parse('2026-10-25T12:00:00Z')};
 async function create(extra={}){return store.create({clientId:'task',title:'Исходная задача',date:'2026-10-19',time:'09:00',endTime:'10:00',description:'Детали',responsible:'Диана',...extra},'Диана',options)}
 async function call(action,body={},actor='Диана',hooks={}){const res={code:200,status(n){this.code=n;return this},json(value){this.body=value;return this}};await routes.handle({method:'POST',body},res,action,actor,options,hooks);return res}
 return {client,options,create,call};
}
const events=calendar=>calendar.days.flatMap(day=>day.events);
test('calendar retains checked single tasks while agenda/today/next stay active-only, then tokenless reopen restores the task',async()=>{
 const f=fixture();const {task}=await f.create();
 assert.equal((await store.modify('complete',{taskId:task.id},'Диана',f.options)).wasOpen,true);
 assert.deepEqual(await store.occurrences('2026-10','Диана',f.options),[]);
 const checked=events(await routes.nativeCalendar({month:'2026-10',scope:'diana'},'Диана',f.options));
 assert.equal(checked.length,1);assert.equal(checked[0].id,task.id);assert.equal(checked[0].completed,true);
 assert.equal(checked[0].canComplete,false);assert.equal(checked[0].canEdit,false);assert.equal(checked[0].canReopen,true);
 assert.ok(checked[0].completedAt);assert.equal(checked[0].description,'Детали');assert.equal(checked[0].startTime,'09:00');
 const other=await store.occurrences('2026-10','Рустам',{...f.options,includeCompleted:true});assert.equal(other[0].canReopen,false);
 assert.deepEqual((await routes.nativeToday('Диана',f.options)).tasks,[]);assert.equal((await routes.nativeNext('Диана',f.options)).task,null);
 let reversals=0;
 const reopened=await f.call('task-reopen',{taskId:task.id},'Диана',{onUndo:async(t,date,actor)=>{reversals++;assert.equal(t.id,task.id);assert.equal(date,'2026-10-19');assert.equal(actor,'Диана')}});
 assert.equal(reopened.code,200);assert.deepEqual(reopened.body,{ok:true,reopened:true,wasCompleted:true,taskId:task.id,date:'2026-10-19'});
 assert.equal((await f.call('task-reopen',{taskId:task.id},'Диана',{onUndo:async()=>{reversals++}})).body.wasCompleted,false);
 assert.equal(reversals,1);
 const active=await store.occurrences('2026-10','Диана',f.options);assert.equal(active.length,1);assert.equal(active[0].completed,false);
 assert.equal(events(await routes.nativeCalendar({month:'2026-10'},'Диана',f.options)).length,1);
 assert.equal((await store.modify('complete',{taskId:task.id},'Диана',f.options)).wasOpen,true);
});
test('completed recurring snapshots survive series edits; reopening touches one occurrence without duplicates',async()=>{
 const f=fixture();await f.create({repeat:'daily',repeatCount:3});
 const id='rudi-task__2026-10-20';await store.modify('complete',{taskId:id},'Диана',f.options);
 await store.modify('update',{taskId:'rudi-task',title:'Новая серия',description:'Новые детали',date:'2026-10-22',repeat:'weekly',repeatCount:2},'Диана',f.options);
 const done=(await store.occurrences('2026-10','Диана',{...f.options,includeCompleted:true})).find(t=>t.id===id);
 assert.equal(done.title,'Исходная задача');assert.equal(done.description,'Детали');assert.equal(done.date,'2026-10-20');assert.equal(done.completed,true);
 const before=(await f.client.getRecord(store.TASK_NS,'rudi-task')).value;
 const result=await store.modify('reopen',{taskId:id},'Диана',f.options);assert.equal(result.wasCompleted,true);
 assert.deepEqual((await f.client.getRecord(store.TASK_NS,'rudi-task')).value,before,'reopening an occurrence does not edit its series');
 const active=await store.occurrences('2026-10','Диана',f.options);assert.equal(active.filter(t=>t.id===id).length,1);assert.equal(active.find(t=>t.id===id).completed,false);
 assert.equal((await store.modify('complete',{taskId:id},'Диана',f.options)).wasOpen,true);
});
test('legacy single completions and legacy recurring done rows remain visible, but explicitly deleted tasks stay absent',async()=>{
 const f=fixture();const {task}=await f.create();
 const original=(await f.client.getRecord(store.TASK_NS,task.id)).value;
 await f.client.set(store.TASK_NS,task.id,{...original,deleted:true,completed:true});
 let list=await store.occurrences('2026-10','Диана',{...f.options,includeCompleted:true});assert.equal(list.length,1);assert.equal(list[0].completed,true);
 assert.equal((await store.modify('reopen',{taskId:task.id},'Диана',f.options)).wasCompleted,true);
 await f.client.set(store.TASK_NS,'deleted',{...original,id:'deleted',deleted:true,completed:false});
 await f.client.set(store.TASK_NS,'explicit',{...original,id:'explicit',deleted:true,completed:true,deletedAt:'2026-10-22T00:00:00Z'});
 await f.client.set(store.TASK_NS,'repeat',{...original,id:'repeat',repeatFlag:'RRULE:FREQ=DAILY;COUNT=2'});
 await f.client.set(store.DONE_NS+'2026-10','repeat__2026-10-20',{at:'2026-10-20T10:00:00Z',actor:'Диана'});
 list=await store.occurrences('2026-10','Диана',{...f.options,includeCompleted:true});
 assert.ok(!list.some(t=>t.id==='deleted'||t.id==='explicit'));
 assert.equal(list.find(t=>t.id==='repeat__2026-10-20').completed,true);
 assert.equal(list.find(t=>t.id==='repeat__2026-10-20').completedAt,'2026-10-20T10:00:00Z');
 assert.equal((await store.modify('reopen',{taskId:'repeat__2026-10-20'},'Диана',f.options)).wasCompleted,true);
});
test('reopen enforces responsibility and occurrence identity; actor scope never includes another owner or personal history',async()=>{
 const f=fixture();await f.create({repeat:'daily',repeatCount:2});
 const id='rudi-task__2026-10-20';await store.modify('complete',{taskId:id},'Диана',f.options);
 const forbidden=await f.call('task-reopen',{taskId:id},'Рустам');assert.equal(forbidden.code,403);
 await assert.rejects(store.modify('reopen',{taskId:'rudi-task__2026-02-31'},'Диана',f.options),/invalid/);
 await assert.rejects(store.modify('reopen',{taskId:'rudi-task__2026-10-18'},'Диана',f.options),/invalid/);
 const rustam=await f.create({clientId:'rustam',title:'Для Рустама',responsible:'Рустам'});await store.modify('complete',{taskId:rustam.task.id},'Рустам',f.options);
 assert.ok(!events(await routes.nativeCalendar({month:'2026-10',scope:'diana'},'Диана',f.options)).some(t=>t.id===rustam.task.id));
 await f.client.set(store.DONE_NS+'2026-10','private',{at:'2026-10-20T00:00:00Z',event:{id:'private',title:'Private',date:'2026-10-20',personal:true,projectId:'personal',responsible:'Рустам'}});
 assert.ok(!(await store.occurrences('2026-10','Диана',{...f.options,includeCompleted:true})).some(t=>t.id==='private'));
 assert.equal(routes.shouldHandle('task-reopen'),true);assert.equal(routes.shouldHandle('task-reopen',{personal:true}),false);
});
test('concurrent reopen and old undo token replay invoke reverse-stars once per real transition',async()=>{
 const f=fixture();await f.create({repeat:'daily',repeatCount:2});const id='rudi-task__2026-10-20';await store.modify('complete',{taskId:id},'Диана',f.options);
 let reversals=0;const hooks={onUndo:async()=>{reversals++},open:()=>({actor:'Диана',expiresAt:Date.now()+30000,type:'rudi-shared-completion-v1',taskId:id})};
 const concurrent=await Promise.all([f.call('task-reopen',{taskId:id},'Диана',hooks),f.call('task-reopen',{taskId:id},'Диана',hooks)]);
 assert.equal(concurrent.filter(r=>r.code===200&&r.body.wasCompleted).length,1);assert.equal(reversals,1);
 assert.equal((await f.call('task-completion-undo',{undoToken:'old'},'Диана',hooks)).code,200);assert.equal(reversals,1);
 const list=await store.occurrences('2026-10','Диана',f.options);assert.equal(list.filter(t=>t.id===id).length,1);
});
test('a fabricated occurrence id cannot complete a single task twice or create a second score identity',async()=>{
 const f=fixture();await f.create();
 await assert.rejects(store.modify('complete',{taskId:'rudi-task__2026-10-19'},'Диана',f.options),/occurrence-invalid/);
 assert.deepEqual(await f.client.list(store.DONE_NS+'2026-10'),[]);
});
test('recompleting after a responsibility/title edit awards the current task, while undo uses its original completed owner',async()=>{
 const f=fixture();await f.create({repeat:'daily',repeatCount:2});const id='rudi-task__2026-10-20';
 await store.modify('complete',{taskId:id},'Диана',f.options);
 await store.modify('update',{taskId:'rudi-task',title:'Новая задача',responsible:'Рустам',repeat:'daily',repeatCount:2},'Диана',f.options);
 const reopened=await store.modify('reopen',{taskId:id},'Рустам',f.options);
 assert.equal(reopened.taskSnapshot.responsible,'Диана','reverse the award originally made to Diana');
 const completed=await store.modify('complete',{taskId:id},'Рустам',f.options);
 assert.equal(completed.responsible,'Рустам');assert.equal(completed.title,'Новая задача');assert.equal(completed.wasOpen,true);
 const event=(await store.occurrences('2026-10','Рустам',{...f.options,includeCompleted:true})).find(item=>item.id===id);
 assert.equal(event.responsible,'Рустам');assert.equal(event.title,'Новая задача');
});
test('a reopened historical shared occurrence follows current assignment in actor-scoped calendars',async()=>{
 const f=fixture();await f.create({responsible:'',repeat:'daily',repeatCount:2});const id='rudi-task__2026-10-20';
 await store.modify('complete',{taskId:id},'Диана',f.options);
 await store.modify('update',{taskId:'rudi-task',responsible:'Рустам',date:'2026-11-01',repeat:'daily',repeatCount:2},'Диана',f.options);
 await store.modify('reopen',{taskId:id},'Рустам',f.options);
 const reopened=(await store.occurrences('2026-10','Рустам',f.options)).find(item=>item.id===id);
 assert.equal(reopened.responsible,'Рустам');assert.equal(reopened.together,false);assert.equal(reopened.assigned,true);assert.equal(reopened.assignee,'RST');
 assert.deepEqual(events(await routes.nativeCalendar({month:'2026-10',scope:'diana'},'Диана',f.options)),[]);
});
test('a failed single-task restoration leaves completion intact and a retry can finish once',async()=>{
 const f=fixture();await f.create();await store.modify('complete',{taskId:'rudi-task'},'Диана',f.options);
 const set=f.client.set;let fail=true;
 f.client.set=async(ns,id,value)=>{if(ns===store.TASK_NS&&value.completed===false&&fail){fail=false;throw Error('restore-unavailable')}return set(ns,id,value)};
 await assert.rejects(store.modify('reopen',{taskId:'rudi-task'},'Диана',f.options),/restore-unavailable/);
 assert.equal((await f.client.getRecord(store.DONE_NS+'2026-10','rudi-task')).value.reopened,false);
 assert.equal((await store.modify('reopen',{taskId:'rudi-task'},'Диана',f.options)).wasCompleted,true);
 assert.equal((await f.client.getRecord(store.TASK_NS,'rudi-task')).value.completed,false);
 assert.equal((await store.modify('reopen',{taskId:'rudi-task'},'Диана',f.options)).wasCompleted,false);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const shared=require('../api/shared-native-tasks.cjs');
const {personalTasks}=require('../api/diana-personal-tasks.cjs');
const {completeRustamPersonalTask}=require('../api/ticktick-personal-completion.cjs');
const NOW='2026-10-22T14:45:00Z';
function client(){
 const rows=new Map();let writes=0;const key=(ns,id)=>ns+'\0'+id;
 return {rows,get writes(){return writes},
  async getRecord(ns,id){const value=rows.get(key(ns,id));return value?{value:structuredClone(value)}:null},
  async list(ns){return [...rows].filter(([k])=>k.startsWith(ns+'\0')).map(([k,v])=>({key:k.slice(ns.length+1),value:structuredClone(v)}))},
  async set(ns,id,v){writes++;rows.set(key(ns,id),structuredClone(v))},
  async setIfAbsent(ns,id,v){if(rows.has(key(ns,id)))return false;writes++;rows.set(key(ns,id),structuredClone(v));return true},
  async remove(ns,id){writes++;return rows.delete(key(ns,id))}
 };
}
test('tomorrow shared recurrence cannot create a completion marker',async()=>{
 const c=client();await c.set(shared.STATE_NS,'ready',{complete:true});
 await c.set(shared.TASK_NS,'garbage',{id:'garbage',title:'Мусор',date:'2026-10-21',startDate:'2026-10-21T08:30:00+0300',responsible:'Рустам',repeatFlag:'RRULE:FREQ=DAILY;INTERVAL=1'});
 const before=c.writes;
 await assert.rejects(shared.modify('complete',{taskId:'garbage__2026-10-23'},'Рустам',{client:c,now:NOW}),/task-completion-future-forbidden/);
 assert.equal(c.writes,before,'rejection must happen before any state changes');
 assert.equal((await shared.modify('complete',{taskId:'garbage__2026-10-22'},'Рустам',{client:c,now:NOW})).wasOpen,true);
});
test('Moscow midnight opens a shared recurrence, even while UTC is still yesterday',async()=>{
 const c=client();await c.set(shared.STATE_NS,'ready',{complete:true});
 await c.set(shared.TASK_NS,'night',{id:'night',date:'2026-10-23',repeatFlag:''});
 await assert.rejects(shared.modify('complete',{taskId:'night'},'Рустам',{client:c,now:'2026-10-22T20:59:59Z'}),/future-forbidden/);
 assert.equal((await shared.modify('complete',{taskId:'night'},'Рустам',{client:c,now:'2026-10-22T21:00:00Z'})).wasOpen,true);
});
test('tomorrow Diana personal task cannot write history or delete its series',async()=>{
 const c=client();await personalTasks({actor:'Диана',operation:'create',clientId:'future',title:'Дело',date:'2026-10-23',repeat:'none'},{client:c,now:NOW});
 const before=c.writes;
 await assert.rejects(personalTasks({actor:'Диана',operation:'complete',taskId:'diana-future'},{client:c,now:NOW}),/future-forbidden/);
 assert.equal(c.writes,before);
 assert.ok((await c.getRecord('rudi-personal-calendar-v1:diana','diana-future')).value);
});
test('personal TickTick completion checks the task from the server before sending completion',async()=>{
 let completed=0;
 const input={actor:'Рустам',token:{accessToken:'fixture'},taskId:'future',projectId:'own',sharedProjectId:'shared',options:{now:NOW}};
 const deps={tokenHasWriteScope:()=>true,listTickTickProjects:async()=>[{id:'own'}],
  fetchTask:async()=>({id:'future',projectId:'own',startDate:'2026-10-23T08:30:00+0300',status:0}),
  completeTickTickTask:async()=>{completed++}};
 await assert.rejects(completeRustamPersonalTask(input,deps),/future-forbidden/);
 assert.equal(completed,0);
 deps.fetchTask=async()=>({id:'future',projectId:'own',startDate:'2026-10-21T08:30:00+0300',status:0});
 assert.equal((await completeRustamPersonalTask(input,deps)).wasOpen,true);
 assert.equal(completed,1,'overdue tasks remain completable');
});
test('future shared checklist items cannot be marked complete',async()=>{
 const c=client();await c.set(shared.STATE_NS,'ready',{complete:true});
 await c.set(shared.TASK_NS,'check',{id:'check',date:'2026-10-23',items:[{id:'one',status:0}]});
 const before=c.writes;
 await assert.rejects(shared.modify('checklist-toggle',{taskId:'check',itemId:'one',completed:true},'Рустам',{client:c,now:NOW}),/future-forbidden/);
 assert.equal(c.writes,before);
});
test('rejected shared completion returns a date conflict without awarding stars',async()=>{
 const c=client();await c.set(shared.STATE_NS,'ready',{complete:true});
 await c.set(shared.TASK_NS,'later',{id:'later',date:'2026-10-23'});
 let awards=0;const res={status(code){this.code=code;return this},json(value){this.value=value;return this}};
 await require('../api/shared-native-routes.cjs').handle({method:'POST',body:{taskId:'later'}},res,'task-complete','Рустам',{client:c,now:NOW},{onCompleted:()=>{awards++}});
 assert.equal(res.code,409);assert.equal(res.value.error,'task-completion-future-forbidden');assert.equal(awards,0);
});
test('legacy TickTick checklist completion checks the canonical server date',async()=>{
 let writes=0;
 const fetchImpl=async(url,init={})=>{
  if(init.method==='POST')writes++;
  return {ok:true,status:200,json:async()=>({id:'task',projectId:'project',startDate:'2026-10-23T08:30:00+0300',items:[{id:'one',status:0}]})};
 };
 await assert.rejects(require('../api/ticktick-client.cjs').updateTaskChecklistItem('fixture','project','task','one',true,{now:NOW,fetchImpl}),/future-forbidden/);
 assert.equal(writes,0);
});
test('browser policy uses occurrence date and Moscow day; undated and overdue tasks remain allowed',()=>{
 const policy=require('../public/task-completion-policy.js');
 assert.equal(policy.isFutureTask({id:'series__2026-10-23',date:'2026-10-21'},NOW),true);
 assert.equal(policy.isFutureTask({startDate:'2026-10-22T22:30:00Z'},NOW),true);
 assert.equal(policy.isFutureTask({date:'2026-10-22'},NOW),false);
 assert.equal(policy.isFutureTask({date:'2026-10-21'},NOW),false);
 assert.equal(policy.isFutureTask({id:'undated'},NOW),false);
 assert.equal(policy.isFutureTask({date:'2026-10-23'},'2026-10-22T21:00:00Z'),false);
});
test('offline queue rejects future completions before persisting any action',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),policy=require('../public/task-completion-policy.js');
 const source=fs.readFileSync('public/calendar-offline.js','utf8');
 const fn=source.slice(source.indexOf('async function enqueue('),source.indexOf('  function eventFromCreate('));
 let writes=0;
 const enqueue=vm.runInNewContext('('+fn+')',{root:{RUDITaskCompletionPolicy:{assertTaskCompletionAllowed:t=>policy.assertTaskCompletionAllowed(t,NOW)}},id:()=>'',clone:x=>x,change:async()=>{writes++},summary:async()=>{}});
 for(const kind of ['complete','personal-complete','diana-complete']){
  await assert.rejects(enqueue(kind==='diana-complete'?'Диана':'Рустам',kind,{taskId:'future__2026-10-23',task:{id:'future__2026-10-23',date:'2026-10-23'}}),/future-forbidden/);
 }
 assert.equal(writes,0);
});

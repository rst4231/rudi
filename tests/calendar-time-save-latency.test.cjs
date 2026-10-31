'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
function harness(){
 const timers=[],calls=[],window={document:{body:{dataset:{}},visibilityState:'visible'},dispatchEvent(){}};
 const task={id:'task1',personal:true,projectId:'biz',date:'2026-10-19',startTime:'13:30',title:'Ответить новичкам'};
 const context={window,indexedDB:new IDBFactory(),navigator:{onLine:true},CustomEvent:class{},
  fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})}},
  setTimeout:callback=>{timers.push(callback);return timers.length},clearTimeout(){},AbortController};
 vm.runInNewContext(fs.readFileSync('public/calendar-offline.js','utf8'),context);
 const src=fs.readFileSync('public/personal-task-editor.js','utf8');
 context.active={task,ctx:{actor:'Рустам',initData:'test-auth',queueOffline:()=>new Promise(()=>{})}};
 const request=vm.runInNewContext(src.slice(src.indexOf('async function request(action,'),src.indexOf('const errorText='))+';request',context);
 return {window,task,request,timers,calls};
}
test('time edit is durable and visible before a slow reachability probe or TickTick reply',async()=>{
 const h=harness(),store=h.window.rudiCalendarOffline;
 const result=await Promise.race([h.request('personal-task-edit',{operation:'save',taskId:'task1',projectId:'biz',targetProjectId:'biz',date:'2026-10-19',time:'14:45',title:h.task.title}),new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),150))]);
 assert.equal(result.queued,true,'saving must not wait for the host network probe');
 const local=await store.materialize('Рустам','2026-10',{ticktickDays:[{date:'2026-10-19',events:[h.task]}]},'personal');
 assert.equal(local.ticktickDays[0].events[0].startTime,'14:45');
 assert.equal(h.calls.length,0,'the edit is persisted before remote synchronization');
 for(const callback of h.timers)await callback();
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].body.time,'14:45');
 assert.equal(h.calls[0].body.initData,'test-auth');
 assert.equal((await store.summary('Рустам')).pending,0);
});
test('a failed local write is reported without sending an unrecorded update',async()=>{
 const h=harness();h.window.rudiCalendarOffline.enqueue=async()=>{throw Error('disk-full')};
 const outcome=await Promise.race([h.request('personal-task-edit',{operation:'save',targetProjectId:'biz'}).then(()=>'',e=>e.message),new Promise(resolve=>setTimeout(()=>resolve('timeout'),150))]);
 assert.equal(outcome,'disk-full');
 assert.equal(h.calls.length,0);
});

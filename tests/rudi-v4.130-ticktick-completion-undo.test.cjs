'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {reopenTickTickTask}=require('../api/ticktick-client.cjs');
const {reopenRustamPersonalTask}=require('../api/ticktick-personal-completion.cjs');

function fakeTickTick({initial=2,apply=true,writeStatus=200}={}){
  let status=initial;
  const calls=[];
  const fetchImpl=async(url,opts={})=>{
    calls.push({url,method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):null});
    if(opts.method==='POST'){
      if(writeStatus!==200)return {ok:false,status:writeStatus};
      if(apply)status=JSON.parse(opts.body).status;
      return {ok:true,status:200,json:async()=>({})};
    }
    return {ok:true,status:200,json:async()=>({
      id:'task-1',projectId:'list-1',title:'My task',status,
      desc:'Keep description',priority:3,repeatFlag:'RRULE:FREQ=WEEKLY',
      items:[{id:'item-1',title:'Child',status:0}],
    })};
  };
  return {calls,fetchImpl,get status(){return status}};
}

test('reopen updates exactly one TickTick task preserving content and verifying status',async()=>{
  const api=fakeTickTick();
  const result=await reopenTickTickTask('token','list-1','task-1',{fetchImpl:api.fetchImpl});
  assert.equal(result.reopened,true);
  assert.equal(api.status,0);
  const post=api.calls.find(c=>c.method==='POST');
  assert.ok(post);
  assert.equal(post.url,'https://api.ticktick.com/open/v1/task/task-1');
  assert.equal(post.body.projectId,'list-1');
  assert.equal(post.body.status,0);
  assert.equal(post.body.desc,'Keep description');
  assert.equal(post.body.repeatFlag,'RRULE:FREQ=WEEKLY');
  assert.equal(post.body.items[0].id,'item-1');
  assert.equal(api.calls.filter(c=>c.method!=='POST').length,2);
});

test('reopen skips a task already restored',async()=>{
  const api=fakeTickTick({initial:0});
  const result=await reopenTickTickTask('token','list-1','task-1',{fetchImpl:api.fetchImpl});
  assert.equal(result.alreadyOpen,true);
  assert.equal(api.calls.filter(c=>c.method==='POST').length,0);
});

test('server refuses false-positive undo success if TickTick ignores status',async()=>{
  const api=fakeTickTick({apply:false});
  await assert.rejects(reopenTickTickTask('token','list-1','task-1',{fetchImpl:api.fetchImpl}),/reopen-not-applied/);
});

test('server refuses write failures and leaves task completion intact',async()=>{
  const api=fakeTickTick({writeStatus:403});
  await assert.rejects(reopenTickTickTask('token','list-1','task-1',{fetchImpl:api.fetchImpl}),/write-forbidden/);
  assert.equal(api.status,2);
});

const own={actor:'Рустам',token:{accessToken:'personal-token',scope:'tasks:read tasks:write'},
  taskId:'task-1',projectId:'list-1',sharedProjectId:'shared'};
function deps(overrides={}){
  return {
    listTickTickProjects:async()=>[{id:'list-1'}],
    fetchTask:async()=>({id:'task-1',projectId:'list-1',status:2}),
    reopenTickTickTask:async()=>({reopened:true}),
    ...overrides
  };
}
test('personal undo requires owner, own list, matching task, write permission',async()=>{
  const checks=[
    [{...own,actor:'Диана'},/owner-forbidden/],
    [{...own,projectId:'shared'},/shared-project-forbidden/],
    [{...own,token:{accessToken:'personal-token',scope:'tasks:read'}},/write-permission-required/],
  ];
  for(const [input,err] of checks)await assert.rejects(reopenRustamPersonalTask(input,deps()),err);
  await assert.rejects(reopenRustamPersonalTask(own,deps({listTickTickProjects:async()=>[]})),/project-forbidden/);
  await assert.rejects(reopenRustamPersonalTask(own,deps({fetchTask:async()=>({id:'different',projectId:'list-1',status:2})})),/task-mismatch/);
  const result=await reopenRustamPersonalTask(own,deps());
  assert.equal(result.reopened,true);
});

test('personal undo is idempotent and skips write if task is already open',async()=>{
  let count=0;
  const result=await reopenRustamPersonalTask(own,deps({
    fetchTask:async()=>({id:'task-1',projectId:'list-1',status:0}),
    reopenTickTickTask:async()=>{count++}
  }));
  assert.equal(result.alreadyOpen,true);
  assert.equal(count,0);
});

test('calendar and dashboard share the existing global Undo UI',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const backend=fs.readFileSync('api/partner-message.js','utf8');
  assert.ok(app.includes("function showTickTickCompletionUndo(task,payload)"));
  assert.ok(app.includes("showUndoSnackbar('Задача выполнена'"));
  assert.ok(app.includes("ticktickAction=task-completion-undo"));
  assert.equal(app.split("showTickTickCompletionUndo(task,payload);").length-1,2);
  assert.ok(backend.includes("if (action === 'task-completion-undo')"));
  assert.ok(backend.includes("type:'ticktick-task-completion-undo-v1'"));
  assert.ok(backend.includes("reverseScoreByDedupeKey(key,"));
  assert.ok(backend.includes("if(personal&&actor!=='Рустам')"));
});

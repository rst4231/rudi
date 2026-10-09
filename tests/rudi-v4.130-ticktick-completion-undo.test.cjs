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

test('personal completion captures an exact short-lived restore snapshot',async()=>{
  const {completeRustamPersonalTask}=require('../api/ticktick-personal-completion.cjs');
  const result=await completeRustamPersonalTask(own,{
    listTickTickProjects:async()=>[{id:'list-1'}],
    fetchTask:async()=>({id:'task-1',projectId:'list-1',title:'Keep original',status:0,desc:'Details',priority:5}),
    completeTickTickTask:async()=>true
  });
  assert.equal(result.taskSnapshot.title,'Keep original');
  assert.equal(result.taskSnapshot.desc,'Details');
  assert.equal(result.taskSnapshot.priority,5);
  assert.ok(!Object.hasOwn(result.taskSnapshot,'status'));
});
test('personal undo restores from sealed pre-completion snapshot when completed task GET returns 404',async()=>{
  let restored=null;
  const snapshot={id:'task-1',projectId:'list-1',title:'Keep original',desc:'Details'};
  const result=await reopenRustamPersonalTask({...own,taskSnapshot:snapshot},deps({
    fetchTask:async()=>{throw new Error('ticktick-task-not-found')},
    reopenTickTickTask:async(token,project,id,options)=>{restored=options;return {reopened:true}}
  }));
  assert.equal(result.reopened,true);
  assert.equal(restored.task.title,'Keep original');
  assert.equal(restored.force,true);
});
test('forcing a known pre-completion snapshot posts status zero instead of skipping',async()=>{
  const api=fakeTickTick({initial:2});
  const result=await reopenTickTickTask('token','list-1','task-1',{
    fetchImpl:api.fetchImpl,
    task:{id:'task-1',projectId:'list-1',title:'Keep original',status:0},
    force:true
  });
  assert.equal(result.reopened,true);
  assert.equal(api.status,0);
  assert.equal(api.calls.filter(call=>call.method==='POST').length,1);
});
test('undo snackbar retains action and shows error when request fails',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.ok(app.includes("copy.textContent='Не удалось отменить. Попробовать ещё раз'"));
  assert.ok(app.includes('if(succeeded)hideUndoSnackbar()'));
});

test('personal Undo tolerates temporary TickTick 500 on completed task GET',async()=>{
  let restored=null;
  const original={id:'task-1',projectId:'list-1',title:'Original'};
  await reopenRustamPersonalTask({...own,taskSnapshot:original},deps({
    fetchTask:async()=>{throw new Error('ticktick-api-failed:500')},
    reopenTickTickTask:async(_token,_project,_task,options)=>{restored=options}
  }));
  assert.equal(restored.task.title,'Original');
  assert.equal(restored.force,true);
});
test('personal Undo does not bypass expired/invalid credentials with saved snapshot',async()=>{
  await assert.rejects(reopenRustamPersonalTask({...own,taskSnapshot:{
    id:'task-1',projectId:'list-1',title:'Original'
  }},deps({fetchTask:async()=>{throw new Error('ticktick-token-invalid')}})),/ticktick-token-invalid/);
});

test('Undo tokens include the required sealed-snapshot version for personal and shared tasks',()=>{
  const source=fs.readFileSync('api/partner-message.js','utf8');
  assert.ok(source.includes("version:2,type:'ticktick-task-completion-undo-v1'"));
  assert.equal(source.split("version:2,type:'ticktick-task-completion-undo-v1'").length-1,2);
  assert.ok(source.includes("version:2,type:'ticktick-task-delete-undo-v1'"));
});

test('a personal calendar drag updates only its own timed task, preserving duration',async()=>{
  const {rescheduleRustamPersonalTask}=require('../api/ticktick-personal-completion.cjs');
  let changes=null;
  const task={
    id:'task-1',projectId:'list-1',title:'Original title',status:0,
    isAllDay:false,desc:'Keep details',startDate:'2026-10-09T07:00:00+0000',
    dueDate:'2026-10-09T07:45:00+0000',timeZone:'Europe/Moscow'
  };
  const permissions={
    listTickTickProjects:async()=>[{id:'list-1'}],
    fetchTask:async()=>task,
    updateTickTickTask:async(_token,_project,_id,next)=>{changes=next}
  };
  const moved=await rescheduleRustamPersonalTask({
    ...own,date:'2026-10-09',time:'10:30'
  },permissions);
  assert.equal(moved.moved,true);
  assert.equal(changes.startDate,'2026-10-09T07:30:00+0000');
  assert.equal(changes.dueDate,'2026-10-09T08:15:00+0000');
  assert.equal(changes.desc,'Keep details');
  await assert.rejects(
    rescheduleRustamPersonalTask({...own,date:'2026-10-09',time:'10:10'},permissions),
    /time-invalid/
  );
  await assert.rejects(
    rescheduleRustamPersonalTask({...own,date:'2026-10-09',time:'10:30'},
      {...permissions,fetchTask:async()=>({...task,repeatFlag:'RRULE:FREQ=WEEKLY'})}),
    /reschedule-unsupported/
  );
  await assert.rejects(
    rescheduleRustamPersonalTask({...own,actor:'Диана',date:'2026-10-09',time:'10:30'},permissions),
    /owner-forbidden/
  );
});

test('personal week blocks move by long-press, not by a six-dot button',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const backend=fs.readFileSync('api/partner-message.js','utf8');
  const css=fs.readFileSync('public/calendar.css','utf8');
  assert.ok(app.includes('function calendarAttachPersonalTimeDrag('));
  assert.ok(app.includes('calendarAttachPersonalTimeDrag(block,when,event,dateKey,viewport)'));
  assert.ok(app.includes('const HOLD_MS=420'));
  assert.ok(app.includes("block.addEventListener('pointerdown'"));
  assert.ok(app.includes("block.classList.add('calendar-week-draggable')"));
  assert.ok(!app.includes("document.createElement('button');\n        handle.type='button';\n        handle.className='calendar-week-drag-handle'"));
  assert.ok(!css.includes('.calendar-week-drag-handle{'));
  assert.ok(css.includes('.calendar-week-time-event.calendar-agenda-task.calendar-week-draggable{'));
  assert.ok(css.includes('touch-action:none!important'));
  assert.ok(app.includes("ticktickAction=personal-task-move"));
  assert.ok(backend.includes("if (action === 'personal-task-move')"));
});
test('week mode disables browser pull-to-refresh for both personal and shared',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/calendar.css','utf8');
  assert.ok(app.includes("document.body.dataset.appTab==='schedule'&&calendarDisplayMode==='week'"));
  assert.ok(app.includes("function syncCalendarWeeklyOverscroll()"));
  assert.ok(css.includes('html.rudi-calendar-week-no-pull'));
  assert.ok(app.includes("if(document.body.dataset.appTab==='schedule'&&calendarDisplayMode==='week'){reset();return}"));
});
test('drag save restores the visible day and page scroll after repaint',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.ok(app.includes('const savedPageX=window.scrollX,savedPageY=window.scrollY'));
  assert.ok(app.includes('const savedTimeScroll=viewport.scrollTop'));
  assert.ok(app.includes('if(replacement)replacement.scrollTop=savedTimeScroll'));
  assert.ok(app.includes('window.scrollTo(savedPageX,savedPageY)'));
  assert.ok(app.includes('panel.dataset.calendarDate=dateKey'));
});
test('TickTick API 500 in shared list does not block personal calendar or erase cache',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const backend=fs.readFileSync('api/partner-message.js','utf8');
  assert.ok(backend.includes("if(!personalOnly)throw error"));
  assert.ok(backend.includes('sharedUnavailable:sharedFetchFailed'));
  assert.ok(backend.includes('personalUnavailable:personalFetchFailed'));
  assert.ok(app.includes("status.textContent='TickTick временно недоступен'"));
  assert.ok(app.includes('fallbackTick&&retainedTick.length?retainedTick'));
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {rescheduleRustamPersonalTask,rescheduleTickTickTaskTime}=require('../api/ticktick-personal-completion.cjs');
const app=fs.readFileSync('public/app.js','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
const css=fs.readFileSync('public/calendar.css','utf8');

function scenario(repeatFlag='',date='2026-10-10'){
  const task={
    id:'t1',projectId:'p1',title:'Task',status:0,isAllDay:false,repeatFlag,
    startDate:'2026-10-09T05:30:00+0000',dueDate:'2026-10-09T06:00:00+0000'
  };
  const calls=[];
  const deps={
    tokenHasWriteScope:()=>true,
    listTickTickProjects:async()=>[{id:'p1'}],
    fetchTask:async()=>task,
    updateTickTickTask:async(_token,_project,_id,changes)=>{calls.push(changes)}
  };
  const input={actor:'Рустам',token:{accessToken:'secret'},taskId:'t1',
    projectId:'p1',sharedProjectId:'shared',date,time:'10:15'};
  return {task,calls,deps,input};
}
test('dragging a future recurrence shifts the clock of its entire series without changing RRULE or anchor date',async()=>{
  const x=scenario('RRULE:FREQ=DAILY;INTERVAL=1;COUNT=12');
  const result=await rescheduleRustamPersonalTask(x.input,x.deps);
  assert.equal(result.series,true);
  assert.equal(x.calls[0].startDate,'2026-10-09T07:15:00+0000');
  assert.equal(x.calls[0].dueDate,'2026-10-09T07:45:00+0000');
  assert.equal(x.calls[0].repeatFlag,x.task.repeatFlag);
});
test('shared project can change recurrence clock using its authorized fetched record',async()=>{
  const x=scenario('RRULE:FREQ=WEEKLY;INTERVAL=1');
  const result=await rescheduleTickTickTaskTime({
    task:x.task,accessToken:'shared',projectId:'p1',taskId:'t1',
    date:'2026-10-16',time:'10:15'
  },x.deps);
  assert.equal(result.ok,true);
  assert.equal(x.calls[0].repeatFlag,x.task.repeatFlag);
});
test('nonrecurring tasks may move within their day but not a different day',async()=>{
  const x=scenario();
  await assert.rejects(rescheduleRustamPersonalTask(x.input,x.deps),/date-mismatch/);
  x.input.date='2026-10-09';
  await rescheduleRustamPersonalTask(x.input,x.deps);
  assert.equal(x.calls[0].dueDate,'2026-10-09T07:45:00+0000');
});
test('private endpoint denies Diana and shared project',async()=>{
  const x=scenario('RRULE:FREQ=DAILY');
  await assert.rejects(rescheduleRustamPersonalTask({...x.input,actor:'Диана'},x.deps),/owner-forbidden/);
  await assert.rejects(rescheduleRustamPersonalTask({...x.input,projectId:'shared'},x.deps),/shared-project-forbidden/);
  assert.equal(x.calls.length,0);
});
test('week gesture supports own and joint shared tasks without restricting to today',()=>{
  const handler=app.slice(app.indexOf('function calendarAttachTaskTimeDrag('),app.indexOf('function calendarWeekAgenda('));
  assert.match(handler,/task\.canEdit!==true/);
  assert.match(handler,/sharedWritable!==true/);
  assert.match(handler,/requestCalendarTickTickTaskMove\(task,dateKey/);
  assert.doesNotMatch(handler,/dateKey===todayState/);
  assert.match(app,/ticktickAction=task-move/);
  assert.match(app,/ticktickAction=personal-task-move/);
});
test('shared route checks actor and ownership before submitting a change',()=>{
  const action=api.slice(api.indexOf("if(action==='task-move')"),api.indexOf("if (action === 'personal-task-move')"));
  assert.match(action,/authorizeRequest\(req,body\.initData,options\)/);
  assert.match(action,/getSharedTaskMeta\(taskId,options\)/);
  assert.match(action,/if\(!sharedTaskCanDelete\(actor,task,meta\)\)/);
  assert.match(action,/rescheduleTickTickTaskTime/);
});
test('joint week cards show Together, Rustam, or Diana on timed and all-day blocks',()=>{
  assert.match(app,/if\(task\.together===true\|\|task\.ownerScope==='shared'\)return 'Вместе'/);
  assert.match(app,/task\.responsible==='Рустам'\|\|task\.responsible==='Диана'/);
  assert.match(app,/calendarSharedTaskOwnerLabel\(item\.task\)/);
  assert.match(app,/calendarSharedTaskOwnerLabel\(event\.task\)/);
  assert.match(css,/\.calendar-week-task-owner/);
});

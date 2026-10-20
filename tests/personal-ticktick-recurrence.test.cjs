'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {personalRepeatFlag,editable,createPersonalTask,editPersonalTask}=require('../api/personal-task-editor.cjs');
const date='2026-10-20';
const base={date,repeat:'daily',repeatEvery:1,repeatEnd:'never'};
test('repeating daily weekly monthly yearly and intervals',()=>{
  assert.equal(personalRepeatFlag(base,'',date),'RRULE:FREQ=DAILY;INTERVAL=1');
  assert.equal(personalRepeatFlag({...base,repeatEvery:3},'',date),'RRULE:FREQ=DAILY;INTERVAL=3');
  assert.equal(personalRepeatFlag({...base,repeat:'weekly',repeatEvery:2,repeatDays:[5,1,3]},'',date),'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR');
  assert.equal(personalRepeatFlag({...base,repeat:'monthly',repeatEvery:2},'',date),'RRULE:FREQ=MONTHLY;INTERVAL=2');
  assert.equal(personalRepeatFlag({...base,repeat:'yearly'},'',date),'RRULE:FREQ=YEARLY;INTERVAL=1');
});
test('stop rules and UTC Moscow date conversion',()=>{
  assert.equal(personalRepeatFlag({...base,repeatEnd:'count',repeatCount:5},'',date),'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=5');
  assert.equal(personalRepeatFlag({...base,repeatEnd:'date',repeatUntil:'2026-12-31'},'',date),'RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20261231T205959Z');
});
test('bad intervals, weekdays and ending cannot be persisted',()=>{
  for(const bad of [
    {repeatEvery:0},{repeatEvery:366},{repeat:'weekly',repeatDays:[]},
    {repeat:'weekly',repeatDays:[8]},{repeatEnd:'count',repeatCount:0},
    {repeatEnd:'date',repeatUntil:'2026-01-01'},
    {repeatEnd:'date',repeatUntil:'2026-02-30'},
    {repeatEnd:'invalid'}]){
    assert.throws(()=>personalRepeatFlag({...base,...bad},'',date),/ticktick-personal/);
  }
  assert.throws(()=>personalRepeatFlag(base,'',''),/repeat-date-required/);
});
test('editing without repeat payload preserves arbitrary TickTick rule',()=>{
  const other='RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR';
  assert.equal(personalRepeatFlag({date},other,date),other);
  assert.equal(editable({...base,repeat:'none'}, {title:'Task',repeatFlag:other}).repeatFlag,'');
  assert.equal(editable({title:'Task',date,time:'',description:''},{title:'Task',repeatFlag:other}).repeatFlag,other);
  assert.throws(()=>editable({title:'Task',date:'',repeat:'daily'},{title:'Task',repeatFlag:''}),/repeat-date-required/);
});
test('create and update actually send repeatFlag to TickTick',async()=>{
  const calls=[];
  const deps={
    tokenHasWriteScope:()=>true,
    listTickTickProjects:async()=>[{id:'biz',name:'Бизнес'}],
    fetchTask:async()=>({id:'task1',projectId:'biz',status:0,title:'Work',repeatFlag:'',desc:''}),
    createTickTickTask:async(_token,body)=>{calls.push(body);return {id:'new-id'}},
    updateTickTickTask:async(_token,_p,_id,changes)=>{calls.push(changes);return changes}
  };
  const common={actor:'Рустам',token:{accessToken:'private',scope:'tasks:write'},sharedProjectId:'shared',targetProjectId:'biz',
    title:'Work',description:'',date,time:'11:30',...base,repeat:'weekly',repeatDays:[1,3]};
  await createPersonalTask(common,deps);
  await editPersonalTask({...common,projectId:'biz',taskId:'task1',operation:'save'},deps);
  assert.equal(calls.length,2);
  assert.equal(calls[0].repeatFlag,'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE');
  assert.equal(calls[1].repeatFlag,calls[0].repeatFlag);
});
test('mobile recurring controls shown for personal TickTick and hide for never',()=>{
  const js=fs.readFileSync('public/personal-task-editor.js','utf8');
  const css=fs.readFileSync('public/personal-task-editor.css','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(js,/rudiPersonalTaskRepeatEndFields/);
  assert.match(js,/rudiPersonalTaskRepeatUntil/);
  assert.match(js,/rudiPersonalTaskRepeatCount/);
  assert.match(js,/rudiPersonalTaskWeekdays/);
  assert.match(js,/byId\('rudiPersonalTaskRepeatFields'\)\.hidden=false/);
  assert.match(js,/readRepeatFlag\(task\.repeatFlag\)/);
  assert.match(css,/max-width:390px/);
  assert.match(html,/personal-task-editor\.js\?v=4\.285-recurrence1/);
});

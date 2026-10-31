'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');

test('overdue dates count unfinished tasks, excluding completed tasks and external events',()=>{
 const start=source.indexOf('      function calendarOverdueTaskCount(');
 assert.ok(start>=0,'calendar overdue helper exists');
 const end=source.indexOf('      function workCalendarRenderSignature(',start);
 const context={};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const tasks=[{id:'active'},{id:'done',completed:true},{id:'meeting',externalCalendar:true}];
 assert.equal(context.calendarOverdueTaskCount('2026-10-24',tasks,'2026-10-25'),1);
 assert.equal(context.calendarOverdueTaskCount('2026-10-25',tasks,'2026-10-25'),0);
 assert.equal(context.calendarOverdueTaskCount('2026-10-26',tasks,'2026-10-25'),0);
 tasks[0].completed=true;
 assert.equal(context.calendarOverdueTaskCount('2026-10-24',tasks,'2026-10-25'),0);
 tasks[0].completed=false;
 assert.equal(context.calendarOverdueTaskCount('2026-10-24',tasks,'2026-10-25'),1);
});

test('shared completed calendar tasks can be unchecked only with reopen permission',async()=>{
 const start=source.indexOf('      function calendarTaskCanReopen('),end=source.indexOf('      async function completeTickTickTodayTask(',start);
 const calls=[],task={id:'shared__2026-10-24',date:'2026-10-24',title:'Дело',completed:true,personal:false,canReopen:true};
 const context={currentActor:'Диана',queueCalendarWhenOffline:async()=>false,managedJsonRequest:async(key,url,options)=>{calls.push({url,body:options.body});return {ok:true}},telegramInitData:()=>'',currentStateBackupToken:'backup',recentlyCompletedTickTickTaskIds:new Map(),refreshAfterTickTickTaskChange:async()=>{},document:{getElementById:()=>({})}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 assert.equal(context.calendarTaskCanReopen(task),true);
 assert.equal(context.calendarTaskCanReopen({...task,canReopen:false}),false);
 await context.reopenCalendarTask(task,{dataset:{},classList:{remove(){}}},{setAttribute(){}});
 assert.equal(task.completed,false);assert.equal(task.canComplete,true);
 assert.match(calls[0].url,/ticktickAction=task-reopen$/);
 assert.equal(calls[0].body.taskId,task.id);assert.equal(calls[0].body.date,task.date);
});

test('completing a calendar task retains its checked row while a refresh is pending',async()=>{
 const start=source.indexOf('      async function completeCalendarTickTickTask('),end=source.indexOf('      function calendarTaskCanReopen(',start);
 let removed=false;const classes=new Set();const task={id:'shared',date:'2026-10-24',title:'Дело',canReopen:true};
 const row={dataset:{},isConnected:true,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},remove(){removed=true}};
 const button={setAttribute(){}};
 const context={currentActor:'Рустам',blockFutureTaskCompletion:()=>false,tickTickTaskCanComplete:()=>true,requestTickTickTaskCompletion:async()=>({ok:true}),markTickTickTaskRecentlyCompleted(){},playCalendarConfetti(){},tg:null,setTimeout:fn=>fn(),showTickTickCompletionUndo(){},refreshAfterTickTickTaskChange:async()=>{},calendarTaskCanReopen:t=>t.completed&&t.canReopen};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 await context.completeCalendarTickTickTask(task,row,button,true);
 assert.equal(removed,false);assert.equal(task.completed,true);assert.equal(classes.has('is-completed'),true);
});

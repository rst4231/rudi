'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { completeRustamPersonalTask } = require('../api/ticktick-personal-completion.cjs');

const base = { actor:'Рустам', token:{accessToken:'personal-secret',scope:'tasks:read tasks:write'},
  taskId:'task42',projectId:'personal-list',sharedProjectId:'joint-list' };
function fakeDeps(overrides={}) {
  const calls={projects:0,task:0,complete:0};
  const deps={
    listTickTickProjects:async token=>{calls.projects++;assert.equal(token,'personal-secret');return [{id:'personal-list'}]},
    fetchTask:async (token,project,id)=>{calls.task++;return {id,projectId:project,status:0}},
    completeTickTickTask:async (token,project,id)=>{
      calls.complete++;assert.equal(token,'personal-secret');
      assert.equal(project,'personal-list');assert.equal(id,'task42');
    },
    ...overrides,
  };
  return {deps,calls};
}
test('personal task completion uses only Rustams own OAuth token',async()=>{
  const {deps,calls}=fakeDeps();
  const result=await completeRustamPersonalTask(base,deps);
  assert.equal(result.completed,true);assert.equal(result.personal,true);
  assert.equal(calls.projects,1);assert.equal(calls.task,1);assert.equal(calls.complete,1);
});
test('Diana is forbidden before any personal project lookup',async()=>{
  const {deps,calls}=fakeDeps();
  await assert.rejects(completeRustamPersonalTask({...base,actor:'Диана'},deps),/owner-forbidden/);
  assert.equal(calls.projects,0);assert.equal(calls.task,0);assert.equal(calls.complete,0);
});
test('the joint TickTick project is denied by personal route',async()=>{
  const {deps,calls}=fakeDeps();
  await assert.rejects(completeRustamPersonalTask({...base,projectId:'joint-list'},deps),/shared-project-forbidden/);
  assert.equal(calls.projects,0);assert.equal(calls.complete,0);
});
test('the project must be on Rustams own TickTick list',async()=>{
  const {deps,calls}=fakeDeps();
  await assert.rejects(completeRustamPersonalTask({...base,projectId:'someone-else'},deps),/project-forbidden/);
  assert.equal(calls.task,0);assert.equal(calls.complete,0);
});
test('the task must belong to the project returned by TickTick',async()=>{
  const {deps,calls}=fakeDeps({fetchTask:async()=>({id:'task42',projectId:'other',status:0})});
  await assert.rejects(completeRustamPersonalTask(base,deps),/task-mismatch/);
  assert.equal(calls.complete,0);
});
test('read only TickTick token cannot complete tasks',async()=>{
  const {deps,calls}=fakeDeps();
  await assert.rejects(completeRustamPersonalTask({...base,token:{accessToken:'personal-secret',scope:'tasks:read'}},deps),/write-permission-required/);
  assert.equal(calls.projects,0);assert.equal(calls.complete,0);
});
test('completion of an already completed task is idempotent',async()=>{
  const {deps,calls}=fakeDeps({fetchTask:async(token,project,id)=>({id,projectId:project,status:2})});
  const result=await completeRustamPersonalTask(base,deps);
  assert.equal(result.completed,true);assert.equal(result.wasOpen,false);assert.equal(calls.complete,0);
});
test('calendar checkbox targets private endpoint while shared completion stays unchanged',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  assert.ok(app.includes('requestPersonalTickTickTaskCompletion(task)'));
  assert.ok(app.includes("?await requestPersonalTickTickTaskCompletion(task)"));
  assert.ok(app.includes('const taskWritable=isPersonalTask?event?.canComplete!==false:payload?.ticktickWritable!==false;'));
  assert.ok(app.includes('completeCalendarTickTickTask(event,row,complete,taskWritable)'));
  assert.ok(api.includes("if (action === 'personal-task-complete')"));
  assert.ok(api.includes("if (actor !== 'Рустам') return res.status(403)"));
  assert.ok(api.includes("canComplete:tokenHasWriteScope(personalToken)!==false"));
  const section=api.slice(api.indexOf("if (action === 'personal-task-complete')"),api.indexOf("if (action === 'task-complete')"));
  for(const forbidden of ['sendTaskCompletedNotificationToPartner','awardScore','readTickTickTokenWithBackup'])assert.ok(!section.includes(forbidden));
  assert.ok(api.includes("if (action === 'task-complete')"));
});

test('month and week calendar include iOS-inspired layout and green shared days off',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/calendar.css','utf8');
  assert.ok(app.includes('function calendarIsoWeekNumber(date)'));
  assert.ok(app.includes('appendCalendarMonthWeekNumber(container,first,today)'));
  assert.ok(app.includes('appendCalendarMonthWeekNumber(container,date,today)'));
  assert.ok(app.includes("date.getUTCDay()===1"));
  assert.ok(css.includes('calendar-month-week-number'));
  assert.ok(css.includes('calendar-week-now-line'));
  assert.ok(app.includes("calendarScope==='shared'&&payload?.workReady&&!day.working?' diana-day-off':''"));
  assert.ok(css.includes('body[data-calendar-scope="shared"] .work-page #workCalendarDays .calendar-day-cell.diana-day-off:not(.today):not(.selected) .calendar-date-number'));
  assert.ok(css.includes('background:#ff393e!important'));
  assert.ok(css.includes('html[data-theme="dark"] .work-page #workCalendarDays'));
});
test('week agenda avoids duplicate selected task list and retains checkbox completion',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.ok(app.includes("if(tasks.length&&calendarDisplayMode!=='week')"));
  assert.ok(app.includes('const attachCompletion=(row,task)=>{'));
  assert.ok(app.includes('completeCalendarTickTickTask(task,row,checkbox,writable)'));
  assert.ok(app.includes('attachCompletion(block,event.task)'));
  assert.ok(app.includes('attachCompletion(pill,item.task)'));
});
test('shared plus opens existing task modal using selected calendar date and current time',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.ok(html.includes('id="calendarCreateTask"'));
  assert.ok(app.includes("create.hidden=calendarScope!=='shared'"));
  assert.ok(app.includes("document.getElementById('calendarCreateTask')?.addEventListener"));
  assert.ok(app.includes('const date=currentSelectedWorkDate||calendarDateCursor||todayState().key'));
  assert.ok(app.includes('const time=financeNowDateTimeInputs().time'));
  assert.ok(app.includes('openTickTickTaskForCreation?.({date,time})'));
  assert.ok(app.includes('openTickTickTaskForCreation=options=>open(null,options)'));
});

test('v4.120 selected day never paints a cell-sized square, in either theme',()=>{
  const css=fs.readFileSync('public/calendar.css','utf8');
  const start=css.indexOf('/* v4.120: compact month layout');
  assert.ok(start>=0);
  const release=css.slice(start);
  assert.ok(release.includes('html[data-theme="light"] .work-page #workCalendarDays[data-calendar-mode="month"] .calendar-day-cell.selected'));
  assert.ok(release.includes('html[data-theme="dark"] .work-page #workCalendarDays[data-calendar-mode="week"] .calendar-day-cell.selected'));
  assert.ok(release.includes('border-radius:0!important;background:transparent!important;'));
  assert.ok(release.includes('outline:2px solid #ff3b40!important;'));
  assert.ok(release.includes('outline:2px solid #ff4a50!important;'));
});
test('v4.120 green highlights Diana days off only when shift data is ready',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/calendar.css','utf8');
  assert.ok(app.includes("calendarScope==='shared'&&payload?.workReady&&!day.working?' diana-day-off':''"));
  const start=css.indexOf('/* v4.120: compact month layout');
  const release=css.slice(start);
  assert.ok(release.includes('.calendar-day-cell.diana-day-off:not(.today):not(.selected) .calendar-date-number'));
  assert.ok(release.includes('.calendar-day-cell.working:not(.today) .calendar-date-number'));
  assert.ok(release.includes('color:#39c78c!important'));
});
test('v4.120 calendar is compact and plus button matches Today height',()=>{
  const css=fs.readFileSync('public/calendar.css','utf8');
  const release=css.slice(css.indexOf('/* v4.120: compact month layout'));
  assert.ok(release.includes('grid-auto-rows:max-content!important;align-content:start!important'));
  assert.ok(release.includes('min-height:54px!important;height:54px!important'));
  assert.ok(release.includes('font-size:19px!important'));
  assert.ok(release.includes('.calendar-navigation #calendarToday,'));
  assert.ok(release.includes('.calendar-navigation #calendarCreateTask{'));
  assert.ok(release.includes('height:38px!important;min-height:38px!important;max-height:38px!important'));
});

test('v4.120 holidays appear on month details but not inside week agenda or week day details',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const agenda=app.slice(app.indexOf('function calendarWeekAgenda('),app.indexOf('function renderWorkCalendar('));
  assert.ok(!agenda.includes("put('holiday'"));
  assert.ok(app.includes("if(holidays.length&&calendarDisplayMode==='month')"));
  assert.ok(app.includes("const agenda=calendarWeekAgenda(day.date,tasks,events,holidays,obligations,"));
});
test('v4.120 personal mode keeps shared plus button hidden',()=>{
  const css=fs.readFileSync('public/calendar.css','utf8');
  const release=css.slice(css.indexOf('/* v4.120: compact month layout'));
  assert.ok(release.includes('.calendar-navigation #calendarCreateTask[hidden]'));
  assert.ok(release.includes('display:none!important'));
});

test('v4.120 scope and view toggles are both compact in mobile and desktop themes',()=>{
  const css=fs.readFileSync('public/calendar.css','utf8');
  const release=css.slice(css.indexOf('/* v4.120: compact month layout'));
  assert.ok(release.includes('#calendarScopeTabs.calendar-scope-tabs button,'));
  assert.ok(release.includes('#calendarModeTabs.calendar-mode-tabs button{'));
  assert.ok(release.includes('min-height:38px!important;height:38px!important;'));
  assert.ok(release.includes('font-size:11.5px!important;line-height:1.15!important'));
});

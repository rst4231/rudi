'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const js=fs.readFileSync('public/app.js','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
test('agenda toolbar has two accessible day tabs and one new button',()=>{
  assert.equal((html.match(/id="ticktickAddButton"/g)||[]).length,1);
  assert.match(html,/id="sharedAgendaTabs"[^>]*role="tablist"/);
  assert.match(html,/data-shared-agenda-day="today"/);
  assert.match(html,/data-shared-agenda-day="tomorrow"/);
  assert.match(html,/id="ticktickTodayList"/);
});
test('today endpoint supplies tomorrow with no second client request',()=>{
  assert.match(api,/const tomorrowDate = calendarDateKey/);
  assert.match(api,/const tomorrowTasks = mapAgendaDay/);
  assert.match(api,/date: today, tasks, tomorrowDate, tomorrowTasks/);
  assert.match(js,/managedJsonRequest\('ticktick-today','\/api\/ticktick\/today'/);
  assert.match(js,/if\(sharedAgendaLatestPayload\)renderTickTickTodayState\(sharedAgendaLatestPayload\)/);
});
test('switching tabs does not change Home today task count',()=>{
  assert.match(js,/const todayTasks=Array\.isArray\(payload\?\.tasks\)/);
  assert.match(js,/homeDashboardState\.tasks=todayTasks/);
  assert.match(js,/sharedAgendaSelectedDay==='tomorrow'\?'Завтра дел нет':'Сегодня дел нет'/);
  assert.match(js,/setupSharedAgendaTabs\(\)/);
  assert.match(js,/date:sharedAgendaSelectedDay==='tomorrow'\?/);
});
test('timeline retains completion, edit, delete, undo and inline details',()=>{
  assert.match(js,/row\.append\(timeRail,complete,copy\)/);
  assert.match(js,/completeTickTickTodayTask\(task,row,complete,payload\?\.writable!==false\)/);
  assert.match(js,/openTickTickTaskForEditing\?\.\(task\)/);
  assert.match(js,/deleteTickTickTodayTask\(task,row,remove\)/);
  assert.match(js,/createTickTickInlineDetails\(task,\{writable:payload\?\.writable!==false\}\)/);
  assert.match(js,/showTickTickCompletionUndo\(task,payload\)/);
  assert.match(css,/\.ticktick-agenda-time::after/);
  assert.match(css,/\.ticktick-today-task\[data-owner="diana"\]/);
  assert.match(css,/@media\(max-width:370px\)/);
  assert.doesNotMatch(css,/#ticktickPanel\.is-list-visible #ticktickToggle\{display:none\}/);
});

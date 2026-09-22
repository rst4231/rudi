const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8')+'\n'+fs.readFileSync('public/calendar.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('cycle card is scoped to Calendar tab',()=>{
  const start=app.indexOf('function renderDianaCycle');
  const end=app.indexOf('async function cycleRequest',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(block,/card\.hidden=false/);
  assert.match(css,/body:not\(\[data-app-tab="schedule"\]\) #dianaCycleCard\{[\s\S]*?display:none!important/);
});

test('Calendar tab always refreshes the combined calendar',()=>{
  assert.match(app,/if\(next===currentAppTab\)[\s\S]*?if\(next==='schedule'\) loadWorkCalendar\(currentWorkCalendarView,\{silent:true\}\)/);
  assert.match(app,/if\(next==='schedule'\)\{[\s\S]*?playCalendarConfetti\(\);[\s\S]*?loadWorkCalendar\(currentWorkCalendarView,\{silent:true\}\)/);
});

test('TickTick deals render as separate structured rows',()=>{
  assert.match(app,/row\.className='calendar-selected-row calendar-task-row'/);
  assert.match(app,/complete\.className='calendar-task-complete'/);
  assert.match(app,/time\.className='calendar-task-time'/);
  assert.match(app,/text\.className='calendar-task-title'/);
  assert.match(css,/\.calendar-selected-tasks \.calendar-task-row\{[\s\S]*?display:grid!important/);
});

test('Calendar block spacing is deliberately separated and assets are fresh',()=>{
  assert.match(css,/body\[data-app-tab="schedule"\] \.work-page\{[\s\S]*?gap:26px!important/);
  assert.match(css,/\.schedule-year-progress\{[\s\S]*?margin:2px 8px 10px!important/);
  assert.match(html,/app\.css\?v=1\.7\.2/);
  assert.match(html,/app\.js\?v=1\.7\.2/);
});


test('calendar day selection survives silent rerenders and iPhone taps stay clickable',()=>{
  assert.match(app,/let currentSelectedWorkDate = ''/);
  assert.match(app,/currentSelectedWorkDate=String\(day\.date\|\|''\)/);
  assert.match(app,/const preferredDate=currentSelectedWorkDate\|\|today/);
  assert.match(css,/\.work-page \.calendar-day-cell\{[\s\S]*?pointer-events:auto!important;[\s\S]*?touch-action:manipulation!important/);
  assert.match(css,/\.work-page \.calendar-day-cell > \*\{[\s\S]*?pointer-events:none!important/);
});

test('schedule sections have visible spacing instead of touching each other',()=>{
  assert.match(css,/body\[data-app-tab="schedule"\] \.work-page\{[\s\S]*?gap:26px!important/);
  assert.match(css,/\.schedule-year-progress\{[\s\S]*?margin:2px 8px 10px!important/);
  assert.match(css,/body\[data-app-tab="schedule"\] \.footer\{[\s\S]*?margin-top:22px!important/);
});


test('managed request layer deduplicates hot calendar and TickTick reads',()=>{
  assert.match(app,/const managedRequestState = new Map\(\)/);
  assert.match(app,/managedJsonRequest\('ticktick-today'/);
  assert.match(app,/fetchCalendarJson\('work-calendar:'\+requested/);
  assert.match(app,/fetchCalendarJson\('ticktick-calendar:'\+requested/);
  assert.match(app,/fetchCalendarJson\('holiday-calendar:'\+requested/);
  assert.match(app,/if\(previous\?\.fingerprint===fingerprint&&previous\?\.promise\) return previous\.promise/);
});

test('calendar tasks complete through TickTick and refresh both surfaces',()=>{
  assert.match(app,/completeCalendarTickTickTask\(event,row,complete,payload\?\.ticktickWritable!==false\)/);
  assert.match(app,/requestTickTickTaskCompletion\(task\.id\)/);
  assert.match(app,/refreshAfterTickTickTaskChange/);
  assert.match(app,/currentWorkCalendarRenderSignature/);
});

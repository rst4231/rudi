const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/calendar.css','utf8');
test('calendar has only week/month, neither day nor list',()=>{
 for(const mode of ['week','month'])assert.ok(html.includes('data-calendar-mode="'+mode+'"'));
 for(const mode of ['day','list'])assert.ok(!html.includes('data-calendar-mode="'+mode+'"'));
 assert.doesNotMatch(app,/calendarDisplayMode==='list'/);
 assert.match(css,/calendar-mode-tabs\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('week strip shows separate labels and day numbers on iPhone',()=>{
 for(const mode of ['week']){
  assert.match(css,new RegExp('data-calendar-mode="'+mode+'"\\] \\.calendar-week-label'));
  assert.match(css,new RegExp('data-calendar-mode="'+mode+'"\\] \\.calendar-date-number'));
 }
 assert.match(css,/display:flex!important;flex-direction:column!important/);
 assert.match(css,/position:static!important;inset:auto!important/);
});
test('obligation checkbox and title are placed in non-overlapping grid columns',()=>{
 assert.match(css,/\.calendar-selected-obligations \.calendar-obligation-row\{[\s\S]*?grid-template-columns:44px minmax\(0,1fr\)!important/);
 assert.match(css,/\.calendar-selected-obligations \.calendar-obligation-complete\{[\s\S]*?width:44px!important;height:44px!important/);
 assert.match(css,/\.calendar-selected-obligations \.calendar-obligation-copy\{[\s\S]*?min-width:0!important/);
});
test('shared calendar renders actual Diana menstrual dates as red dots without sharing entire cycle panel',()=>{
 assert.match(app,/const showMarks=calendarScope==='shared'\|\|\(calendarScope==='personal'&&currentActor==='Диана'\)/);
 assert.match(app,/if\(calendarScope==='shared'\)loadSharedPeriodMarks\(\)/);
 assert.match(app,/const data=await cycleRequest\('get'\)/);
 assert.match(css,/body:not\(\[data-calendar-scope="personal"\]\) #dianaCycleCard/);
 assert.match(css,/\.calendar-period-dot\{/);
});

test('week agenda renders hourly timeline with optional timed and all-day events',()=>{
 assert.match(app,/function calendarWeekAgenda\(dateKey,tasks,workEvents,holidays,obligations\)/);
 assert.match(app,/for\(let hour=0;hour<24;hour\+\+\)/);
 assert.match(app,/CALENDAR_AGENDA_HOUR_HEIGHT=72/);
 assert.match(app,/calendarWeekAgenda\(day.date,tasks,events,holidays,obligations\)/);
 assert.match(css,/calendar-week-time-viewport/);
 assert.match(css,/calendar-week-now-line/);
});

test('settings gear and home shared shortcut are accessible',()=>{
 assert.match(html,/id="calendarConnectionsGear"/);
 assert.match(html,/id="calendarPersonalTickTickConnect"/);
 assert.match(html,/id="calendarSharedTickTickConnect"/);
 assert.match(html,/id="priorityCalendarOpen"/);
 assert.match(app,/pendingCalendarScope='shared'/);
 assert.match(app,/const selectedScope=pendingCalendarScope==='shared'/);
});
test('week and month use personal blue and shared green colors',()=>{
 assert.match(css,/body\[data-calendar-scope="personal"\] \.work-page \.calendar-mode-tabs button.active\{background:#4578e6!important/);
 assert.match(css,/body\[data-calendar-scope="shared"\] \.work-page \.calendar-mode-tabs button.active\{background:#23966a!important/);
});
test('calendar task and payment badges are rendered as 5px dots with no count',()=>{
 assert.match(app,/taskCount.textContent=''/);
 assert.match(app,/obligationCount.textContent=''/);
 assert.match(css,/\.calendar-task-count\{[\s\S]*?min-width:5px!important/);
 assert.match(css,/\.calendar-obligation-count\{[\s\S]*?min-width:5px!important/);
});
test('personal TickTick remains exclusive to Rustam and writable only through owner API',()=>{
 const backend=fs.readFileSync('api/partner-message.js','utf8');
 const store=fs.readFileSync('api/ticktick-store.cjs','utf8');
 assert.match(backend,/if\(actor!=='Рустам'\)return res.status\(403\)/);
 assert.match(backend,/selectedScope==='rustam' && actor==='Рустам'/);
 assert.match(app,/event\?\.personal===true/);
 assert.match(backend,/canComplete:tokenHasWriteScope\(personalToken\)!==false/);
 assert.match(store,/if \(actor !== 'Рустам'\) return null/);
});

test('shared view shows assigned and unassigned TickTick tasks from joint project',()=>{
  const backend=fs.readFileSync('api/partner-message.js','utf8');
  assert.match(backend,/selectedScope && selectedScope !== 'shared'/);
  assert.match(backend,/actor !== 'Рустам'/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/calendar.css','utf8');
const backend=fs.readFileSync('api/partner-message.js','utf8');
const tick=require('../api/ticktick-client.cjs');
const holiday=require('../api/holiday-calendar.cjs');
test('personal/shared tabs, navigation and iPhone affordances',()=>{
 // RUDI switches scope and mode dynamically via one button per selector.
 assert.match(html,/id="calendarScopeSwitch"/);
 assert.match(html,/id="calendarModeSwitch"/);
 assert.match(src,/document\.body\.dataset\.calendarScope=calendarScope/);
 assert.match(src,/calendarDisplayMode=\['week','month'\]/);
 for(const id of ['calendarPrev','calendarNext','calendarToday'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(src,/calendarSetScope\('personal',\{reload:false\}\)/);
 assert.match(src,/touchstart/);assert.match(src,/touchend/);
 assert.match(css,/min-height:44px!important/);
});
test('cycle only shown for Diana personal view and loading not tied to home bootstrap',()=>{
 assert.match(src,/if\(calendarScope==='personal'&&currentActor==='Диана'\)loadDianaCycle\(/);
 assert.match(src,/if\(!card\|\|currentActor!=='Диана'\|\|calendarScope!=='personal'\) return/);
 assert.match(css,/body:not\(\[data-calendar-scope="personal"\]\) #dianaCycleCard/);
 assert.match(src,/cycleOpen.hidden=currentActor!=='Диана'/);
});
test('owner-only personal task access and full joint project in shared',()=>{
 assert.match(backend,/calendar-owner-forbidden/);
 assert.match(backend,/event.ownerScope = assignee.responsibility.known/);
 assert.match(backend,/selectedScope && selectedScope !== 'shared'/);
 assert.match(src,/calendarScope==='shared'\?'shared':currentActor==='Диана'\?'diana':'rustam'/);
 assert.match(src,/scope==='shared'\?fetchCalendarJson\('holiday-calendar:/);
 assert.match(src,/const needsWork=scope==='diana'\|\|scope==='shared'/);
});
test('calendar accepts arbitrary month for each data source',()=>{
 const now=new Date('2026-10-09T09:00:00Z');
 const range=tick.tickTickMonthRange(now,'month',undefined,'2027-02');
 assert.equal(range.startKey,'2027-02-01');assert.equal(range.dayCount,28);
 assert.equal(holiday.monthRange(now,'month','2028-02').dayCount,29);
});

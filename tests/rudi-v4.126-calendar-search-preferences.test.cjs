'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),api=fs.readFileSync('api/partner-message.js','utf8');
test('calendar restores view by actor',()=>{
 assert.match(app,/function calendarViewStorageKey\(\)/);
 assert.match(app,/const saved=calendarReadSavedView\(\)/);
 assert.match(app,/calendarDateCursor=saved.date\|\|todayState\(\).key/);
 assert.match(app,/setWorkCalendarRangeActive\(saved.mode\|\|'month'\)/);
 assert.match(app,/calendarSetScope\(saved.scope\|\|'personal'/);
});
test('calendar search removed and four controls share title row',()=>{
 const head=html.slice(html.indexOf('class="rudi-app-page-head work-page-head"'),html.indexOf('</header>',html.indexOf('class="rudi-app-page-head work-page-head"')));
 assert.equal((head.match(/class="calendar-header-control/g)||[]).length,3);
 assert.match(head,/id="calendarConnectionsGear"/);
 assert.doesNotMatch(html,/id="calendarSearchButton"|id="calendarSearchPanel"|id="calendarSearchInput"/);
 assert.match(app,/function calendarSetScope\(/);
 assert.match(api,/tickTickTaskDateKeys\(task\)/);
});
test('Together tasks in personal, without other personal lists',()=>{
 assert.match(api,/event.together=assignee.responsibility.common===true/);
 assert.match(api,/event.ownerScope === 'shared' && event.together === true/);
 assert.match(api,/selectedScope!=='shared'&&ownerScope!==selectedScope&&!assignment.responsibility.common/);
 assert.match(api,/selectedScope==='rustam'&&actor==='Рустам'/);
});

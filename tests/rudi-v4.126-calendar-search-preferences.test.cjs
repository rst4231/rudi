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
test('search button positioned between mode and settings',()=>{
 const a=html.indexOf('id="calendarModeSwitch"'),b=html.indexOf('id="calendarSearchButton"'),c=html.indexOf('id="calendarConnectionsGear"');
 assert.ok(a>=0&&a<b&&b<c);
 assert.match(app,/function calendarOpenSearchResult\(task\)/);
 assert.match(api,/tickTickTaskDateKeys\(task\)/);
});
test('Together tasks in personal, without other personal lists',()=>{
 assert.match(api,/event.together=assignee.responsibility.common===true/);
 assert.match(api,/event.ownerScope === 'shared' && event.together === true/);
 assert.match(api,/selectedScope!=='shared'&&ownerScope!==selectedScope&&!assignment.responsibility.common/);
 assert.match(api,/selectedScope==='rustam'&&actor==='Рустам'/);
});

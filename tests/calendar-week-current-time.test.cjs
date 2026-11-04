'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const app=fs.readFileSync('public/app.js','utf8'),start=app.indexOf('      function calendarWeekAgenda('),end=app.indexOf('\n      function ',start+1),source=app.slice(start,end);
function render(date,minutes){
 const dom=new JSDOM('<body></body>'),frames=[];
 const agenda=new Function('document','requestAnimationFrame','calendarWorkplaceControl','calendarScope','currentActor','todayState','homeCurrentMinutes','CALENDAR_AGENDA_HOUR_HEIGHT',source+';return calendarWeekAgenda;')(dom.window.document,fn=>frames.push(fn),()=>null,'personal','Рустам',()=>({key:'2026-11-04'}),()=>minutes,64)(date,[],[],[],[]);
 dom.window.document.body.appendChild(agenda);for(const fn of frames)fn();return{dom,agenda,viewport:agenda.querySelector('.calendar-week-time-viewport')};
}
test('opening today scrolls to the red current-time line even late in the evening',()=>{
 for(const minutes of [10,13*60+45,22*60+47]){
  const f=render('2026-11-04',minutes);try{const line=f.agenda.querySelector('.calendar-week-now-line');assert.ok(line);const top=parseFloat(line.style.top);assert.ok(top-f.viewport.scrollTop>=0);assert.ok(top-f.viewport.scrollTop<=64,'red line should be within the first visible hour')}finally{f.dom.window.close()}
 }
});
test('opening a different date keeps its normal start and has no current-time line',()=>{
 const f=render('2026-11-05',22*60+47);try{assert.equal(f.agenda.querySelector('.calendar-week-now-line'),null);assert.equal(f.viewport.scrollTop,320)}finally{f.dom.window.close()}
});

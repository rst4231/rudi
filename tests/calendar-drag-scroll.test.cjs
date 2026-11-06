const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('public/app.js','utf8');
test('same-day redraw restores timeline and page scroll synchronously before painting',()=>{
 const start=source.indexOf('      function renderWorkCalendar('),end=source.indexOf('      function renderWorkCalendarContent(',start);assert.ok(end>start,'redraw wrapper must preserve scroll at render boundary');
 const dom=new JSDOM('<body data-app-tab="schedule"><div id="workCalendarSelected"><div class="calendar-week-agenda" data-calendar-date="2026-11-06" data-calendar-scope="personal" data-calendar-actor="Рустам"><div class="calendar-week-time-viewport"></div></div></div>'),d=dom.window.document,selected=d.getElementById('workCalendarSelected');let scroll=[0,180],received;
 selected.querySelector('.calendar-week-time-viewport').scrollTop=700;selected.getBoundingClientRect=()=>({height:500});
 const window={get scrollX(){return scroll[0]},get scrollY(){return scroll[1]},scrollTo(x,y){scroll=[x,y]}};
 const redraw=(payload,options)=>{received=options.timelineScroll;assert.equal(selected.style.minHeight,'500px');selected.innerHTML='<div class="calendar-week-agenda" data-calendar-date="2026-11-06"><div class="calendar-week-time-viewport"></div></div>';scroll=[0,0];return true};
 const render=new Function('document','window','calendarDisplayMode','calendarScope','currentActor','currentSelectedWorkDate','calendarDateCursor','todayState','renderWorkCalendarContent',source.slice(start,end)+';return renderWorkCalendar')(d,window,'week','personal','Рустам','2026-11-06','2026-11-06',()=>({key:'2026-11-06'}),redraw);
 try{assert.equal(render({}),true);assert.equal(received,700);assert.equal(selected.querySelector('.calendar-week-time-viewport').scrollTop,700);assert.deepEqual(scroll,[0,180]);assert.equal(selected.style.minHeight,'');}finally{dom.window.close()}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('weekly schedule ends at the timeline and month and other tabs retain their summaries',()=>{
 const dom=new JSDOM('<html><head></head><body data-app-tab="schedule"><main class="shell"><section class="work-page"><div id="workCalendarCard"><div class="calendar-week-agenda">Часы</div><div class="calendar-selected-details">Привычки</div><div id="calendarPersonalDayRecap">Итоги</div></div><article class="schedule-nearest">Ближайшее</article><div class="schedule-year-progress">Год</div></section><footer class="footer">2026</footer></main></body></html>'),w=dom.window,d=w.document;
 try{const style=d.createElement('style');style.textContent=fs.readFileSync('public/calendar.css','utf8');d.head.append(style);
 const extra=[...d.querySelectorAll('.calendar-selected-details,#calendarPersonalDayRecap,.schedule-nearest,.schedule-year-progress,.footer')];
 d.documentElement.classList.add('rudi-calendar-week-no-pull');for(const el of extra)assert.equal(w.getComputedStyle(el).display,'none',el.className||el.id);assert.notEqual(w.getComputedStyle(d.querySelector('.calendar-week-agenda')).display,'none');
 d.documentElement.classList.remove('rudi-calendar-week-no-pull');for(const el of extra)assert.notEqual(w.getComputedStyle(el).display,'none');
 d.documentElement.classList.add('rudi-calendar-week-no-pull');d.body.dataset.appTab='home';for(const el of extra)assert.notEqual(w.getComputedStyle(el).display,'none');
 }finally{w.close()}
});

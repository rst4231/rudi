const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
const css=fs.readFileSync(require.resolve('../public/app.css'),'utf8');

test('calendar is unified around Diana schedule, TickTick tasks and holidays',()=>{
  assert.match(html,/work-calendar-title">График<\/div>/);
  assert.doesNotMatch(html,/id="holidayButton"/);
  assert.doesNotMatch(html,/id="holidayModal"/);
  assert.match(app,/ticktickDays/);
  assert.match(app,/holidayDays/);
  assert.match(app,/Сегодня у Дианы /);
  assert.match(app,/calendar-selected-holidays/);
  assert.match(app,/calendar-selected-tasks/);
});

test('calendar entry confetti is scoped to calendar surface',()=>{
  assert.match(html,/id="calendarConfetti"/);
  assert.match(app,/function playCalendarConfetti\(\)/);
  assert.match(app,/if\(next==='schedule'\)\{[\s\S]*?playCalendarConfetti\(\)/);
  assert.match(css,/\.calendar-confetti\{/);
  assert.match(css,/@keyframes calendarConfettiFall/);
});

test('year progress lives only under nearest calendar block',()=>{
  assert.equal((html.match(/id="yearProgressPercent"/g)||[]).length,1);
  const nearestIndex=html.indexOf('class="panel nearest-panel schedule-nearest"');
  const progressIndex=html.indexOf('class="year-progress schedule-year-progress"');
  const footerIndex=html.indexOf('<footer class="footer">');
  assert.ok(nearestIndex>=0&&progressIndex>nearestIndex&&footerIndex>progressIndex);
});

test('Telegram chat link is absent from footer',()=>{
  assert.doesNotMatch(html,/home-telegram-chat/);
  assert.doesNotMatch(html,/https:\/\/t\.me\/\+fiPsnWoBJ-c0ZmU1/);
});

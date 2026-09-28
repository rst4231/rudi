const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('calendar confetti is mounted inside holidays instead of globally',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','calendar.css'),'utf8');
  assert.doesNotMatch(html,/id="calendarConfetti"/);
  assert.match(app,/group\.className='calendar-selected-group calendar-selected-holidays'/);
  assert.match(app,/confetti\.id='calendarConfetti'/);
  assert.match(app,/confetti\.className='calendar-confetti calendar-holiday-confetti'/);
  assert.match(css,/\.work-page \.calendar-selected-holidays \.calendar-confetti\{/);
  assert.match(css,/overflow:hidden!important/);
});

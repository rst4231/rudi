const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8')+'\n'+fs.readFileSync('public/calendar.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('calendar selected details span the full mobile card width',()=>{
  assert.match(app,/const details=document\.createElement\('div'\)/);
  assert.match(app,/details\.className='calendar-selected-details'/);
  assert.match(app,/if\(details\.childElementCount\) selected\.appendChild\(details\)/);
  assert.match(css,/\.calendar-selected-details\{[\s\S]*?grid-column:1 \/ -1/);
});

test('mobile calendar numbers are geometrically centered and stable',()=>{
  assert.match(css,/single calendar stylesheet/);
  assert.match(css,/\.work-page \.calendar-day-cell \.calendar-date-number\{[\s\S]*?position:absolute!important;[\s\S]*?inset:0!important;[\s\S]*?place-items:center!important;/);
  assert.match(css,/font-variant-numeric:tabular-nums!important/);
  assert.match(css,/\.calendar-task-count\{[\s\S]*?top:3px!important;[\s\S]*?right:3px!important;/);
  assert.match(css,/\.calendar-holiday-mark\{[\s\S]*?top:3px!important;[\s\S]*?left:4px!important;/);
});

test('iPhone Telegram safe area has a user-agent fallback and fresh asset keys',()=>{
  assert.match(app,/iPhone\|iPad\|iPod/);
  assert.match(app,/tg\?\.platform==='ios'\|\|iosUserAgent/);
  assert.match(html,/app\.css\?v=1\.6/);
  assert.match(html,/app\.js\?v=1\.6/);
});

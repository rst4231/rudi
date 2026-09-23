const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');
const partnerSource=fs.readFileSync('api/partner-message.js','utf8');

test('calendar keeps Diana work schedule and removes retired shared calendar',()=>{
  assert.match(html,/work-calendar-title">График<\/div>/);
  assert.doesNotMatch(html,/id="sharedCalendarCard"/);
});

test('work calendar persists collapse state',()=>assert.match(html,/key:'calendar-work'/));

test('Diana work status uses the calendar and shows working or resting state',()=>{
  assert.match(html,/function renderPartnerWorkStatus\(days\)/);
  assert.match(html,/function dianaWorkStatusText\(row\)/);
  assert.match(html,/Работаю/);
  assert.match(html,/Отдыхаю/);
  assert.match(html,/const activeShift=dianaActiveShiftLabel\(row\)/);
  assert.match(html,/return 'Работаю'\+\(activeShift\?' · '\+activeShift:''\)/);
  assert.match(html,/renderPartnerWorkStatus\(days\)/);
});

test('Diana work status stays tied to current month when browsing next month',()=>{
  assert.match(html,/if\(view==='month'\) renderPartnerWorkStatus\(days\)/);
  assert.match(html,/if\(requested==='next-month'\) refreshPartnerWorkStatus\(\)/);
});

test('home dashboard omits today and quick-action blocks',()=>{
  assert.doesNotMatch(html,/todayBlock\.className='home-dashboard-section home-today'/);
  assert.doesNotMatch(html,/quick\.className='home-quick-actions'/);
  assert.match(html,/profile\.replaceChildren\(top,messageNew\)/);
  assert.match(html,/profile\.after\(selfCard\.tile,partnerCard\.tile,luluTile,nearest\)/);
});

test('home mood labels are hidden and moods sit inside person cards',()=>{
  assert.match(html,/mood-person-label" aria-hidden="true"><\/span>/);
  assert.match(html,/\.profile-person-card \.mood-person\{[\s\S]*justify-content:flex-end!important/);
});

test('partner message save does not wait for Telegram notification',()=>{
  assert.match(partnerSource,/waitUntil\(notificationTask\)/);
  assert.match(partnerSource,/pending: true/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');

test('calendar keeps Diana work schedule and removes retired shared calendar',()=>{
  assert.match(html,/work-calendar-title">График<\/div>/);
  assert.doesNotMatch(html,/id="sharedCalendarCard"/);
});

test('work calendar persists collapse state',()=>assert.match(html,/key:'calendar-work'/));

test('Diana work status uses calendar hours and resting label',()=>{
  assert.match(html,/function renderPartnerWorkStatus\(days\)/);
  assert.match(html,/function dianaWorkStatusText\(row\)/);
  assert.match(html,/Работаю/);
  assert.match(html,/Отдыхаю/);
  assert.match(html,/return 'Работаю с '\+start\+' до '\+end/);
  assert.match(html,/renderPartnerWorkStatus\(days\)/);
});

test('Diana work status stays tied to current month when browsing next month',()=>{
  assert.match(html,/if\(view==='month'\) renderPartnerWorkStatus\(days\)/);
  assert.match(html,/if\(requested==='next-month'\) refreshPartnerWorkStatus\(\)/);
});

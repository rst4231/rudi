const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v2.104 hero dark theme and overlap fixes are wired',()=>{
  const css=fs.readFileSync('public/home-hero-v2104.css','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(css,/\.home-dashboard-summary\{[\s\S]*border:0!important;[\s\S]*box-shadow:none!important/);
  assert.match(css,/html\[data-theme="dark"\] \.home-dashboard-summary\[data-daypart="morning"\]::before/);
  assert.match(css,/html\[data-theme="dark"\] \.home-dashboard-summary\[data-daypart="day"\]::before/);
  assert.match(css,/html\[data-theme="dark"\] \.home-dashboard-summary\[data-daypart="evening"\]::before/);
  assert.match(css,/html\[data-theme="dark"\] \.home-dashboard-summary\[data-daypart="night"\]::before/);
  assert.match(css,/activity-notifications-open \.home-message-new\{[\s\S]*visibility:hidden!important/);
  assert.match(html,/home-hero-v2104\.css\?v=2\.104/);
  assert.match(html,/rudi-version" content="v2\.104"/);
});

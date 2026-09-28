const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v2.107 dark fasting card and settings overlay regressions are covered',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/html\[data-theme="dark"\] \.fasting-start-card::before\{[\s\S]*rgba\(20,28,42,.96\)/);
  assert.match(css,/\.home-dashboard-summary\.settings-open \.home-message-new\{[\s\S]*opacity:0!important;[\s\S]*visibility:hidden!important;[\s\S]*pointer-events:none!important/);
});

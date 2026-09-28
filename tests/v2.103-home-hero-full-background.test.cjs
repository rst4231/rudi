const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v2.103 home hero fills the full summary card',()=>{
  const css=fs.readFileSync('public/home-hero-v2103.css','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(css,/\.home-dashboard-summary\[data-daypart="day"\]\{[\s\S]*home-scene-day\.svg\?v=2\.103/);
  assert.match(css,/\.home-dashboard-summary \.home-dashboard-head\{[\s\S]*background-image:none!important/);
  assert.match(css,/\.home-dashboard-summary::before\{/);
  assert.match(html,/home-hero-v2103\.css\?v=2\.103/);
  assert.match(html,/rudi-version" content="v2\.103"/);
});

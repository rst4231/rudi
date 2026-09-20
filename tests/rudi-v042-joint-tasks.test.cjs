const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/app.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('Joint Tasks section is compact again',()=>{
  assert.match(css,/body\[data-app-tab="home"\] \.priority-section\{[\s\S]*?padding:0!important;[\s\S]*?border:0!important;[\s\S]*?background:transparent!important;/);
  assert.match(css,/\.priority-section \.ticktick-panel\{[\s\S]*?min-height:0!important;[\s\S]*?padding:13px 14px!important;/);
  assert.match(css,/\.priority-section \.priority-grid\{[\s\S]*?display:block!important;/);
});

test('Joint Tasks behavior remains present',()=>{
  assert.match(html,/id="ticktickToggle"/);
  assert.match(html,/id="ticktickDetails"/);
});

test('footer exposes v0.4.2',()=>{
  assert.match(html,/id="appVersion"[^>]*>v0\.4\.2<\/div>/);
});

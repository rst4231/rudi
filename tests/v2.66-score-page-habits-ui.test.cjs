const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('v2.66 score page fully isolates home chrome and uses full-screen app background',()=>{
  const css=read('public/app.css');
  const block=css.slice(css.indexOf('RUDI v2.66 — isolate score route'));
  assert.match(block,/body\[data-app-tab="score"\] \.footer/);
  assert.match(block,/\.score-page\{[\s\S]*position:fixed!important/);
  assert.match(block,/inset:0!important/);
  assert.match(block,/var\(--bg\)!important/);
  assert.match(block,/env\(safe-area-inset-top\)/);
});

test('v2.66 habit buttons are bright when available and muted when selected',()=>{
  const css=read('public/profile-supplements.css');
  const block=css.slice(css.indexOf('RUDI v2.66 — habit action buttons'));
  assert.match(block,/is-done:not\(\.is-active\):not\(:disabled\)[\s\S]*#38bd70/);
  assert.match(block,/is-done\.is-active[\s\S]*opacity:\.72!important/);
  assert.match(block,/is-notdone:not\(\.is-active\):not\(:disabled\)[\s\S]*#d84a55/);
  assert.match(block,/is-notdone\.is-active[\s\S]*opacity:\.72!important/);
});

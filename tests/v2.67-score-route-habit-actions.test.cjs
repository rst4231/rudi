const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('v2.67 score route is hosted outside shell and is self-contained',()=>{
  const js=read('public/app.js');
  const css=read('public/app.css');
  const block=css.slice(css.indexOf('RUDI v2.67 — standalone score route'));
  assert.match(js,/document\.body\.appendChild\(modal\)/);
  assert.doesNotMatch(js,/document\.querySelector\('\.shell'\)\|\|document\.body\)\.appendChild\(modal\)/);
  assert.match(block,/\.score-page\{[\s\S]*position:fixed!important/);
  assert.match(block,/inset:0!important/);
  assert.match(block,/overflow-y:auto!important/);
  assert.match(block,/env\(safe-area-inset-top\)/);
  assert.doesNotMatch(block,/body\[data-app-tab="score"\]/);
});

test('v2.67 habit action colors emphasize available action',()=>{
  const css=read('public/profile-supplements.css');
  const block=css.slice(css.indexOf('RUDI v2.67 — habit action state emphasis'));
  assert.match(block,/is-done:not\(\.is-active\):not\(:disabled\)[\s\S]*#38bd70/);
  assert.match(block,/is-done\.is-active[\s\S]*opacity:\.72!important/);
  assert.match(block,/is-notdone:not\(\.is-active\):not\(:disabled\)[\s\S]*#d84a55/);
  assert.match(block,/is-notdone\.is-active[\s\S]*opacity:\.72!important/);
});

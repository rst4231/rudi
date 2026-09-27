const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('v2.57 home density overrides are present',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  const profile=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.css'),'utf8');
  assert.match(css,/RUDI v2\.57 — tighter home hierarchy and spacing/);
  assert.match(css,/body\[data-app-tab="home"\] \.shell\{gap:14px\}/);
  assert.match(css,/\.quick-access-button\{[\s\S]*min-height:54px!important/);
  assert.match(css,/\.daily-question-card\.is-waiting/);
  assert.match(profile,/RUDI v2\.57 — compact home tracker cards/);
  assert.match(profile,/\.personal-supplements-tile\.is-collapsed\{min-height:78px\}/);
});

test('daily question switches to waiting compact mode after own answer',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(js,/classList\.toggle\('is-waiting',mineAnswered&&!revealed\)/);
});

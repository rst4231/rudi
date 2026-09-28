const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const api=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','pwa-extras.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');

test('v2.74 preserves fasting reward history immediately after start',()=>{
  assert.match(api,/if \(operation === 'start'\)[\s\S]*readScoreState\(options\)\.catch\(\(\) => null\)[\s\S]*fastingViewWithRewards\(state, actor, scoreState\)/);
});

test('v2.74 Dates page has scoped romantic light and dark themes',()=>{
  assert.match(css,/RUDI v2\.74 — romantic Dates page/);
  assert.match(css,/body\[data-app-tab="dates"\] \.dates-generator/);
  assert.match(css,/body\[data-app-tab="dates"\] \.date-time-choices button\[data-date-period="evening"\]/);
  assert.match(css,/body\[data-app-tab="dates"\] \.date-idea-card/);
  assert.match(css,/body\[data-app-tab="dates"\] \.dates-saved-category/);
  assert.match(css,/html\[data-theme="dark"\] body\[data-app-tab="dates"\]/);
});

test('v2.74 cache-busts romantic Dates styles',()=>{
  assert.match(html,/content="v2\.74"/);
  assert.match(html,/\/pwa-extras\.css\?v=2\.74/);
});

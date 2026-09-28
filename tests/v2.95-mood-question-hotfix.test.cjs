const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.95 mood picker is independently bound and uses partner frame',()=>{
  const html=read('public/index.html');
  const app=read('public/app.js');
  const css=read('public/app.css');
  assert.match(html,/id="moodCurrentButton" class="mood-current-button partner-mood-value"/);
  assert.match(app,/function bindMoodPickerControls\(\)/);
  assert.match(app,/DOMContentLoaded',bindMoodPickerControls/);
  assert.match(app,/showMoodMessage\(mood\);[\s\S]*moodRequest\('set',mood\)/);
  assert.match(css,/\.profile \.mood-choices\.is-open\{display:flex!important\}/);
});

test('v2.95 daily question answer awards no stars',()=>{
  const api=read('api/partner-message.js');
  const section=api.slice(api.indexOf("if (action === 'daily-question')"),api.indexOf("if (action === 'partner-message-like')"));
  assert.doesNotMatch(section,/awardScoreSafe\(/);
  assert.match(section,/reward:\{stars:0,awarded:false\}/);
});

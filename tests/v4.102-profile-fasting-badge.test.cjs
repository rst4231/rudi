const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');


test('fasting time appears under the profile tracker, never above the own name',()=>{
  assert.doesNotMatch(html,/id="selfFastingStatus"/);
  assert.match(html,/id="fastingProfileButton"[\s\S]*id="fastingProfileElapsed"[\s\S]*<\/button>/);
  assert.match(css,/#fastingProfileButton \.fasting-profile-elapsed\{/);
  assert.match(css,/#fastingProfileButton\{overflow:visible!important\}/);
  assert.match(css,/#fastingProfileButton \.fasting-profile-elapsed\[hidden\]\{display:none!important\}/);
});

test('fasting time shows whole hours and hides when inactive without losing progress and navigation',()=>{
  assert.match(app,/const hours=activeNow\?Math\.floor\(Math\.max\(0,Date\.now\(\)-startMs\)\/3600000\):0/);
  assert.match(app,/elapsedNode\.textContent=activeNow\?hours\+' ч':''/);
  assert.match(app,/elapsedNode\.hidden=!activeNow/);
  assert.match(app,/const running=activeNow&&Number\.isFinite\(goalHours\)&&goalHours>0/);
  assert.match(app,/svg\.querySelector\('\.rudi-fasting-progress-value'\)/);
  assert.match(app,/profileButton\?\.addEventListener\('click',navigateOwnFasting\)/);
  assert.match(app,/fastingHomeTicker=setInterval\(\(\)=>renderFastingHomeStatus\(fastingOverviewState\),60\*1000\)/);
  assert.doesNotMatch(app,/getElementById\('selfFastingStatus'\)/);
  assert.match(app,/getElementById\('partnerFastingStatus'\)/);
});

test('profile mood emoji are equally slightly smaller for Rustam and Diana',()=>{
  const last=css.slice(css.lastIndexOf('RUDI v4.102 — slightly smaller mood emoji'));
  assert.match(last,/#moodCurrentButton\.avatar-mood-badge \.mood-emoji/);
  assert.match(last,/#partnerMoodValue\.avatar-mood-badge \.partner-mood-icon \.mood-emoji/);
  assert.match(last,/font-size:20px!important/);
  assert.doesNotMatch(last,/(?:width|height):\s*20px/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const design=fs.readFileSync('public/rudi-design-system.css','utf8');

test('partner fasting tracker sits before Telegram and phone and replaces heading text',()=>{
  assert.doesNotMatch(html,/id="partnerFastingStatus"/);
  const part=app.slice(app.indexOf("if(actor!==currentActor){"),app.indexOf("tile.appendChild(head);",app.indexOf("if(actor!==currentActor){")));
  assert.match(part,/partnerFastingButton\.hidden=true/);
  assert.match(part,/actions\.append\(partnerFastingButton,makeProfileContactButton\('telegram',actor\),makeProfileContactButton\('phone',actor\)\)/);
  assert.match(part,/id="partnerFastingElapsed"/);
});
test('partner icon and timer reuse existing progress and hide when not fasting',()=>{
  assert.match(app,/function renderFastingProfileOutline\(active,partner=false\)/);
  assert.match(app,/renderFastingProfileOutline\(fastingOverviewState\[partnerActor\],true\)/);
  assert.match(app,/button\.hidden=!activeNow/);
  assert.match(app,/partner\?'#partnerFastingElapsed':'#fastingProfileElapsed'/);
  assert.match(app,/elapsedNode\.textContent=activeNow\?hours\+' ч':''/);
  assert.match(css,/#partnerFastingProfileButton\[hidden\]\{display:none!important\}/);
  assert.match(design,/#partnerFastingProfileButton \.rudi-fasting-progress-outline/);
});
test('tapping partner icon displays goal without opening own tracker',()=>{
  assert.match(app,/showPartnerFastingGoal\(partnerFastingButton\)/);
  assert.match(app,/const goalText='Цель голодания: '\+String\(goal\)\.replace\('\.',','\)\+' ч'/);
  assert.match(app,/partnerFastingGoalTimer=setTimeout\(hidePartnerFastingGoal,4000\)/);
});
test('partner mood popover displays only time when no reason is set',()=>{
  assert.match(app,/const label=reason==='other'\?reasonText:\(meta\?\(meta\[0\]\+' '\+meta\[1\]\):''\)/);
  assert.match(app,/return label&&time\?label\+' · '\+time:\(label\|\|time\)/);
  assert.match(app,/const text=String\(holder\.dataset\.moodReasonText\|\|''\)\.trim\(\)/);
  assert.doesNotMatch(app,/reasonText\|\|'Причина не указана'/);
});
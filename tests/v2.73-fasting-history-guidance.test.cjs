const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');

test('v2.73 reached fasting goal is green',()=>{
  assert.match(app,/goalState\.classList\.toggle\('is-reached',goalReached\)/);
  assert.match(css,/\.fasting-goal-state\.is-reached\s*\{/);
  assert.match(css,/color:var\(--green\)/);
});

test('v2.73 fasting history uses actual awarded stars',()=>{
  assert.match(api,/function fastingViewWithRewards/);
  assert.match(api,/score:fasting:/);
  assert.match(api,/earnedStars:/);
  assert.match(app,/fasting-history-stars/);
  assert.match(app,/⭐ получено/);
  assert.match(app,/starsLabel\+' ⭐ за '\+currentYear/);
});

test('v2.73 adds autophagy and current-stage guidance',()=>{
  assert.match(index,/аутофагию/);
  assert.match(index,/нет надёжного «часа включения» аутофагии/);
  assert.match(index,/id="fastingStageFeeling"/);
  assert.match(index,/id="fastingStageAction"/);
  assert.match(app,/feeling:/);
  assert.match(app,/action:/);
});

test('v2.73 own fasting status opens tracker',()=>{
  assert.match(app,/const selfStatus=document\.getElementById\('selfFastingStatus'\)/);
  assert.match(app,/navigateToAppTab\('fasting',\{scroll:true\}\)/);
  assert.match(css,/\.profile-fasting-status\.is-clickable/);
});

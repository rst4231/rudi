const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v4.10 partner mood badge hides completely when mood is missing',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  const start=app.indexOf('function renderPartnerMood');
  const end=app.indexOf('function renderDailyMood',start);
  const block=app.slice(start,end);
  assert.match(block,/holder\.hidden=!hasMood/);
  assert.match(block,/if\(empty\) empty\.hidden=true/);
  assert.match(html,/id="partnerMoodEmpty" class="partner-mood-empty" hidden><\/span>/);
  assert.doesNotMatch(html,/id="partnerMoodEmpty"[^>]*>—<\/span>/);
});

test('v4.09 home startup always refreshes partner mood from server',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const start=app.indexOf('function setupStreakAndMood');
  const end=app.indexOf("if(document.readyState==='loading')",start);
  const block=app.slice(start,end);
  assert.match(block,/ensureHomeBootstrap\(\)[\s\S]*\.then\(\(\)=>refreshDailyMood\(\)\)/);
});

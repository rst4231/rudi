const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v4.09 partner mood holder stays visible and empty state is shown when mood missing',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const start=app.indexOf('function renderPartnerMood');
  const end=app.indexOf('function renderDailyMood',start);
  const block=app.slice(start,end);
  assert.match(block,/holder\.hidden=false/);
  assert.match(block,/empty\.hidden=hasMood/);
});

test('v4.09 home startup always refreshes partner mood from server',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const start=app.indexOf('function setupStreakAndMood');
  const end=app.indexOf("if(document.readyState==='loading')",start);
  const block=app.slice(start,end);
  assert.match(block,/ensureHomeBootstrap\(\)[\s\S]*\.then\(\(\)=>refreshDailyMood\(\)\)/);
});

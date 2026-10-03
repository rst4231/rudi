const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const tools=fs.readFileSync('public/profile-supplements.js','utf8');
const messenger=fs.readFileSync('public/messenger.js','utf8');

test('v3.63 refreshes the visible app immediately whenever it becomes active',()=>{
  assert.match(app,/window\.addEventListener\('pageshow',[\s\S]*?refreshAfterResume\(\)/);
  assert.match(app,/window\.addEventListener\('focus',[\s\S]*?refreshAfterResume\(\)/);
  assert.match(app,/if\(hiddenAt\) refreshAfterResume\(\)/);
  assert.match(app,/now-lastResumeRefreshAt<2\*1000/);
});

test('v3.63 home entry refresh includes all visible home data sources',()=>{
  const refreshStart=app.indexOf('async function refreshAfterResume');
  assert.ok(refreshStart>=0,'refreshAfterResume missing');
  const start=app.indexOf("if(currentAppTab==='home')",refreshStart);
  const block=app.slice(start,start+5000);
  for(const token of [
    'loadHomeBootstrap({force:true})',
    'loadTickTickNext({force:true})',
    'loadSupplementIntakeOverview({silent:true,force:true})',
    'window.RudiSupplementApp?.refresh?.()',
    'loadFastingOverview()',
    'window.RUDI_CAR?.refresh?.()',
    'window.RUDI_SMART_HOME?.refresh?.()',
    'window.RUDI_SAVES?.load?.()',
    'loadWeather(currentConfig.weather)'
  ]) assert.ok(block.includes(token),'missing '+token);
});

test('v3.63 habits and supplements do not register duplicate foreground refresh listeners',()=>{
  assert.doesNotMatch(tools,/window\.addEventListener\('focus',\(\)=>loadHomeTools\(\)\)/);
  assert.doesNotMatch(tools,/visibilitychange'[\s\S]*?loadHomeTools\(\)/);
  assert.match(tools,/refresh:\(\)=>loadHomeTools\(\{force:true\}\)/);
});

test('v3.63 does not speed up messenger polling',()=>{
  assert.match(messenger,/setInterval\([\s\S]*?syncLiveMessages\(\)[\s\S]*?,12000\)/);
  assert.doesNotMatch(messenger,/setInterval\(syncLiveMessages,[1-9][0-9]{0,3}\)/);
});

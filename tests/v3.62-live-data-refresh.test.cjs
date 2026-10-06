const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
const tools=fs.readFileSync('public/profile-supplements.js','utf8');

test('v3.62 online reads prefer live API and keep snapshot only as fallback',()=>{
  const start=pwa.indexOf('async function snapshotAwareFetch');
  const end=pwa.indexOf('function openOutboxDb',start);
  const block=pwa.slice(start,end);
  assert.match(block,/const response=await nativeFetch\(input,init\)/);
  assert.match(block,/catch\(error\)[\s\S]*?snapshotFallback\(snapshotKey\)/);
  assert.doesNotMatch(block,/Promise\.race\(\[network,cacheCandidate\]\)/);
});

test('v3.62 pull refresh works in Telegram and forces fresh home tools',()=>{
  const start=app.indexOf('function setupBrowserPullToRefresh');
  const end=app.indexOf('function updateTelegramSafeArea',start);
  const block=app.slice(start,end);
  assert.doesNotMatch(block,/if\(tg\?\.initData\|\|/);
  assert.match(block,/refreshAppDataNow\(\{showButton:false\}\)/);
  assert.match(app,/tg\?\.disableVerticalSwipes\?\.\(\)/);
  assert.match(app,/window\.RudiSupplementApp\?\.refresh\?\.\(\)/);
  assert.match(app,/loadSupplementIntakeOverview\(\{silent:true,force:true\}\)/);
});

test('habit and supplement force refresh bypasses the five minute read cache',()=>{
  assert.match(tools,/READ_CACHE_TTL_MS=5\*60\*1000/);
  assert.match(tools,/if\(readOnly&&!options\.force\)/);
  assert.match(tools,/request\('list',\{\}, \{force\}\)/);
  assert.match(tools,/habitRequest\('list',\{\}, \{force\}\)/);
  assert.match(tools,/refresh:\(\)=>loadHomeTools\(\{force:true\}\)/);
});

test('foreground revalidation starts immediately on entry and only collapses duplicate lifecycle events',()=>{
  assert.match(app,/now-lastResumeRefreshAt<2\*1000/);
  assert.match(app,/now-lastForegroundUiSyncAt<15\*1000/);
  assert.match(app,/if\(hiddenAt\) refreshAfterResume\(\)/);
  assert.match(app,/window\.addEventListener\('focus',[\s\S]*?refreshAfterResume\(\)/);
  assert.match(app,/window\.addEventListener\('pageshow',[\s\S]*?refreshAfterResume\(\)/);
});


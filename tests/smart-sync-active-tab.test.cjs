const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
test('inactive sections do not refresh global overdue calendar count',()=>{
  assert.match(source,/key:'calendar-overdue'[\s\S]*?shouldRun:\(\)=>Boolean\(currentActor&&appAccessReady&&appVisibleForRefresh\(\)&&\(currentAppTab==='home'\|\|currentAppTab==='schedule'\)\)/);
  assert.match(source,/if\(currentAppTab==='home'\|\|currentAppTab==='schedule'\)tabTasks\.push\(loadCalendarOverdueCount/);
});
test('UI settings foreground checks are throttled while app is visible',()=>{
  const from=source.indexOf('function syncUiPreferencesAfterForeground()');
  const until=source.indexOf('let hiddenAt=',from);
  const block=source.slice(from,until);
  assert.match(block,/appVisibleForRefresh\(\)/);
  assert.match(block,/now-lastForegroundUiSyncAt<30\*1000/);
});
test('existing manual refresh and active calendar actions are untouched',()=>{
  assert.match(source,/manualRefreshRequested=true;[\s\S]*?await refreshAfterResume\(\)/);
  assert.match(source,/async function loadCalendarOverdueCount\(\{force=false\}=\{\}\)/);
});

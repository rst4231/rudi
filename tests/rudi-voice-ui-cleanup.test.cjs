const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const extras=fs.readFileSync('public/pwa-extras.js','utf8');

test('settings no longer render auto refresh controls',()=>{
  assert.doesNotMatch(app,/settings-group-title">Автообновление/);
  assert.doesNotMatch(app,/id="settingsAutoRefreshToggle"/);
  assert.doesNotMatch(app,/id="settingsRefreshNow"/);
  assert.match(app,/settings-group-title">Интерфейс/);
});

test('retired quick add FAB is not installed and stale instances are removed',()=>{
  const start=extras.indexOf('function installDynamicExtras()');
  const body=extras.slice(start,start+500);
  assert.ok(start>=0);
  assert.doesNotMatch(body,/ensureQuickAdd\(\)/);
  assert.match(extras,/function removeRetiredQuickAdd\(\)/);
  assert.match(extras,/byId\('rudiQuickAdd'\)\?\.remove\(\)/);
  assert.match(body,/removeRetiredQuickAdd\(\)/);
});

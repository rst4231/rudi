const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');

test('saved home card order wins over a different remote layout',()=>{
  const start=app.indexOf('function applyRemoteUiPreferences');
  const end=app.indexOf('let uiPreferencesBackupTimer',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/const keepLocalOrder=hasLocalOrder&&hasRemoteOrder/);
  assert.match(block,/if\(hasRemoteOrder&&!keepLocalOrder\)/);
  assert.match(block,/if\(keepLocalOrder\)[\s\S]*?markUiPreferencesChanged\(\)/);
  assert.match(block,/if\(remoteStamp&&!keepLocalOrder\)/);
});

test('new home cards append without rearranging the saved order',()=>{
  const start=app.indexOf('function normalizedHomeOrder');
  const end=app.indexOf('function homeTileRects',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/if\(!source\.length\) return \[\.\.\.defaults\]/);
  assert.match(block,/for\(const id of defaults\) if\(!valid\.includes\(id\)\) valid\.push\(id\)/);
  assert.doesNotMatch(block,/splice\(/);
});

test('loading a saved home order no longer runs the legacy top-order migration',()=>{
  const start=app.indexOf('function loadHomeOrder');
  const end=app.indexOf('function saveHomeOrder',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(block,/migrateHomeTopOrderOnce/);
  assert.match(block,/const normalized=normalizedHomeOrder\(order\)/);
  assert.match(block,/if\(hasSavedOrder\)/);
  assert.match(block,/markUiPreferencesChanged\(\)/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('public app.js has valid JavaScript syntax',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.doesNotThrow(()=>new Function(app));
});

test('remote UI preference sync declares remoteTime only once in its function',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const start=app.indexOf('function applyRemoteUiPreferences');
  const end=app.indexOf('const UI_PREFERENCES_LOCAL_SETTLE_MS',start);
  assert.ok(start>=0&&end>start);
  const section=app.slice(start,end);
  assert.equal((section.match(/const remoteTime=/g)||[]).length,1);
});

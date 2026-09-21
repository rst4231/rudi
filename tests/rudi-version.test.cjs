const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {syncWebVersion}=require('../build.cjs');

test('v0.5.0 is the single source for UI version and cache bust',()=>{
  const config=JSON.parse(fs.readFileSync('rudi-version.json','utf8'));
  assert.equal(config.current,'v0.5.0');
  syncWebVersion();
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(html,/app\.css\?v=0\.5\.0/);
  assert.match(html,/calendar\.css\?v=0\.5\.0/);
  assert.match(html,/app\.js\?v=0\.5\.0/);
  assert.match(html,/>v0\.5\.0<\/div>/);
});

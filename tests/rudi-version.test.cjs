const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {syncWebVersion}=require('../build.cjs');

test('v1.3 is the single source for UI version and cache bust',()=>{
  const config=JSON.parse(fs.readFileSync('rudi-version.json','utf8'));
  assert.equal(config.current,'v1.3');
  syncWebVersion();
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(html,/app\.css\?v=1\.3/);
  assert.match(html,/calendar\.css\?v=1\.3/);
  assert.match(html,/smart-home\.css\?v=1\.3/);
  assert.match(html,/car\.css\?v=1\.3/);
  assert.match(html,/app\.js\?v=1\.3/);
  assert.match(html,/smart-home\.js\?v=1\.3/);
  assert.match(html,/car\.js\?v=1\.3/);
  assert.match(html,/>v1\.3<\/div>/);
});

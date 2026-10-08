const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const CURRENT_RELEASE = require('node:fs').readFileSync(require('node:path').join(__dirname,'..','VERSION'),'utf8').trim();

test('supplement counts line is removed from DOM and updates',()=>{
  const js=source('public/supplement-advanced.js');
  assert.ok(!js.includes('supplement-summary-stats'));
  assert.ok(!js.includes('statsNode'));
  assert.ok(!js.includes(' активных · '));
  assert.match(js,/wrap\.append\(duplicatePanel,actionRow,drawer\)/);
});
test('supplement duplicates and all action buttons remain available',()=>{
  const js=source('public/supplement-advanced.js');
  assert.match(js,/function updateStats\(\)[\s\S]*?renderAutomaticDuplicates\(active\)/);
  assert.match(js,/function renderAutomaticDuplicates\(active\)/);
  assert.match(js,/makeActionButton\('add'/);
  assert.match(js,/makeActionButton\('search'/);
  assert.match(js,/makeActionButton\('interactions'/);
});
test('new assets and version enable iPhone PWA refresh',()=>{
  assert.ok(source('public/index.html').includes("name=\"rudi-version\" content=\"\""+CURRENT_RELEASE));
  assert.ok(source('public/index.html').includes("supplement-advanced.js?v=4.84"+CURRENT_RELEASE.slice(1)));
  assert.ok(source('public/sw.js').includes("rudi-shell-"+CURRENT_RELEASE));
  assert.equal(source('VERSION').trim(),CURRENT_RELEASE);
  assert.equal(JSON.parse(source('rudi-version.json')).current,CURRENT_RELEASE);
});

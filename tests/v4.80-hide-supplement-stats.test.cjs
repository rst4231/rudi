const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
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
  assert.match(source('public/index.html'),/name="rudi-version" content="v4\.83"/);
  assert.match(source('public/index.html'),/supplement-advanced\.js\?v=4\.83/);
  assert.match(source('public/sw.js'),/rudi-shell-v4\.83/);
  assert.equal(source('VERSION').trim(),'v4.83');
  assert.equal(JSON.parse(source('rudi-version.json')).current,'v4.83');
});

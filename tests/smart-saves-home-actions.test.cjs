const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');

test('home smart saves block is always expanded and has no collapse registration',()=>{
  assert.match(app,/function ensureSmartSavesAlwaysExpanded\(\)/);
  assert.match(app,/section\.classList\.remove\('is-collapsed','rudi-collapsible'\)/);
  assert.match(app,/querySelector\('\.smart-saves-home-head \.block-collapse-button'\)\?\.remove\(\)/);
  const start=app.indexOf('function setupPersistentCollapsibles()');
  const end=app.indexOf('const fallback =',start);
  const setup=app.slice(start,end);
  assert.doesNotMatch(setup,/setupPersistentCollapsible\(\{[\s\S]*?selector:'#smartSavesHomeTile'/);
});

test('home smart save cards show link and text actions too',()=>{
  const start=app.indexOf('function smartSaveCard(item,{compact=false}={})');
  const end=app.indexOf('function renderSmartSaves()',start);
  const block=app.slice(start,end);
  assert.match(block,/className='smart-save-open'/);
  assert.match(block,/className='smart-save-expand'/);
  assert.doesNotMatch(block,/if\(!compact\)\{[\s\S]*?className='smart-save-open'/);
  assert.match(block,/else if\(String\(item\?\.rawText\|\|''\)\.trim\(\)\)/);
});

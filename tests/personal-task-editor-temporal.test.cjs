const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('personal TickTick editor has one visible text display per native date/time input',()=>{
  const js=fs.readFileSync('public/personal-task-editor.js','utf8');
  const css=fs.readFileSync('public/personal-task-editor.css','utf8');
  assert.match(js,/data-personal-temporal-value="date"/);
  assert.match(js,/data-personal-temporal-value="time"/);
  assert.match(js,/function updateTemporalDisplay\(type\)/);
  assert.match(js,/fresh\.addEventListener\('change',type==='date'\?syncTime/);
  assert.match(js,/type="date" class="rudi-personal-temporal-native"/);
  assert.match(js,/type="time" class="rudi-personal-temporal-native"/);
  assert.match(js,/return \{title:String\(f\('title'\)\.value/);
  assert.match(css,/\.rudi-personal-temporal-native\{/);
  assert.match(css,/opacity:0!important/);
  assert.match(css,/\.rudi-personal-temporal-control:focus-within/);
});

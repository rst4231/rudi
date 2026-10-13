const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('personal TickTick editor has one visible picker for date and time',()=>{
  const js=fs.readFileSync('public/personal-task-editor.js','utf8');
  const css=fs.readFileSync('public/personal-task-editor.css','utf8');
  assert.match(js,/data-personal-picker-value="date"/);
  assert.match(js,/data-personal-picker-value="time"/);
  assert.match(js,/function updatePersonalPickerLabel\(type\)/);
  assert.match(js,/function replaceTemporalInputs\(\)/);
  assert.match(js,/fresh\.addEventListener\('change',syncTime\)/);
  assert.match(js,/class="rudi-personal-picker-input" type="date"/);
  assert.match(js,/class="rudi-personal-picker-input" type="time"/);
  assert.match(js,/return \{title:String\(f\('title'\)\.value/);
  assert.match(css,/\.rudi-personal-picker:not\(\.is-native-fallback\)/);
  assert.match(css,/display:none!important/);
  assert.match(css,/\.rudi-personal-picker\.is-native-fallback/);
  assert.match(css,/pointer-events:auto!important/);
});

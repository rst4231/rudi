const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('personal TickTick editor renders a single direct native date and time control',()=>{
  const js=fs.readFileSync('public/personal-task-editor.js','utf8');
  const css=fs.readFileSync('public/personal-task-editor.css','utf8');
  const markup=js.slice(js.indexOf("modal.innerHTML="),js.indexOf("document.body.appendChild(modal);"));
  assert.equal((markup.match(/id="rudiPersonalTaskDate"/g)||[]).length,1);
  assert.equal((markup.match(/id="rudiPersonalTaskTime"/g)||[]).length,1);
  assert.match(markup,/type="date" aria-label="Дата дела"/);
  assert.match(markup,/type="time" aria-label="Время дела"/);
  assert.doesNotMatch(markup,/data-personal-picker-open|rudi-personal-picker-button/);
  assert.doesNotMatch(js,/function replaceTemporalInputs\(\)/);
  assert.match(js,/f\(type\)\.addEventListener\('change',syncTime\)/);
  assert.match(js,/return \{title:String\(f\('title'\)\.value/);
  assert.match(css,/> input\.rudi-personal-picker-input/);
  assert.doesNotMatch(css,/is-native-fallback|clip-path:inset/);
});

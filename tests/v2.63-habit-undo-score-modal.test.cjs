const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('habit undo baseline remains available',()=>{
  const ui=read('public/profile-supplements.js');
  assert.match(ui,/function showHabitUndo/);
  assert.match(ui,/status:previousStatus\|\|'pending'/);
});

test('score modal keeps flexible scrolling and boredom mood rendering',()=>{
  const css=read('public/app.css');
  const app=read('public/app.js');
  assert.match(css,/\.score-panel\{[\s\S]*flex:1 1 auto!important/);
  assert.match(app,/boredom:'🥱'/);
});

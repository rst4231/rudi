const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('v2.63 habits completed action offers six second undo',()=>{
  const ui=read('public/profile-supplements.js');
  assert.match(ui,/function showHabitUndo/);
  assert.match(ui,/habitUndoTimer=setTimeout\(\(\)=>bar\.classList\.remove\('is-visible'\),6000\)/);
  assert.match(ui,/if\(next==='done'&&previousStatus!=='done'\)/);
  assert.match(ui,/status:previousStatus\|\|'pending'/);
});

test('v2.63 score modal fills PWA viewport and mood uses boredom emoji',()=>{
  const css=read('public/app.css');
  const app=read('public/app.js');
  assert.match(css,/RUDI v2\.63 — score viewport and habit undo/);
  assert.match(css,/\.score-modal-sheet\{[\s\S]*height:100dvh!important/);
  assert.match(css,/\.score-panel\{[\s\S]*flex:1 1 auto!important/);
  assert.match(app,/fear:'🥱'/);
  assert.doesNotMatch(app,/fear:'😨'/);
});

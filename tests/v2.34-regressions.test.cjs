const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const score=fs.readFileSync(path.join(root,'api','score-store.cjs'),'utf8');

test('score modal blocks global pull-to-refresh while open',()=>{
  assert.match(app,/modal\.dataset\.noPullRefresh='true'/);
  assert.match(app,/document\.body\.classList\.contains\('score-modal-open'\)/);
});

test('daily question hides answer form when both answered',()=>{
  assert.match(app,/const bothAnswered=mineAnswered&&partnerAnswered/);
  assert.match(app,/form\.hidden=mineAnswered\|\|bothAnswered\|\|revealed/);
  assert.match(app,/input\.disabled=mineAnswered\|\|bothAnswered\|\|revealed/);
});

test('reward catalog reflects requested changes',()=>{
  assert.doesNotMatch(score,/id:'dinner'/);
  assert.match(score,/id:'small-surprise'[^\n]+costUnits:350/);
  assert.match(score,/id:'home-date'[^\n]+costUnits:500/);
  assert.match(score,/id:'day-off'[^\n]+costUnits:1000/);
  assert.match(score,/id:'date'[^\n]+costUnits:1100/);
  assert.match(score,/id:'gift-3000'[^\n]+costUnits:1400/);
  const costs=[...score.matchAll(/costUnits:(\d+)/g)].map(m=>Number(m[1]));
  assert.deepEqual(costs,[...costs].sort((a,b)=>a-b));
});

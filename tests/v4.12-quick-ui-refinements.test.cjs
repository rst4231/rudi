const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v4.12 quick UI refinements',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const mood=fs.readFileSync('public/mood-history.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/\['health','🫶','Здоровье'\]/);
  assert.match(app,/health:\['🫶','Здоровье'\]/);
  assert.match(mood,/health:'Здоровье'/);
  assert.match(mood,/mood-analysis-visuals-compact/);
  assert.doesNotMatch(mood,/chartTitle\.textContent='Настроение'/);
  assert.match(css,/\.profile \.avatar-mood-badge\{\s*bottom:-30px!important;/);
});

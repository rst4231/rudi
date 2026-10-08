const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/app.css','utf8');
const js=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const marker='/* RUDI v4.105 — remove duplicate rhythm text beneath profile statuses; charts remain live. */';

test('duplicated rhythm labels do not render below status in either profile',()=>{
  assert.match(css,new RegExp(marker.replaceAll(/[.*+?^\u0024{}()|[\]\\]/g,'\\$&')));
  assert.match(css,/\.profile-person-card :is\(#rustamRhythmStatus,#dianaRhythmStatus\)\{display:none!important\}/);
});
test('biorythm data, cycle label and energy updates remain wired',()=>{
  assert.match(js,/rustamRhythm\.id='rustamRhythmStatus'/);
  assert.match(js,/dianaRhythm\.id='dianaRhythmStatus'/);
  assert.match(js,/dianaCycleMood\.id='dianaCycleMood'/);
  assert.match(js,/renderProfileEnergy\('Диана',now\)/);
  assert.match(js,/renderProfileEnergy\('Рустам',now\)/);
  assert.match(js,/syncRustamRhythmStatus\(\)/);
  assert.match(js,/syncDianaRhythmStatus\(\)/);
});
test('version is v4.105 and scripts bust old app cache',()=>{
  assert.match(html,/name="rudi-version" content="v4\.105"/);
  assert.match(html,/\/app\.css\?v=4\.105/);
  assert.match(html,/\/app\.js\?v=4\.105/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v2.102 fasting and time-aware hero visuals are wired',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(app,/function homeDaypart\(\)/);
  assert.match(app,/dashboard\.dataset\.daypart=homeDaypart\(\)/);
  assert.match(css,/home-scene-morning\.svg\?v=2\.102/);
  assert.match(css,/fasting-scene\.svg\?v=2\.102/);
  assert.match(css,/RUDI v2\.102 — fasting reference refresh/);
  assert.match(html,/app\.css\?v=2\.102/);
  assert.match(html,/app\.js\?v=2\.102/);
});

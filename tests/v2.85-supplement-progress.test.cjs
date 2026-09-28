const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','public/profile-supplements.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public/profile-supplements.css'),'utf8');

test('v2.85 supplement summary also drives percentage progress',()=>{
  assert.match(js,/percent=active\.length\?Math\.round\(taken\/active\.length\*100\):0/);
  assert.match(js,/supplementProgressFill\.style\.width=percent\+'%'/);
  assert.match(js,/supplementPercentNode\.textContent=percent\+'%'/);
});

test('v2.85 supplement progress row mirrors collapsed habit layout',()=>{
  assert.match(js,/personal-supplements-progress-row/);
  assert.match(js,/personal-supplements-progress-fill/);
  assert.match(js,/personal-supplements-percent/);
  assert.match(js,/tile\.append\(head,supplementProgressRow,body\)/);
  assert.match(css,/\.personal-supplements-progress-row\{/);
  assert.match(css,/\.personal-supplements-progress-fill\{/);
  assert.match(css,/body\[data-app-tab="home"\] \.personal-supplements-progress-row/);
});

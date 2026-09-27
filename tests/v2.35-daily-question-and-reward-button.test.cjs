const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','app.css'),'utf8');

test('daily question hidden form cannot be overridden by display grid',()=>{
  assert.match(css,/\.daily-question-form\[hidden\]\{display:none!important\}/);
  assert.match(app,/const bothAnswered=mineAnswered&&partnerAnswered/);
  assert.match(app,/form\.hidden=mineAnswered\|\|bothAnswered\|\|revealed/);
});

test('claimable reward button has dedicated green state',()=>{
  assert.match(app,/button\.classList\.toggle\('is-claimable',own&&enough&&!alreadyActive\)/);
  assert.match(css,/\.score-reward-button\.is-claimable\{/);
  assert.match(css,/#2f9b67/);
  assert.match(css,/html\[data-theme="dark"\] \.score-reward-button\.is-claimable/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('v4.15 Coffee 3 has no outer frame',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/card\.classList\.add\('is-coffee3'\)/);
  assert.match(css,/\.smart-save-card\.is-coffee3\{\s*border:0!important;/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'..','public/app.css'),'utf8');
const block=css.slice(css.indexOf('RUDI v2.68 — score page iPhone/PWA top safe-area hotfix'));
test('v2.68 keeps score header below iPhone system area',()=>{
  assert.match(block,/padding-top:max\([\s\S]*68px/);
  assert.match(block,/var\(--tg-safe-area-inset-top,0px\)/);
  assert.match(block,/var\(--tg-content-safe-area-inset-top,0px\)/);
  assert.match(block,/\.score-page>\.score-page-head\{[\s\S]*position:relative!important/);
  assert.match(block,/@media\(max-width:430px\)[\s\S]*72px/);
});

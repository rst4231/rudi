const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.95 current mood frame matches partner frame dimensions and appearance reset',()=>{
  const css=read('public/app.css');
  assert.match(css,/RUDI v2\.95 exact mood frame \+ iPhone tap/);
  assert.match(css,/\.profile \.mood-current-button\{[\s\S]*-webkit-appearance:none !important;/);
  assert.match(css,/width:23px !important;/);
  assert.match(css,/height:23px !important;/);
  assert.match(css,/border-radius:7px !important;/);
  assert.match(css,/background:rgba\(255,255,255,\.055\) !important;/);
});

test('v2.95 mood picker opens reliably on touch without double click',()=>{
  const app=read('public/app.js');
  assert.match(app,/currentButton\.addEventListener\('pointerup'/);
  assert.match(app,/lastPointerToggleAt=Date\.now\(\)/);
  assert.match(app,/Date\.now\(\)-lastPointerToggleAt<500/);
  assert.match(app,/setMoodChoicesOpen\(Boolean\(choices\?\.hidden\)\)/);
});

test('v2.95 keeps mood message timing and shared tasks untouched',()=>{
  const app=read('public/app.js');
  const html=read('public/index.html');
  assert.match(app,/\},7000\);/);
  assert.match(html,/id="ticktickToggle" class="ticktick-toggle" role="button" tabindex="-1"/);
  assert.doesNotMatch(html,/ticktickChevronButton/);
});

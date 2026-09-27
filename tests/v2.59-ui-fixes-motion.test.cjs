const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('v2.59 fixes fasting and kitchen defaults',()=>{
  const app=read('public/app.js');
  const html=read('public/index.html');
  const css=read('public/app.css');
  assert.match(app,/rudi-fasting-history-collapsed-v2/);
  assert.match(app,/classList\.contains\('is-collapsed'\)/);
  assert.match(html,/fasting-history-card is-collapsed/);
  assert.match(css,/\.fasting-history\[hidden\],[\s\S]*display:none!important/);
  assert.match(app,/key:'kitchen-products-v2'/);
});

test('v2.59 removes duplicate daily question drag and motion switch',()=>{
  const app=read('public/app.js');
  const html=read('public/index.html');
  assert.doesNotMatch(html,/id="dailyQuestionDragHandle"/);
  assert.doesNotMatch(app,/settingsMotionToggle/);
  assert.doesNotMatch(app,/interfaceMotionEnabled/);
  assert.doesNotMatch(app,/interfaceMotionStorageKey/);
});

test('v2.59 adds motion and anniversary window without touching Lulu',()=>{
  const app=read('public/app.js');
  const css=read('public/app.css');
  assert.match(app,/if\(next\.days>30\)\{card\.hidden=true;return\}/);
  assert.match(css,/RUDI v2\.59 — modern motion pass/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css,/data-ui-motion="off"/);
});

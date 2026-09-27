const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('v2.60 defines unified design tokens and compact nav',()=>{
  const css=read('public/app.css');
  assert.match(css,/RUDI v2\.60 — unified design system/);
  assert.match(css,/--rudi-radius-sm:12px/);
  assert.match(css,/--rudi-radius-md:16px/);
  assert.match(css,/--rudi-radius-lg:22px/);
  assert.match(css,/--rudi-radius-xl:28px/);
  assert.match(css,/\.app-tabbar\{[\s\S]*min-height:76px!important/);
  assert.match(css,/@media\(max-width:430px\)[\s\S]*min-height:74px!important/);
});

test('v2.60 unifies Kitchen and For Di surfaces',()=>{
  const css=read('public/app.css');
  const pwa=read('public/pwa-extras.css');
  assert.match(css,/Kitchen: warm content accent, purple reserved for actions/);
  assert.match(css,/rgba\(232,164,92/);
  assert.match(pwa,/RUDI v2\.60 — unified secondary surfaces/);
  assert.match(pwa,/\.saved-category,[\s\S]*\.for-di-category/);
});

test('v2.60 aligns trackers and cache versions',()=>{
  const supp=read('public/profile-supplements.css');
  const html=read('public/index.html');
  assert.match(supp,/RUDI v2\.60 — tracker surface alignment/);
  assert.match(html,/meta name="rudi-version" content="v2\.60"/);
  assert.match(html,/\/app\.css\?v=2\.60/);
  assert.match(html,/\/profile-supplements\.css\?v=2\.60/);
});

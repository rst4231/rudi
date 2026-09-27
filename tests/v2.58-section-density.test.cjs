const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('v2.58 keeps secondary screens compact',()=>{
  const css=read('public/app.css');
  const pwa=read('public/pwa-extras.css');
  assert.match(css,/RUDI v2\.58 — section density pass/);
  assert.match(css,/\.wishlist-url-toggle/);
  assert.match(css,/\.fasting-history-toggle/);
  assert.match(css,/body\[data-app-tab="dates"\] \.dates-page-head h1\{font-size:23px\}/);
  assert.match(pwa,/RUDI v2\.58 — For Di density pass/);
  assert.match(pwa,/\.for-di-list\{gap:11px\}/);
});

test('v2.58 defaults heavy sections to compact states',()=>{
  const app=read('public/app.js');
  const pwa=read('public/pwa-extras.js');
  const html=read('public/index.html');
  assert.match(app,/key:'kitchen-recipes',[\s\S]*defaultCollapsed:true/);
  assert.match(app,/stored===null\?true:stored==='1'/);
  assert.match(app,/rudi-fasting-history-collapsed-v1/);
  assert.match(pwa,/type==='date'&&dateCount>3/);
  assert.match(pwa,/const FOR_DI_CATEGORY_TYPES=\['labor','saved','stylist'\]/);
  assert.match(html,/id="wishlistUrlToggle"/);
  assert.match(html,/data-for-di-category="labor"[^>]*is-collapsed|class="for-di-category is-collapsed" data-for-di-category="labor"/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'..','public/app.css'),'utf8');
const marker='RUDI v2.70 — dark natural wishlist theme';
const start=css.indexOf(marker);
const block=start>=0?css.slice(start):'';

test('v2.70 has a dedicated dark wishlist skin',()=>{
  assert.ok(start>=0);
  assert.match(block,/html\[data-theme="dark"\] body\[data-app-tab="wishlist"\]/);
  assert.match(block,/\.wishlist-column/);
  assert.match(block,/\.wish-item/);
  assert.match(block,/\.app-tabbar/);
  assert.match(block,/#1b281e/);
  assert.doesNotMatch(block,/body\[data-app-tab="home"\]/);
});

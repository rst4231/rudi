const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'..','public/app.css'),'utf8');
const marker='RUDI v2.69 — natural wishlist theme';
const start=css.indexOf(marker);
const block=start>=0?css.slice(start):'';

test('v2.69 applies natural theme only to wishlist tab',()=>{
  assert.ok(start>=0);
  assert.match(block,/body\[data-app-tab="wishlist"\]/);
  assert.match(block,/--wishlist-forest:#0b160f/);
  assert.match(block,/--wishlist-cream:#f4ecd9/);
  assert.match(block,/\.wishlist-column/);
  assert.match(block,/data:image\/svg\+xml/);
  assert.doesNotMatch(block,/body\[data-app-tab="home"\]/);
  assert.doesNotMatch(block,/body\[data-app-tab="feed"\]/);
  assert.doesNotMatch(block,/body\[data-app-tab="products"\]/);
});

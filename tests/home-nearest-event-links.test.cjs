const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
const css=fs.readFileSync(require.resolve('../public/app.css'),'utf8');

test('home nearest events keep source URLs and render them as links',()=>{
  assert.ok(app.includes('href:item.href'));
  assert.ok(app.includes('href:event.href'));
  assert.ok(app.includes("const isLink=/^https?:\\/\\//i.test(String(row.href||''));"));
  assert.ok(app.includes("const el=document.createElement(isLink?'a':'div');"));
  assert.ok(app.includes("tg.openLink(el.href)"));
  assert.match(css,/\.home-nearest-link\{/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v2.108 fasting timer has explicit light and dark theme contrast',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/\/\* RUDI v2\.108: fasting timer contrast by theme \*\/[\s\S]*\.fasting-elapsed\{\s*color:#11172a;\s*\}/);
  assert.match(css,/html\[data-theme="dark"\] \.fasting-elapsed\{\s*color:#f2f6ff;\s*\}/);
});

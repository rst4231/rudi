const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/supplement-advanced.css','utf8');
const js=fs.readFileSync('public/supplement-advanced.js','utf8');
const selector='body[data-app-tab="supplements"] .personal-supplements-list .supplement-group-title[data-period]';
const heading=css.split(selector+'{').at(-1).split('}')[0];
test('daypart headings have no decorative icon',()=>{
  assert.match(css,/\.supplement-group-title\[data-period\]::before\s*\{\s*content:none;\s*display:none;/);
});
test('daypart headings are compact, text-only and not cards',()=>{
  assert.match(heading,/display:block;/);
  assert.match(heading,/min-height:0;/);
  assert.match(heading,/background:transparent;/);
  assert.match(heading,/box-shadow:none;/);
  assert.match(heading,/text-transform:none;/);
});
test('daypart headings are generated for every supplement time group',()=>{
  assert.match(js,/SUPPLEMENT_DAYPART_ORDER=\['morning','day','evening','unspecified','upcoming'\]/);
  assert.match(js,/title\.dataset\.period=period/);
  assert.match(js,/title\.textContent=SUPPLEMENT_DAYPART_LABELS\[period\]/);
});

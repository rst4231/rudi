const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('v4.12 finance tabs and comparison are wired',()=>{
  const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app.js','utf8');
  assert.match(html,/data-finance-tab="shared"/);assert.match(html,/data-finance-tab="personal"/);assert.match(html,/data-finance-tab="debts"/);
  assert.match(app,/function financeComparisonText/);assert.match(app,/save-personal/);assert.match(app,/save-debt/);assert.match(app,/toggle-debt/);
});

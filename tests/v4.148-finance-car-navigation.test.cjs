'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const car=fs.readFileSync('public/car.js','utf8');
const css=fs.readFileSync('public/car.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('wallet icon and shortcut remain visible in car Expenses card',()=>{
  assert.match(html,/id="carTransportFinanceShortcut"[^>]*data-finance-shortcut="transport"/);
  assert.match(css,/\.car-smart-card-actions>button\.car-transport-finance-shortcut\s*\{/);
  assert.match(css,/\.car-smart-card-actions>button\.car-transport-finance-shortcut svg\s*\{/);
  assert.match(css,/width:32px!important;min-height:32px!important;height:32px!important/);
  assert.match(css,/fill:none;stroke:currentColor;pointer-events:none/);
  assert.match(car,/actions\?\.insertBefore\(expensesFinanceShortcut,actions\.querySelector\('\.car-card-collapse'\)\)/);
});
test('transport shortcut waits until navigation has finished and focuses a populated month',()=>{
  const handler=app.slice(app.indexOf("if(financeShortcut==='transport'){"),app.indexOf("}else financeDataPromise.catch(()=>{});")+43);
  assert.match(handler,/appViewTransitionActive&&frames-->0/);
  assert.match(handler,/setFinanceTab\('personal'\)/);
  assert.match(handler,/monthInput\.value=months\[0\]\|\|financeCurrentMonthKey\(\)/);
  assert.match(handler,/openFinanceCategoryHistory\(transport\.id\)/);
});
test('leaving finances resets stale category state without fighting route scroll',()=>{
  assert.match(app,/function closeFinanceCategoryHistory\(\{restoreScroll=true\}=\{\}\)/);
  assert.match(app,/closeFinanceCategoryHistory\(\{restoreScroll:false\}\)/);
  assert.match(app,/currentAppTab==='finances'&&next!=='finances'/);
});

test('car summary circle remains; only the unpaid obligations indicator goes away',()=>{
  assert.match(car,/id="carAttentionIndicator"/);
  assert.match(css,/\.car-attention-indicator/);
  assert.match(car,/id="carAttentionTitle"/);
  assert.match(car,/id="carAttentionChips"/);
});

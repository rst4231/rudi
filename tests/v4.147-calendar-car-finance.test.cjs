'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const car=fs.readFileSync('public/car.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const morning=fs.readFileSync('api/morning-summary.cjs','utf8');

test('each calendar entry starts at current local day regardless of last browsed month and shared shortcut',()=>{
  assert.match(app,/if\(tab==='schedule'\)\{[\s\S]*?calendarDateCursor=todayState\(\)\.key;[\s\S]*?currentSelectedWorkDate=calendarDateCursor;[\s\S]*?calendarSetScope\(selectedScope/);
  assert.match(app,/pendingCalendarScope='shared';[\s\S]*?navigateToAppTab\('schedule'/);
});
test('finance navigation buttons in calendar, products and car have a wallet icon',()=>{
  for(const id of ['calendarFinanceShortcut','kitchenFinanceShortcut','carTransportFinanceShortcut']){
    const button=html.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>[\\s\\S]*?<\\/button>'));
    assert.ok(button,id);
    assert.match(button[0],/<rect x="3" y="6" width="18" height="15"/);
    assert.doesNotMatch(button[0],/M7 17 17 7/);
  }
  assert.match(car,/expensesFinanceShortcut=expenses\?\.querySelector\('#carTransportFinanceShortcut'\)/);
  assert.match(car,/actions\?\.insertBefore\(expensesFinanceShortcut,actions\.querySelector\('\.car-card-collapse'\)\)/);
});
test('car expenses display every transaction separately, with timestamp and its own amount',()=>{
  assert.match(car,/group\.operations\.push\(\{label,amount,occurredAt:/);
  assert.match(car,/for\(const entry of group\.operations\)/);
  assert.match(car,/when\.textContent=carExpenseDateTime\(entry\.occurredAt\)/);
  assert.match(car,/amount\.textContent=carExpenseMoney\(entry\.amount\)/);
  assert.doesNotMatch(car,/entry\.count\+' '/);
});
test('car error creation label and morning message no longer advertise tyre block',()=>{
  assert.match(html,/<span>Что починить<\/span>/);
  const block=morning.slice(morning.indexOf('function rustamCarBlock'),morning.indexOf('function buildMorningSummary'));
  assert.doesNotMatch(block,/Шины:/);
  assert.match(block,/Мойка:/);
  assert.match(block,/Рекомендации:/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('calendar, kitchen and car show independent accessible finance shortcuts',()=>{
  const html=read('public/index.html');
  for(const id of ['calendarFinanceShortcut','kitchenFinanceShortcut','carTransportFinanceShortcut']){
    assert.match(html,new RegExp('<button[^>]*id="'+id+'"[^>]*type="button"[^>]*aria-label="[^"]+"'));
    assert.match(html,new RegExp('<button[^>]*id="'+id+'"[^>]*>[\\s\\S]*?<svg'));
  }
  assert.match(html,/id="calendarFinanceShortcut"[^>]*data-finance-shortcut="overview"/);
  assert.match(html,/id="kitchenFinanceShortcut"[^>]*data-finance-shortcut="overview"/);
  assert.match(html,/id="carTransportFinanceShortcut"[^>]*data-finance-shortcut="transport"/);
  const kitchen=html.slice(html.indexOf('id="kitchenSwitcher"'),html.indexOf('</div>',html.indexOf('id="kitchenSwitcher"')));
  assert.equal((kitchen.match(/data-kitchen-view="/g)||[]).length,3);
  assert.ok(kitchen.indexOf('data-kitchen-view="saves"')<kitchen.indexOf('id="kitchenFinanceShortcut"'));
  const calendar=html.slice(html.indexOf('id="calendarScopeSwitch"'),html.indexOf('id="calendarModeSwitch"'));
  assert.match(calendar,/calendarFinanceShortcut/);
  const car=html.slice(html.indexOf('id="carExpensesTitle"'),html.indexOf('id="carExpensesMeta"'));
  assert.match(car,/carTransportFinanceShortcut/);
});

test('finance shortcut uses the normal navigation, loading and Transport category history',()=>{
  const app=read('public/app.js');
  assert.match(app,/function setupFinanceShortcuts\(\)/);
  assert.match(app,/pendingFinanceShortcut=button\.dataset\.financeShortcut==='transport'\?'transport':''/);
  assert.match(app,/navigateToAppTab\('finances',\{scroll:true\}\)/);
  assert.match(app,/const financeDataPromise=loadFinances\(\{silent:true\}\)/);
  assert.match(app,/openFinanceCategoryHistory\(transport\.id\)/);
  assert.match(app,/String\(row\.name\|\|''\)\.trim\(\)\.toLocaleLowerCase\('ru-RU'\)\.replace\(\/ё\/g,'е'\)/);
  assert.ok(app.indexOf('setupFinanceShortcuts();')>app.indexOf('function setupFinanceShortcuts()'));
});

test('partner avatar opens the existing partner star page but keeps mood badge separate',()=>{
  const app=read('public/app.js');
  const start=app.indexOf('const makePersonTile=(actor,identity)=>');
  const stop=app.indexOf('const selfCard=makePersonTile',start);
  assert.ok(start>=0&&stop>start);
  const block=app.slice(start,stop);
  assert.match(block,/if\(actor!==currentActor\)\{/);
  assert.match(block,/avatar\.setAttribute\('role','button'\)/);
  assert.match(block,/avatar\.setAttribute\('tabindex','0'\)/);
  assert.match(block,/openScoreModal\(actor\)/);
  assert.match(block,/avatar\.addEventListener\('click',openPartnerStars\)/);
  assert.match(block,/avatar\.addEventListener\('keydown'/);
  assert.match(block,/avatar\.querySelector\('\.avatar-mood-badge'\)/);
});

test('shortcuts preserve three kitchen tab widths and fit calendar controls',()=>{
  const c=read('public/calendar.css'),a=read('public/app.css'),car=read('public/car.css');
  assert.match(c,/button#calendarFinanceShortcut\s*\{/);
  assert.match(c,/flex:0 0 34px!important/);
  assert.match(a,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\) 34px/);
  assert.match(car,/button\.car-transport-finance-shortcut/);
});

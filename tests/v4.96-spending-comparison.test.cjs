'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {detectIssues,forecast}=require('../public/finance-decisions-core.js');
const now=new Date(2026,9,8,12);
const entry=(id,stamp,amount,categoryId='transport')=>({
  id,categoryId,occurredAt:stamp,month:stamp.slice(0,7),rubAmount:amount
});
const state={categories:[{id:'transport',name:'Транспорт'}],personalExpenses:[
  entry('a','2026-10-02T10:00:00+03:00',14121),
  entry('b','2026-09-04T10:00:00+03:00',1848),
  entry('c','2026-09-25T10:00:00+03:00',70000)
]};
test('spending is compared using actual transactions on equal calendar dates',()=>{
  const alert=detectIssues(state,now).find(x=>x.kind==='overspend');
  assert.equal(alert.current,14121);
  assert.equal(alert.previous,1848);
  assert.equal(alert.delta,12273);
  assert.equal(alert.periods.current.from,'2026-10-01');
  assert.equal(alert.periods.current.to,'2026-10-08');
  assert.equal(alert.periods.previous.from,'2026-09-01');
  assert.equal(alert.periods.previous.to,'2026-09-08');
  assert.ok(alert.percent>660&&alert.percent<670);
});
test('later transactions in last month do not influence prior period',()=>{
  const alert=detectIssues(state,now).find(x=>x.kind==='overspend');
  assert.equal(alert.previous,1848);
});
test('no prior transactions does not invent percentage growth',()=>{
  const alert=detectIssues({...state,personalExpenses:[state.personalExpenses[0]]},now)[0];
  assert.equal(alert.kind,'no-baseline');
  assert.equal(alert.percent,null);
  assert.equal(alert.previous,0);
});
test('equal month-to-date spending is not an increase',()=>{
  const equal={...state,personalExpenses:[
    entry('a','2026-10-02T10:00:00+03:00',2000),
    entry('b','2026-09-04T10:00:00+03:00',2000)
  ]};
  assert.equal(detectIssues(equal,now).some(x=>x.kind==='overspend'),false);
});
test('manual category adjustments never count as transactions',()=>{
  const data={...state,personalExpenses:[{...state.personalExpenses[0],manualAdjustment:true}]};
  assert.equal(detectIssues(data,now).length,0);
});
test('compares matching dates across year boundaries',()=>{
  const date=new Date(2027,0,4,12);
  const data={...state,personalExpenses:[
    entry('jan','2027-01-03T10:00:00+03:00',5000),
    entry('dec','2026-12-02T10:00:00+03:00',2500)
  ]};
  const alert=detectIssues(data,date).find(x=>x.kind==='overspend');
  assert.equal(alert.periods.previous.to,'2026-12-04');
  assert.equal(alert.previous,2500);
});
test('skips future days of the prior month and avoids projected values',()=>{
  const alert=detectIssues(state,now)[0];
  assert.ok(!alert.detail.includes('темпу прошлого'));
  assert.equal(alert.periods.previous.to,'2026-09-08');
});
test('existing history can receive explicit selected date ranges',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../public/app.js'),'utf8');
  const ui=fs.readFileSync(path.resolve(__dirname,'../public/finance-decisions-ui.js'),'utf8');
  assert.ok(ui.includes('rudi-finance-open-category-history'));
  assert.ok(app.includes('financeCategoryHistoryRange.from'));
  assert.ok(app.includes('financeCategoryHistoryRange.to'));
  assert.ok(app.includes('financeCategoryHistoryRange=null'));
});
test('simulator is folded by default and can be opened by native details',()=>{
  const ui=fs.readFileSync(path.resolve(__dirname,'../public/finance-decisions-ui.js'),'utf8');
  assert.ok(ui.includes('id="rudiScenarioDetails"'));
  assert.ok(!ui.includes('id="rudiScenarioDetails" open'));
  assert.ok(ui.includes('<summary class="rudi-scenario-summary">'));
});
test('savings and goal report if all spendable wallets cover amount',()=>{
  const ui=fs.readFileSync(path.resolve(__dirname,'../public/finance-decisions-ui.js'),'utf8');
  assert.ok(ui.includes('Не хватает сейчас'));
  assert.ok(ui.includes('Денег уже хватает'));
  assert.ok(ui.includes('С учётом всех обычных кошельков денег на цель уже хватает'));
  const funds=forecast({wallets:[{type:'regular',currency:'USD',balance:100},{type:'regular',currency:'RUB',balance:2000}]},now,30,{rates:{USD:80}});
  assert.equal(funds.opening,10000);
});

test('full orange category progress ring turns green and intermediate stays orange',()=>{
  const css=fs.readFileSync(path.resolve(__dirname,'../public/app.css'),'utf8');
  assert.ok(css.includes('.finance-category-coin.has-budget.is-budget-mid{\n  --finance-budget-ring:#e0aa2f;'));
  assert.ok(css.includes('.finance-category-coin.has-budget.is-budget-full{\n  --finance-budget-ring:#35a875;'));
  assert.ok(css.includes('.finance-category-coin-item .finance-coin-amount.is-budget-full{\n  color:#d94b55!important;'));
});

test('monthly spending card is folded by default with compact buttons and centered title',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../public/index.html'),'utf8');
  const css=fs.readFileSync(path.resolve(__dirname,'../public/app.css'),'utf8');
  const app=fs.readFileSync(path.resolve(__dirname,'../public/app.js'),'utf8');
  assert.ok(html.includes('id="financeObligationsCard" class="finance-obligations-card finance-collapsible is-collapsed"'));
  assert.ok(html.includes('id="financeObligationAddButton" class="finance-collapse-toggle finance-obligation-add-button"'));
  assert.ok(html.includes('id="financeObligationsToggle" class="finance-collapse-toggle"'));
  assert.ok(html.includes('finance-obligations-title-spacer'));
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)!important'));
  assert.ok(css.includes('.finance-obligations-head-spacer')===false);
  assert.ok(app.includes("bindFinanceCardCollapse('financeObligationsCard','financeObligationsToggle')"));
});
test('monthly spending add button is plus only and remains independent of expand button',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../public/index.html'),'utf8');
  const app=fs.readFileSync(path.resolve(__dirname,'../public/app.js'),'utf8');
  assert.ok(html.includes('title="Добавить ежемесячный расход">+</button>'));
  assert.ok(!html.includes('id="financeObligationAddButton" class="finance-obligation-add-button" type="button">+ Добавить'));
  assert.ok(app.includes("document.getElementById('financeObligationAddButton')?.addEventListener('click',()=>openFinanceObligationComposer(''))"));
});

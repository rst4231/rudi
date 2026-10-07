const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');

test('v4.54 removes add-expense button from category history',()=>{
  assert.ok(!html.includes('id="financeCategoryHistoryAdd"'));
  assert.ok(!app.includes("document.getElementById('financeCategoryHistoryAdd')"));
});

test('v4.54 puts RUB/USD switch immediately after balance calendar',()=>{
  const month=html.indexOf('financePersonalMonthInput');
  const currency=html.indexOf('financeBalanceCurrencyButton');
  const eye=html.indexOf('financeBalanceEyeButton');
  assert.ok(month>=0&&currency>month&&eye>currency);
  assert.ok(html.includes('id="financeBalanceCurrencySymbol"'));
  assert.ok(css.includes('.finance-balance-currency'));
});

test('v4.54 converts overview balance and all three metrics to USD display',()=>{
  assert.ok(app.includes("let financeOverviewDisplayCurrency='RUB'"));
  assert.ok(app.includes('function financeOverviewMoney(rubAmount'));
  assert.ok(app.includes("financeMoney(rub/rate,'USD')"));
  assert.ok(app.includes("coinIncome.textContent=financeBalanceHidden?'••••':financeOverviewMoney(income)"));
  assert.ok(app.includes("plannedTotal.textContent=financeBalanceHidden?'••••':financeOverviewMoney(plannedRemaining)"));
  assert.ok(app.includes("totalHost.textContent=financeBalanceHidden?'••••':financeOverviewMoney(financeExpenseTotal(month))"));
  assert.ok(app.includes("const overviewText=financeOverviewMoney(Math.round(total*100)/100,payload)"));
  assert.ok(html.includes('content="v4.54"'));
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resolveExpenseConversion}=require('../api/finances.js');

test('v4.53 expense conversion accepts wallet currency input',()=>{
  const row=resolveExpenseConversion({
    inputAmount:100,inputCurrency:'USD',sourceCurrency:'USD',targetCurrency:'RUB',
    rates:{USD:80,RUB:1},
  });
  assert.equal(row.sourceAmount,100);
  assert.equal(row.amount,8000);
  assert.equal(row.rubAmount,8000);
  assert.equal(row.exchangeRate,80);
});

test('v4.53 expense conversion accepts category currency input',()=>{
  const row=resolveExpenseConversion({
    inputAmount:8000,inputCurrency:'RUB',sourceCurrency:'USD',targetCurrency:'RUB',
    rates:{USD:80,RUB:1},
  });
  assert.equal(row.sourceAmount,100);
  assert.equal(row.amount,8000);
  assert.equal(row.rubAmount,8000);
  assert.equal(row.exchangeRate,80);
});

test('v4.53 expense composer exposes source and target currency choice',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(html.includes('id="financeExpenseCurrencySwitch"'));
  assert.ok(html.includes('id="financeExpenseCurrencySource"'));
  assert.ok(html.includes('id="financeExpenseCurrencyTarget"'));
  assert.ok(app.includes('inputCurrency:financeExpenseInputCurrency'));
  assert.ok(app.includes('function syncFinanceExpenseCurrencyChoice()'));
  assert.ok(css.includes('.finance-expense-currency-switch'));
  assert.ok(html.includes('content="v4.53"'));
});

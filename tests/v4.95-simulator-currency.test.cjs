'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../public/finance-decisions-core.js');
const today=new Date(2026,9,8,12);
const data={wallets:[{type:'regular',currency:'RUB',balance:30304},{type:'regular',currency:'USD',balance:200}],plan:{reserve:2000000,obligations:[]},personalExpenses:[],walletIncomes:[]};
const rates={RUB:1,USD:80};
test('USD wallet uses supplied existing ticker exchange rate',()=>{
  assert.equal(core.forecast(data,today,30,{rates}).opening,46304);
});
test('no USD rate means no fabricated balance',()=>{
  const value=core.forecast(data,today,30,{rates:{RUB:1}});
  assert.equal(value.opening,null);
  assert.ok(value.missingCurrencies.includes('USD'));
});
test('credit and archived wallets excluded',()=>{
  const copy={...data,wallets:[...data.wallets,{currency:'RUB',type:'credit',balance:500000},{currency:'USD',archived:true,balance:300}]};
  assert.equal(core.forecast(copy,today,30,{rates}).opening,46304);
});
test('simulator communicates purchase shortfall, reserve is not debt',()=>{
  const result=core.simulate('purchase',{cost:50000},data,today,{rates});
  assert.equal(result.cash,46304);assert.equal(result.shortfall,3696);
  assert.equal(result.remains,0);assert.equal(result.reserve,2000000);
});
test('mortgage comparison continues to work with currency rates',()=>{
  const result=core.simulate('mortgage',{cost:6000000,down:1000000,years:20,rate:12,rent:35000},data,today,{rates});
  assert.ok(Number.isFinite(result.main)&&result.main>0);
});
test('forecast and analyst 2.0 UI sections removed',()=>{
  const ui=fs.readFileSync(path.resolve(__dirname,'../public/finance-decisions-ui.js'),'utf8');
  assert.ok(!ui.includes('rudiForecastHeading'));assert.ok(!ui.includes('rudiAdviceHeading'));
});
test('simulator uses existing finance currency selector and cache',()=>{
  const ui=fs.readFileSync(path.resolve(__dirname,'../public/finance-decisions-ui.js'),'utf8');
  const app=fs.readFileSync(path.resolve(__dirname,'../public/app.js'),'utf8');
  assert.ok(app.includes('RUDI_FINANCE_CURRENCY_CONTEXT'));
  assert.ok(app.includes('rudi-finance-currency-changed'));
  assert.ok(ui.includes('rudi-finance-currency-changed'));
  assert.ok(ui.includes('Не хватает на покупку'));
});

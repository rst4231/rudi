const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('wallet creation is a category-style tile in wallet list; income remains top action',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  const top=html.slice(html.indexOf('<div class="finance-wallet-head-actions">'),html.indexOf('<div id="financeWalletList"'));
  assert.match(top, /id="financeIncomeAddButton"/);
  assert.doesNotMatch(top, /id="financeWalletCreateButton"/);
  assert.match(app,/add\.id='financeWalletCreateButton'/);
  assert.match(app,/add\.className='finance-coin-item finance-add-category-item finance-add-wallet-item'/);
  assert.match(app,/add\.addEventListener\('click',\(\)=>\{setFinanceOrderEditMode\(false\);openFinanceWalletComposer\(''\)\}\)/);
  assert.match(app,/list\.append\(add\)/);
  assert.match(css,/\.finance-wallet-list \.finance-add-wallet-item/);
});

test('expense categories title has no duplicated eyebrow or leftover top spacing',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  const block=html.slice(html.indexOf('<div class="finance-category-heading">'),html.indexOf('<div class="finance-category-yesterday">'));
  assert.match(block,/<h2 id="financeCategoriesTitle">Расходы<\/h2>/);
  assert.doesNotMatch(block,/section-eyebrow/);
  assert.match(css,/\.finance-category-heading #financeCategoriesTitle\{margin-top:0!important\}/);
});

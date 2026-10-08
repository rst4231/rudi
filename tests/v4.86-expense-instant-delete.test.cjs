const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(name)=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('expense ledger rows have a confirmed delete control',()=>{
  const app=read('public/app.js'),css=read('public/app.css');
  assert.match(app,/className='finance-operation-delete'/);
  assert.match(app,/await smartSaveConfirm\('Удалить расход/);
  assert.match(app,/financeRequest\('delete-expense',\{id:row.id\}\)/);
  assert.match(css,/\.finance-operation-row\.is-expense\{/);
  assert.match(css,/\.finance-operation-delete\{/);
});

test('expense save updates UI before server response and restores on failure',()=>{
  const app=read('public/app.js');
  const start=app.indexOf("document.getElementById('financeExpenseComposerSave')?.addEventListener('click',async()=>{");
  const body=app.slice(start,app.indexOf("document.getElementById('financeExpenseComposerAmount')?.addEventListener('keydown'",start));
  assert.ok(start>0);
  assert.ok(body.indexOf('financeApplyExpensePreview(preview)')<body.indexOf("financeRequest('save-expense',payload)"));
  assert.ok(body.indexOf("closeFinanceCoinModal('financeExpenseComposer')")<body.indexOf("financeRequest('save-expense',payload)"));
  assert.match(body,/financeState=previousState/);
  assert.match(body,/loadFinances\(\{silent:true\}\)/);
});
test('optimistic expense wallet debit and refund use sourceAmount',()=>{
  const app=read('public/app.js');
  assert.match(app,/const change=\(remove\?1:-1\)\*Number\(row.sourceAmount\|\|0\)/);
  assert.match(app,/isExternal=String\(row.importKey\|\|''\).startsWith\('ozon:'\)/);
  assert.match(app,/financeApplyExpensePreview\(row,true\)/);
});

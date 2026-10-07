const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');

test('v4.52 planned amount is category limits minus selected-month expenses',()=>{
  assert.ok(app.includes('const plannedRemaining=Math.round((plannedLimit-actualSpent)*100)/100;'));
  assert.ok(!app.includes('plannedLimit-actualSpent+obligationPending'));
  assert.ok(app.includes("plannedTotal.title='Сумма всех лимитов категорий минус расходы за '"));
});

test('v4.52 shows yesterday expense total below categories in Moscow time',()=>{
  assert.ok(html.includes('id="financeYesterdayExpenseTotal"'));
  assert.ok(html.includes('<span>За вчера</span>'));
  assert.ok(app.includes("const yesterdayTotal=document.getElementById('financeYesterdayExpenseTotal')"));
  assert.ok(app.includes("const todayKey=now.year+'-'+now.month+'-'+now.day;"));
  assert.ok(app.includes("financeDateTimeLabel(new Date(new Date(todayKey+'T12:00:00+03:00').getTime()-86400000)).key"));
  assert.ok(css.includes('.finance-category-yesterday'));
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

function dueRows(obligations,ymd){
 const start=app.indexOf('      function financeUnpaidTodayObligations(date=new Date()){');
 const end=app.indexOf('      function financeTodayObligationCount(){',start);
 assert.ok(start>=0&&end>start);
 const state={plan:{obligations}};
 const fn=new Function('financeState','financeMoscowParts',app.slice(start,end)+'return financeUnpaidTodayObligations;');
 return fn(state,()=>({year:ymd.slice(0,4),month:ymd.slice(5,7),day:ymd.slice(8,10)}))();
}
test('only todays active unpaid obligations trigger attention',()=>{
 const rows=[
  {id:'a',day:10,active:true,paidMonths:[]},
  {id:'b',day:10,paidMonths:['2026-10']},
  {id:'c',day:11,paidMonths:[]},
  {id:'d',day:10,active:false,paidMonths:[]},
  {id:'e',day:10,paidMonths:[]},
 ];
 assert.deepEqual(dueRows(rows,'2026-10-10').map(x=>x.id),['a','e']);
 rows[0].paidMonths=['2026-10'];rows[4].paidMonths=['2026-10'];
 assert.equal(dueRows(rows,'2026-10-10').length,0);
 assert.deepEqual(dueRows(rows,'2026-10-11').map(x=>x.id),['c']);
});
test('auto expand and red badge only when todays unpaid count positive',()=>{
 assert.ok(html.includes('id="financeObligationsDueBadge"'));
 assert.ok(app.includes('dueDetails.open=true'));
 assert.ok(app.includes("dueCard?.classList.remove('is-collapsed')"));
 assert.ok(app.includes('dueBadge.hidden=count<=0'));
 assert.ok(app.includes("month===financeCurrentMonthKey()"));
 assert.ok(app.includes("is-due-today-unpaid"));
 assert.ok(css.includes(".finance-obligation-row.is-due-today-unpaid"));
 assert.ok(css.includes('.finance-obligations-due-badge[hidden]'));
});
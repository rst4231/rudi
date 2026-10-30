const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');

function fixture(){
 const dom=new JSDOM(`<div id="financeCategoryHistoryPage"></div><input id="financePersonalMonthInput" value="2026-10"><input id="financeCategoryHistoryMonthInput" value="2026-10"><h2 id="financeCategoryHistoryName"></h2><span id="financeCategoryHistoryIcon"></span><span id="financeCategoryHistoryTotalLabel"></span><b id="financeCategoryHistoryTotal"></b><div id="financeCategoryHistoryList"></div><p id="financeCategoryHistoryEmpty"></p>`);
 const rows=[
  {id:'purchase',categoryId:'food',month:'2026-10',rubAmount:120,occurredAt:'2026-10-12T10:00:00Z',label:'Обед'},
  {id:'legacy',categoryId:'food',month:'2026-10',rubAmount:80,occurredAt:'2026-10-13T10:00:00Z',manualAdjustment:true,label:'Корректировка',note:'Ручная корректировка итога'},
  {id:'other',categoryId:'other',month:'2026-10',rubAmount:500,occurredAt:'2026-10-13T10:00:00Z'},
  {id:'old',categoryId:'food',month:'2026-09',rubAmount:900,occurredAt:'2026-09-13T10:00:00Z',manualAdjustment:true}
 ];
 const date=value=>{const d=new Date(value);return {key:d.toISOString().slice(0,10),day:d.toISOString().slice(0,10),time:'13:00'}};
 const ctx=vm.createContext({document:dom.window.document,financeCategoryHistoryId:'food',financeCategoryHistorySearch:'',financeCategoryHistoryRange:null,
  financeAllCategoryById:()=>({id:'food',name:'Еда',currency:'RUB'}),financeCurrentMonthKey:()=> '2026-10',financeMonthShortName:()=> 'октябрь',
  currentActor:'Рустам',coinKeeperRows:new Map([['2026-10',[]]]),financeState:{personalExpenses:rows},
  financeDateTimeLabel:date,
  financeOverviewMoney:n=>String(n),financeMoney:n=>String(n),financeMoscowParts:()=>({year:'2026',month:'10',day:'30'}),financeOperationDayTitle:key=>key,
  financeWalletById:()=>null,animateRudiCollection:()=>{},Date});
 const src=fs.readFileSync('public/app.js','utf8');
 vm.runInContext(src.slice(src.indexOf('function financeCategoryHistorySearchText(row){'),src.indexOf('function openFinanceCategoryHistory(')),ctx);
 return {ctx,doc:dom.window.document,rows,render:()=>ctx.renderFinanceCategoryHistory()};
}

test('category history includes saved additional expenses in rows, day sums and month total',()=>{
 const f=fixture();f.render();
 assert.equal(f.doc.getElementById('financeCategoryHistoryTotal').textContent,'200');
 assert.equal(f.doc.querySelectorAll('.finance-category-history-row').length,2);
 assert.deepEqual([...f.doc.querySelectorAll('.finance-category-history-row > b')].map(n=>n.textContent),['−80','−120']);
 assert.deepEqual([...f.doc.querySelectorAll('.finance-category-history-day-head b')].map(n=>n.textContent),['−80','−120']);
 assert.equal(f.doc.querySelector('.finance-category-history-copy strong').textContent,'Расход');
 assert.equal(f.doc.querySelector('.finance-category-history-row').dataset.historyReadOnly,'true');
 assert.equal(f.doc.querySelectorAll('.finance-category-history-row')[1].dataset.expenseId,'purchase');
 assert.doesNotMatch(f.doc.getElementById('financeCategoryHistoryList').textContent,/корректиров/i);
});
test('date range includes additional expense only on its recorded date',()=>{
 const f=fixture();f.ctx.financeCategoryHistoryRange={from:'2026-10-13',to:'2026-10-13'};f.render();
 assert.equal(f.doc.getElementById('financeCategoryHistoryTotal').textContent,'80');
 assert.equal(f.doc.querySelectorAll('.finance-category-history-row').length,1);
});
test('negative saved amount has correct sign and reduces the category total',()=>{
 const f=fixture();f.rows[1].rubAmount=-20;f.render();
 assert.equal(f.doc.getElementById('financeCategoryHistoryTotal').textContent,'100');
 assert.equal(f.doc.querySelector('.finance-category-history-row > b').textContent,'+20');
 assert.equal(f.doc.querySelector('.finance-category-history-day-head b').textContent,'+20');
});
test('search can find the restored expense by its displayed name or amount',()=>{
 const f=fixture();f.ctx.financeCategoryHistorySearch='80';f.render();
 assert.equal(f.doc.getElementById('financeCategoryHistoryTotal').textContent,'80');
 assert.equal(f.doc.querySelector('.finance-category-history-copy strong').textContent,'Расход');
 assert.match(f.ctx.financeCategoryHistorySearchText(f.rows[1]),/расход/);
});

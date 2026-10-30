const {test}=require('node:test'),assert=require('node:assert/strict');
const store=require('../api/finance-store.cjs');
const fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const {limitForMonth,normalize}=require('../public/finance-category-limits.js');
const {partnerFinanceSummary}=require('../api/partner-finances.cjs');
function cache(){let value=null;return {async get(){return structuredClone(value)},async set(_k,v){value=structuredClone(v)}}}
test('next month limit survives storage without changing the current limit, expenses or another actor',async()=>{
 const financeCache=cache(),options={financeCache};
 await store.saveExpenseCategory('Рустам',{name:'Пример',monthlyLimit:1000},{...options,id:'food'});
 await store.saveExpenseCategory('Диана',{name:'Пример',monthlyLimit:700},{...options,id:'other'});
 await store.updateExpenseCategory('Рустам',{id:'food',limitMonth:'2026-11',monthlyLimit:1500},options);
 const state=await store.readFinanceState(options),row=state.categories['Рустам'].find(c=>c.id==='food');
 assert.equal(row.monthlyLimit,1000);
 assert.equal(row.monthlyLimits['2026-11'],1500);
 assert.equal(state.categories['Диана'].find(c=>c.id==='other').monthlyLimit,700);
 assert.equal(state.personalExpenses.length,0);
 assert.equal(store.viewState(state,'Рустам').categories.find(c=>c.id==='food').monthlyLimits['2026-11'],1500);
});
test('a planned limit can be cleared explicitly without removing other month plans',async()=>{
 const options={financeCache:cache()};
 await store.saveExpenseCategory('Рустам',{name:'Пример',monthlyLimit:1000},{...options,id:'food'});
 await store.updateExpenseCategory('Рустам',{id:'food',limitMonth:'2026-11',monthlyLimit:1500},options);
 await store.updateExpenseCategory('Рустам',{id:'food',limitMonth:'2026-12',monthlyLimit:2000},options);
 await store.updateExpenseCategory('Рустам',{id:'food',limitMonth:'2026-11',monthlyLimit:0},options);
 const row=(await store.readFinanceState(options)).categories['Рустам'].find(c=>c.id==='food');
 assert.deepEqual(row.monthlyLimits,{'2026-11':0,'2026-12':2000});
});
test('invalid planned month is rejected without a write',async()=>{
 const options={financeCache:cache()};
 await store.saveExpenseCategory('Рустам',{name:'Пример',monthlyLimit:1000},{...options,id:'food'});
 const before=await store.readFinanceState(options);
 await assert.rejects(store.updateExpenseCategory('Рустам',{id:'food',limitMonth:'2026-13',monthlyLimit:500},options),/month-invalid/);
 assert.deepEqual(await store.readFinanceState(options),before);
});
test('limits activate in their chosen month, carry forward, preserve history and support zero and year boundaries',()=>{
 const category={monthlyLimit:1000,monthlyLimits:{'2026-11':1500,'2027-01':0,'2027-03':800}};
 for(const [month,want] of [['2026-10',1000],['2026-11',1500],['2026-12',1500],['2027-01',0],['2027-02',0],['2027-03',800]])assert.equal(limitForMonth(category,month),want);
 assert.deepEqual(normalize({'2026-13':100,'2026-11':-1,'2026-12':'1500'}),{'2026-12':1500});
 const state={categories:{'Диана':[{...category,id:'food'}]}};
 assert.equal(partnerFinanceSummary(state,'Рустам',new Date('2026-10-31T20:59:59Z')).budget.plannedLimit,1000);
 assert.equal(partnerFinanceSummary(state,'Рустам',new Date('2026-10-31T21:00:00Z')).budget.plannedLimit,1500);
});
test('category editor offers next month and shows spending from the month preceding the selected limit',()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'));
 const doc=dom.window.document,category={id:'food',name:'Еда',monthlyLimit:1000,monthlyLimits:{'2026-11':1500}};
 doc.getElementById('financePersonalMonthInput').value='2026-10';
 const ctx=vm.createContext({document:doc,window:dom.window,financeCategoryEditingId:'',
  financeCategoryById:()=>category,financeCurrentMonthKey:()=> '2026-10',financeMonthTitle:m=>m,
  financeCategoryLimitForMonth:(row,month)=>month>='2026-11'?1500:1000,
  financePreviousMonthKey:m=>m==='2026-11'?'2026-10':'2026-09',
  financeCategorySpent:(_id,m)=>m==='2026-10'?120:80,financeOverviewMoney:n=>n+' ₽',
  mountFinanceCoinModal:()=>{},currentActor:'Диана',Date});
 const source=fs.readFileSync('public/app.js','utf8');
 vm.runInContext(source.slice(source.indexOf('function openFinanceCategoryComposer('),source.indexOf('function financeMonthFromOccurredAt(')),ctx);
 ctx.openFinanceCategoryComposer('food');
 const month=doc.getElementById('financeCategoryLimitMonth'),hint=doc.getElementById('financeCategoryPreviousSpent');
 assert([...month.options].some(o=>o.value==='2026-11'));
 assert.equal(doc.getElementById('financeCategoryLimit').value,'1000');
 assert.match(hint.textContent,/2026-09.*80 ₽/);
 month.value='2026-11';month.dispatchEvent(new dom.window.Event('change'));
 assert.equal(doc.getElementById('financeCategoryLimit').value,'1500');
 assert.match(hint.textContent,/2026-10.*120 ₽/);
 assert.equal(doc.getElementById('financeCategorySpent').value,'120');
});
test('saving a next-month limit sends its month without rewriting unchanged current spending',async()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8')),doc=dom.window.document;
 doc.getElementById('financeCategoryComposer').dataset.expenseMonth='2026-10';
 doc.getElementById('financeCategoryName').value='Еда';doc.getElementById('financeCategoryLimit').value='1500';doc.getElementById('financeCategorySpent').value='120';
 const option=doc.createElement('option');option.value='2026-11';doc.getElementById('financeCategoryLimitMonth').append(option);
 let saved,rendered=false;
 const ctx=vm.createContext({document:doc,financeCategoryEditingId:'food',personalMonth:{value:'2026-10'},financeCurrentMonthKey:()=> '2026-10',
  financeCategorySpent:()=>120,financeRequest:async(operation,payload)=>{saved={operation,...payload};return {}},closeFinanceCoinModal:()=>{},renderFinanceState:()=>{rendered=true}});
 const source=fs.readFileSync('public/app.js','utf8');
 vm.runInContext(source.slice(source.indexOf("const categoryCreate=document.getElementById('financeCategoryCreateButton');"),source.indexOf("document.getElementById('financeBalanceCurrencyButton')?.addEventListener")),ctx);
 doc.getElementById('financeCategoryCreateButton').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saved.operation,'update-category');assert.equal(saved.limitMonth,'2026-11');assert.equal(saved.monthlyLimit,1500);
 assert.equal(saved.month,'2026-10');assert.equal(Object.hasOwn(saved,'spent'),false);assert.equal(rendered,true);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const core=fs.existsSync('public/finance-monthly-plan-core.js')?require('../public/finance-monthly-plan-core.js'):{};
const now='2026-11-03T12:00:00Z';
function fixture(){return {actor:'Рустам',version:1,categories:[{id:'housing',name:'Жильё',currency:'RUB',monthlyLimit:21000},{id:'food',name:'Продукты',currency:'RUB',monthlyLimit:12000},{id:'fun',name:'Досуг',currency:'RUB',monthlyLimit:3000}],personalExpenses:[
 {id:'rent',month:'2026-10',categoryId:'housing',rubAmount:21000,note:'Жильё',occurredAt:'2026-10-01T09:00:00Z'},
 {id:'food',month:'2026-10',categoryId:'food',rubAmount:10000,occurredAt:'2026-10-12T09:00:00Z'},
 {id:'fun',month:'2026-10',categoryId:'fun',rubAmount:2000,occurredAt:'2026-10-12T09:00:00Z'}],walletIncomes:[{month:'2026-10',rubAmount:50000}],wallets:[{currency:'RUB',type:'regular',balance:5000}],plan:{expectedMonthlyIncome:50000,expectedIncomeDay:10,obligations:[{id:'rent',title:'Жильё',amount:21000,amountByMonth:{'2026-10':21000,'2026-11':21000},day:1,active:true,paidMonths:[]}]}}}
test('next month uses actual history, carries housing and counts fixed expenses once',()=>{
 assert.equal(typeof core.build,'function');const p=core.build(fixture(),now);
 assert.equal(p.month,'2026-12');assert.equal(p.income.amount,50000);assert.equal(p.fixedTotal,21000);
 assert.deepEqual(p.categories.map(c=>[c.id,c.limit]),[['housing',21000],['food',11000],['fun',2200]]);
 assert.equal(p.variableTotal,13200);assert.equal(p.total,34200);assert.equal(p.remaining,15800);assert.equal(p.historyMonths.length,1);
 assert.equal(p.obligations[0].estimated,true);
});
test('proposed discretionary limits fit income after bills and expose the habitual deficit',()=>{
 assert.equal(typeof core.build,'function');const s=fixture();s.plan.expectedMonthlyIncome=25000;const p=core.build(s,now);
 assert.ok(p.total<=25000);assert.equal(p.fixedTotal,21000);assert.equal(p.habitualDeficit,9200);
});
test('an explicit target-month manual limit stays intact, including zero',()=>{
 assert.equal(typeof core.build,'function');const s=fixture();s.categories[1].monthlyLimits={'2026-12':0};const p=core.build(s,now);
 const food=p.categories.find(c=>c.id==='food');assert.equal(food.limit,0);assert.equal(food.locked,true);
});
test('native currency proposal uses known FX, never treats USD as RUB',()=>{
 assert.equal(typeof core.build,'function');const s=fixture();s.categories=[{id:'food',name:'Продукты',currency:'USD',monthlyLimit:100}];s.personalExpenses=[{id:'x',month:'2026-10',categoryId:'food',rubAmount:9000}];s.plan.obligations=[];
 assert.equal(core.build(s,now,{rates:{USD:90}}).categories[0].limit,110);
 const unknown=core.build(s,now);assert.equal(unknown.categories[0].limit,null);assert.equal(unknown.total,null);assert.equal(unknown.canApply,false);
});
test('empty income/history stays unknown and cannot create arbitrary limits',()=>{
 assert.equal(typeof core.build,'function');const p=core.build({version:1,categories:[{id:'x',name:'Еда',currency:'RUB'}],plan:{}},now);
 assert.equal(p.income.amount,null);assert.equal(p.remaining,null);assert.equal(p.canApply,false);assert.equal(p.cashflow.firstShortfall,null);
});
test('Moscow month/year rollover prepares the following month',()=>{
 assert.equal(typeof core.build,'function');assert.equal(core.build(fixture(),'2026-12-31T21:01:00Z').month,'2027-02');
});
test('bill before payday is flagged even if monthly income covers it; paid bills are skipped',()=>{
 assert.equal(typeof core.build,'function');const s={version:1,categories:[],wallets:[{currency:'RUB',balance:5000,type:'regular'}],plan:{expectedMonthlyIncome:10000,expectedIncomeDay:20,plannedMonthlyVariableExpenses:0,obligations:[{id:'rent',title:'Аренда',amount:10000,day:5,paidMonths:['2026-11']}]}};
 const at='2026-11-21T12:00:00Z',p=core.build(s,at);assert.deepEqual(p.cashflow.firstShortfall,{date:'2026-12-05',amount:5000});
 s.plan.obligations[0].paidMonths.push('2026-12');assert.equal(core.build(s,at).cashflow.firstShortfall,null);
});
test('missing income day disables dated forecast instead of assuming payday',()=>{
 assert.equal(typeof core.build,'function');const s=fixture();delete s.plan.expectedIncomeDay;const p=core.build(s,now);
 assert.equal(p.cashflow.firstShortfall,null);assert.ok(p.cashflow.missing.length);
});
test('archived monthly expenses complement native history, transfers are not income',()=>{
 assert.equal(typeof core.build,'function');const s=fixture();s.plan.obligations=[];s.personalExpenses=[{id:'sep',month:'2026-09',categoryId:'food',rubAmount:10000}];s.walletTransfers=[{month:'2026-10',rubAmount:500000}];s.plan.expectedMonthlyIncome=null;s.walletIncomes=[];
 const p=core.build(s,now,{archive:{'2026-09':{count:1,unknownRub:0,categories:{food:{total:10000,count:1}}}}});
 assert.equal(p.categories.find(c=>c.id==='food').limit,22000);assert.equal(p.income.amount,null);
});
test('real CoinKeeper import excludes native day overlaps while the planner retains both histories',async()=>{
 const archive=require('../api/coinkeeper-history.cjs'),store=require('../api/finance-store.cjs');
 const state=store.normalizeState({initialized:true,categories:{'Рустам':[{id:'food',name:'Продукты',currency:'RUB'}]},personalExpenses:[{id:'native',actor:'Рустам',month:'2026-09',categoryId:'food',amount:10000,rubAmount:10000,occurredAt:'2026-09-10T12:00:00Z'}]});
 const values=new Map(),cache={get:async key=>values.get(key),set:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key)};
 const row=(date,id,amount)=>({type:'expense',date,categoryId:'food',amount,currency:'RUB',importKey:'ckhistory:planner:'+id});
 const imported=await archive.importBatch('Рустам',[row('2026-09-10',1,10000),row('2026-09-11',2,2000)],{state,cache});
 assert.equal(imported.matchedSeptember,1);assert.equal(imported.imported,1);
 const overview=archive.archiveOverviewFromRows([{key:'rustam:2026-09',value:values.get('rustam:2026-09')}]);
 const p=core.build({...store.viewState(state,'Рустам'),actor:'Рустам'},now,{archive:overview.months});
 assert.equal(p.categories.find(c=>c.id==='food').limit,13200);assert.deepEqual(p.historyMonths,['2026-09']);
});
test('a tight budget can propose and accept zero variable limits without inventing an empty plan',()=>{const s=fixture();s.plan.expectedMonthlyIncome=21000;const p=core.build(s,now);assert.equal(p.categories.find(c=>c.id==='food').limit,0);assert.equal(p.total,21000);assert.equal(p.canApply,true)});

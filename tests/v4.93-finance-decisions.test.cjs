'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../public/finance-decisions-core.js');
const date=new Date(2026,9,8,12);
const base={wallets:[{currency:'RUB',balance:100000,type:'regular'}],plan:{reserve:20000,obligations:[]},personalExpenses:[],walletIncomes:[],categories:[]};
test('forecast without history separates certainty',()=>{const f=core.forecast(base,date,30);assert.equal(f.opening,100000);assert.equal(f.estimated,false)});
test('planned payment counted once',()=>{const s={...base,plan:{reserve:20000,obligations:[{id:'rent',title:'Rent',amount:35000,day:9,paidMonths:[]}]}};assert.equal(core.forecast(s,date,7).scheduledTotal,35000)});
test('paid monthly payment excluded',()=>{const s={...base,plan:{reserve:20000,obligations:[{id:'rent',title:'Rent',amount:35000,day:9,paidMonths:['2026-10']}]}};assert.equal(core.forecast(s,date,7).scheduledTotal,0)});
test('goal monthly contribution and reserve',()=>{const s={...base,plan:{reserve:95000,goalTarget:200000,goalCurrent:50000,goalMonthlyContribution:10000}};const g=core.goal(s,date);assert.equal(g.timeMonths,15);assert.equal(g.safe,false)});
test('mortgage annuity zero rate',()=>{const a=core.simulate('mortgage',{cost:2400000,down:0,years:20,rate:0,rent:9000},base,date);assert.equal(a.main,10000)});

test('weekly spending chart starts Monday, ends Sunday and uses Moscow operation dates',()=>{
 const state={personalExpenses:[
  {occurredAt:'2026-10-04T21:30:00Z',rubAmount:100}, // Monday 00:30 Moscow
  {occurredAt:'2026-10-05T07:00:00Z',amount:50,rubAmount:60},
  {occurredAt:'2026-10-11T17:30:00Z',rubAmount:120},
  {occurredAt:'2026-10-11T22:30:00Z',rubAmount:999}, // next Monday Moscow
  {occurredAt:'2026-10-11T17:30:00Z',rubAmount:1000,manualAdjustment:true}
 ]};
 const week=core.weeklyExpenses(state,new Date(2026,9,11,12));
 assert.equal(week.from,'2026-10-05');
 assert.equal(week.to,'2026-10-11');
 assert.deepEqual(week.days.map(day=>day.label),['пн','вт','ср','чт','пт','сб','вс']);
 assert.deepEqual(week.days.map(day=>day.total),[160,0,0,0,0,0,120]);
 assert.equal(week.total,280);
});
test('weekly graph covers month change and keeps empty days at zero',()=>{
 const week=core.weeklyExpenses({personalExpenses:[
  {occurredAt:'2026-10-30T11:00:00Z',rubAmount:5858},
  {occurredAt:'2026-11-01T09:00:00Z',rubAmount:993},
  {occurredAt:'2026-10-26T09:00:00Z',rubAmount:15,manualAdjustment:true},
  {occurredAt:'2026-11-02T09:00:00Z',rubAmount:1000}
 ]},new Date(2026,10,1,12));
 assert.equal(week.from,'2026-10-26');
 assert.equal(week.to,'2026-11-01');
 assert.deepEqual(week.days.map(day=>day.total),[0,0,0,0,5858,0,993]);
});
test('weekly finance chart mounts before where-money-goes and hides duplicate daily header amounts',()=>{
 const fs=require('node:fs');
 const ui=fs.readFileSync('public/finance-decisions-ui.js','utf8');
 const html=fs.readFileSync('public/index.html','utf8');
 const css=fs.readFileSync('public/finance-decisions.css','utf8');
 assert.ok(ui.indexOf('id="rudiWeeklyBars"')<ui.indexOf('id="rudiAlertsHeading"'));
 assert.match(ui,/renderWeeklyExpenses\(\)/);
 assert.match(ui,/core\.weeklyExpenses\(snapshot,nowMoscow\(\)\)/);
 assert.match(ui,/financeBalanceEyeButton/);
 assert.doesNotMatch(html,/class="finance-category-yesterday"/);
 assert.match(css,/\.rudi-weekly-bar/);
});

test('monthly and yearly expenses are grouped by Moscow calendar without fake values',()=>{
 const state={personalExpenses:[
 {occurredAt:'2026-10-04T21:30:00Z',rubAmount:100},
 {occurredAt:'2026-10-11T17:00:00Z',rubAmount:200},
 {occurredAt:'2026-10-11T22:30:00Z',rubAmount:250},
 {occurredAt:'2026-09-30T12:00:00Z',rubAmount:500},
 {occurredAt:'2026-10-09T12:00:00Z',rubAmount:500,manualAdjustment:true}]};
 const now=new Date(2026,9,11,12);
 const w=core.expensePeriod(state,now,'week');assert.equal(w.total,300);assert.equal(w.buckets.length,7);
 const m=core.expensePeriod(state,now,'month');
 assert.equal(m.from,'2026-10-01');assert.equal(m.to,'2026-10-31');
 assert.deepEqual(m.buckets.map(x=>x.total),[0,300,250,0,0]);
 assert.equal(m.total,550);
 const y=core.expensePeriod(state,now,'year');
 assert.equal(y.buckets.length,12);assert.equal(y.buckets[8].total,500);
 assert.equal(y.buckets[9].total,550);assert.equal(y.total,1050);
});
test('financial insight cards use stable IDs and all three expense scales exist',()=>{
 const fs=require('node:fs'),css=fs.readFileSync('public/finance-cards.css','utf8');
 const js=fs.readFileSync('public/finance-decisions-ui.js','utf8');
 assert.match(js,/id="rudiAlertsCard"/);assert.match(js,/id="rudiScenarioCard"/);
 assert.match(js,/data-rudi-expense-period="month"/);
 assert.match(js,/data-rudi-expense-period="year"/);
 assert.match(css,/#financePersonalPanel #rudiAlertsCard/);
 assert.match(css,/#financePersonalPanel #rudiScenarioCard/);
 assert.doesNotMatch(css,/\.rudi-decision-card:(first-child|nth-child)/);
});

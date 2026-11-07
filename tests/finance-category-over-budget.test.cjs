const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
const renderStart=source.indexOf('function financeCategoryOutlineIcon(category){');
const renderEnd=source.indexOf('function financeCsvEscape(',renderStart);
const percentStart=source.indexOf('function financePercent(value){');
const percentEnd=source.indexOf('function financeMonthTitle(',percentStart);
assert.ok(renderStart>=0&&renderEnd>renderStart&&percentStart>=0&&percentEnd>percentStart);
class Element{
 constructor(){
  this.children=[];this.className='';this.dataset={};this.textContent='';this.style={setProperty(){}};
  this.classList={add:name=>this.toggle(name,true),toggle:(name,on)=>this.toggle(name,on)};
 }
 toggle(name,on){const names=new Set(this.className.split(/\s+/).filter(Boolean));on?names.add(name):names.delete(name);this.className=[...names].join(' ');}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(name,value){this[name]=value;}
 addEventListener(){}
}
function render({spent,limit=1000,rate=1,hidden=false}){
 const list=new Element();
 const context={
  document:{getElementById:id=>id==='financeCategoryList'?list:null,createElement:()=>new Element()},
  financeState:{categories:[{id:'food',name:'Еда',currency:'USD'}]},
  financeExpensesForMonth:()=>[],financeCategorySpent:()=>spent,
  financeCategoryLimitForMonth:()=>limit,financeAmountToRub:value=>value*rate,
  financeBalanceHidden:hidden,financeOverviewMoney:String,financeDisplayMoney:String,
  financeCategoryMonthTrend:()=>({direction:'down',text:'↓ 75%',previousMonth:'2026-10'}),
  financeMonthTitle:String,bindFinanceCategoryInteractions(){},animateRudiCollection(){},
  financeCategoryEditMode:false,bindFinanceIncomeDrag(){}
 };
 new Function(...Object.keys(context),source.slice(percentStart,percentEnd)+source.slice(renderStart,renderEnd)+';renderFinanceCategories("2026-11");')(...Object.values(context));
 return list.children[0].children.filter(el=>el.className.split(/\s+/).includes('finance-category-trend'));
}
for(const [name,input] of [
 ['below limit',{spent:750}],
 ['exactly at limit',{spent:1000}],
 ['zero spending',{spent:0}],
 ['without a limit',{spent:5000,limit:0}],
 ['without a currency rate',{spent:2000,rate:NaN}],
 ['hidden balances',{spent:1500,hidden:true}],
 ['invalid spending',{spent:NaN}],
])test('category percentage is absent '+name,()=>assert.equal(render(input).length,0));
test('over-limit category shows a red percentage against its budget',()=>{
 const rows=render({spent:1250});
 assert.equal(rows.length,1);assert.equal(rows[0].className,'finance-category-trend is-up');
 assert.equal(rows[0].textContent,'↑ 25%');
 assert.equal(rows[0].title,'Перерасход относительно лимита категории');
});
test('over-limit percentage uses the converted category limit',()=>{
 const rows=render({spent:600,limit:10,rate:50});
 assert.equal(rows.length,1);assert.equal(rows[0].textContent,'↑ 20%');
});
test('small over-limit amounts do not misleadingly show zero percent',()=>{
 const rows=render({spent:300.04,limit:299.99});
 assert.equal(rows.length,1);assert.equal(rows[0].textContent,'↑ <0,1%');
});

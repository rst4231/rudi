'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/car.js','utf8');
const start=source.indexOf('  const CAR_EXPENSE_LABELS=');
const end=source.indexOf('  function carExpenseDateTime(',start);
assert.ok(start>=0&&end>start,'car expenses helper must exist');
const {CAR_EXPENSE_LABELS,carExpenseGroups}=vm.runInNewContext(source.slice(start,end)+'\n({CAR_EXPENSE_LABELS,carExpenseGroups})');

test('transport wash-tag expenses appear in car spending by month without double counting',()=>{
  assert.ok(Array.from(CAR_EXPENSE_LABELS).includes('Мойка'));
  const finances={
    categories:[{id:'transport',name:'Транспорт'},{id:'other',name:'Развлечения'}],
    archivedCategories:[{id:'old-transport',name:'Транспорт'}],
    personalExpenses:[
      {id:'wash',categoryId:'transport',label:' Мойка ',amount:850,month:'2026-10',occurredAt:'2026-10-15T12:00:00Z'},
      {id:'petrol',categoryId:'transport',label:'Бензин',amount:1500,rubAmount:1600,month:'2026-10',occurredAt:'2026-10-14T12:00:00Z'},
      {id:'unrelated',categoryId:'other',label:'Мойка',amount:700,month:'2026-10',occurredAt:'2026-10-13T12:00:00Z'},
      {id:'old-wash',categoryId:'old-transport',label:'МОЙКА',amount:650,month:'2026-09',occurredAt:'2026-09-20T12:00:00Z'},
      {id:'refund',categoryId:'transport',label:'Мойка',amount:-100,month:'2026-10',occurredAt:'2026-10-12T12:00:00Z'}
    ]
  };
  const groups=JSON.parse(JSON.stringify(carExpenseGroups(finances)));
  assert.deepEqual(groups.map(({month,total})=>({month,total})),[
    {month:'2026-10',total:2450},
    {month:'2026-09',total:650}
  ]);
  assert.deepEqual(groups[0].operations.map(row=>row.label),['Мойка','Бензин']);
  assert.deepEqual(groups[1].operations.map(row=>row.label),['Мойка']);
  assert.deepEqual(groups[0].categoryTotals,[{label:'Бензин',total:1600},{label:'Мойка',total:850}]);
  assert.deepEqual(groups[1].categoryTotals,[{label:'Мойка',total:650}]);
});

test('monthly category totals combine repeated labels and match the month total',()=>{
  const finance={categories:[{id:'transport',name:'Транспорт'}],personalExpenses:[
    ...[1499,2000,2036].map(amount=>({categoryId:'transport',label:'Бензин',amount,month:'2026-10'})),
    {categoryId:'transport',label:'Мойка',amount:180,month:'2026-10'},
    {categoryId:'transport',label:' страховка ',amount:12085.34,month:'2026-10'},
    {categoryId:'transport',label:'Бензин',amount:6800,month:'2026-09'},
    {categoryId:'transport',label:'Паркинг',amount:360,month:'2026-09'},
  ]};
  const groups=JSON.parse(JSON.stringify(carExpenseGroups(finance)));
  assert.deepEqual(groups[0].categoryTotals,[{label:'Бензин',total:5535},{label:'Мойка',total:180},{label:'Страховка',total:12085.34}]);
  assert.deepEqual(groups[1].categoryTotals,[{label:'Бензин',total:6800},{label:'Паркинг',total:360}]);
  for(const group of groups) assert.equal(Math.round(group.categoryTotals.reduce((sum,row)=>sum+row.total,0)*100)/100,group.total);
});

test('empty-state description includes car wash expenses',()=>{
  assert.match(source,/Расходов по меткам[^']*Мойка/);
});

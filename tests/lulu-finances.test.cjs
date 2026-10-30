const test=require('node:test'),assert=require('node:assert/strict');
const {luluFinanceSummary}=require('../api/partner-finances.cjs');
test('dog food summary includes Diana current-month purchases only, using RUB totals',()=>{
 const base={actor:'Диана',month:'2026-10',categoryId:'pets',amount:300,rubAmount:300,occurredAt:'2026-10-30T09:00:00Z'};
 const state={categories:{'Диана':[{id:'pets',name:'Лулу'},{id:'other',name:'Продукты'},{id:'food',name:'Корм для собаки',archived:true}]},personalExpenses:[
  {...base,id:'1',label:'Корм'}, {...base,id:'2',note:'Корм для Лулу',amount:10,sourceCurrency:'USD',rubAmount:900},
  {...base,id:'3',categoryId:'food',rubAmount:500}, {...base,id:'4',label:'Ветеринар'},
  {...base,id:'5',label:'Корм',actor:'Рустам'}, {...base,id:'6',label:'Корм',month:'2026-09'},
  {...base,id:'7',label:'Корм',manualAdjustment:true}, {...base,id:'8',categoryId:'other',note:'Корм для кошки'},
  {...base,id:'9',categoryId:'other',note:'Корм для Лулу',rubAmount:100},
  {...base,id:'10',categoryId:'other',note:'Кормление в кафе',rubAmount:100},
 ]};
 const result=luluFinanceSummary(state,new Date('2026-10-30T12:00:00Z'));
 assert.equal(result.totalRub,2100);assert.equal(result.month,'2026-10');assert.equal(result.transactions.length,5);
 assert.ok(result.transactions.every(row=>row.actor==='Диана'));assert.equal(result.currency,'RUB');
});
test('empty month and Moscow month boundary do not include old food purchases',()=>{
 const result=luluFinanceSummary({personalExpenses:[{actor:'Диана',month:'2026-10',note:'Корм для Лулу',amount:500}]},new Date('2026-10-31T21:01:00Z'));
 assert.equal(result.totalRub,0);assert.deepEqual(result.transactions,[]);assert.equal(result.month,'2026-11');
});
test('veterinary expenses are grouped separately and included in overall total',()=>{
 const state={categories:{'Диана':[{id:'lulu',name:'Лулу'},{id:'vet',name:'Ветеринария'}]},personalExpenses:[
  {id:'food',actor:'Диана',month:'2026-10',categoryId:'lulu',label:'Корм',amount:1500,rubAmount:1500},
  {id:'vet',actor:'Диана',month:'2026-10',categoryId:'vet',note:'Прививка Лулу',amount:2500,rubAmount:2500},
  {id:'vet2',actor:'Диана',month:'2026-10',categoryId:'lulu',label:'Ветеринар',amount:1000,rubAmount:1000},
 ]};const result=luluFinanceSummary(state,new Date('2026-10-30T12:00:00Z'));
 assert.equal(result.totalRub,5000);assert.equal(result.foodRub,1500);assert.equal(result.vetRub,3500);assert.equal(result.transactions[1].kind,'vet');
});
test('all Diana Lulu category expenses count even without labels or descriptions',()=>{
 const state={categories:{'Диана':[{id:'pet-category',name:'Лулу'},{id:'other-category',name:'Покупки'}]},personalExpenses:[
  {actor:'Диана',month:'2026-10',categoryId:'pet-category',id:'blank',amount:103,note:'',label:''},
  {actor:'Диана',month:'2026-10',categoryId:'pet-category',id:'toy',amount:208,note:'Игрушка',label:''},
  {actor:'Диана',month:'2026-10',categoryId:'other-category',id:'unrelated',amount:900},
  {actor:'Рустам',month:'2026-10',categoryId:'pet-category',id:'another-actor',amount:800},
  {actor:'Диана',month:'2026-09',categoryId:'pet-category',id:'old-month',amount:700},
  {actor:'Диана',month:'2026-10',categoryId:'pet-category',id:'adjustment',amount:600,manualAdjustment:true},
 ]};const result=luluFinanceSummary(state,new Date('2026-10-30T12:00:00Z'));
 assert.equal(result.totalRub,311);assert.equal(result.otherRub,311);assert.equal(result.foodRub,0);assert.equal(result.vetRub,0);
 assert.equal(result.transactions.length,2);assert.ok(result.transactions.every(row=>row.kind==='other'));
 assert.equal(result.transactions.find(row=>row.id==='blank').note,'Расход на Лулу');
});

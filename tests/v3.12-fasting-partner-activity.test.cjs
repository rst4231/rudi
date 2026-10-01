const test=require('node:test');
const assert=require('node:assert/strict');
const {activityItemsForActor}=require('../api/partner-message.js');

const rows=[
  {id:'r-stop',type:'fasting-stop',actor:'Рустам',text:'Рустам завершил голодание'},
  {id:'d-stop',type:'fasting-stop',actor:'Диана',text:'Диана завершила голодание'},
  {id:'r-start',type:'fasting-start',actor:'Рустам',text:'Рустам начал голодание'},
  {id:'wish',type:'wishlist',actor:'Рустам',text:'Рустам добавил желание'},
];

test('fasting completion is hidden from the person who completed it',()=>{
  const rustam=activityItemsForActor(rows,'Рустам');
  assert.equal(rustam.some(row=>row.id==='r-stop'),false);
  assert.equal(rustam.some(row=>row.id==='d-stop'),true);

  const diana=activityItemsForActor(rows,'Диана');
  assert.equal(diana.some(row=>row.id==='d-stop'),false);
  assert.equal(diana.some(row=>row.id==='r-stop'),true);
});

test('filter changes only fasting completion events',()=>{
  const rustam=activityItemsForActor(rows,'Рустам');
  assert.equal(rustam.some(row=>row.id==='r-start'),true);
  assert.equal(rustam.some(row=>row.id==='wish'),true);
});

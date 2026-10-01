const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
  addCarError,
  repairCarError,
  readCarState,
  normalizeRepairArchive,
}=require('../api/car-store.cjs');

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function memoryCache(initial=null){
  let value=clone(initial);
  return {
    async get(){return clone(value)},
    async set(_key,next){value=clone(next);return true},
    clear(){value=null},
  };
}
function memoryDb(initial=null){
  let value=clone(initial);
  return {
    async read(){return clone(value)},
    async write(next){value=clone(next);return clone(value)},
  };
}

test('repair cost is stored durably in rubles and survives reload',async()=>{
  const cache=memoryCache(),db=memoryDb();
  const added=await addCarError({
    title:'Торшер колеса',
    occurredAt:'2026-10-01T06:00:00.000Z',
    comment:'Тест ремонта',
  },{cache,db,now:'2026-10-01T06:01:00.000Z'});
  const repaired=await repairCarError(added.error.id,{
    cache,db,now:'2026-10-01T06:30:00.000Z',repairCost:4500,
  });
  assert.equal(repaired.repaired.repairCost,4500);
  assert.equal(repaired.state.repairArchive[0].repairCost,4500);
  cache.clear();
  const reloaded=await readCarState({cache,db});
  assert.equal(reloaded.repairArchive[0].repairCost,4500);
});

test('old repair archive entries remain valid without a cost',()=>{
  const archive=normalizeRepairArchive([{
    id:'err_12345678',
    title:'Старый ремонт',
    occurredAt:'2026-09-01T10:00:00.000Z',
    createdAt:'2026-09-01T10:00:00.000Z',
    repairedAt:'2026-09-02T10:00:00.000Z',
  }]);
  assert.equal(archive.length,1);
  assert.equal(archive[0].repairCost,null);
});

test('car repair UI asks for ruble cost after repaired and renders it in archive',()=>{
  const js=fs.readFileSync('public/car.js','utf8');
  const css=fs.readFileSync('public/car.css','utf8');
  const client=fs.readFileSync('api/car-client.cjs','utf8');
  assert.match(js,/Сумма ремонта, ₽/);
  assert.match(js,/api\('repair-error',\{errorId:error\.id,repairCost\}\)/);
  assert.match(js,/Intl\.NumberFormat\('ru-RU'\)\.format\(repairCost\)\+' ₽'/);
  assert.match(css,/\.car-repair-cost-editor/);
  assert.match(client,/repairCarError\(body\.errorId,\{repairCost:body\.repairCost\}\)/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeState,
  readCarState,
  addCarError,
  removeCarError,
  repairCarError,
  writeMileage,
} = require('../api/car-store.cjs');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createMemoryCache(initial = null) {
  let value = clone(initial);
  return {
    async get() { return clone(value); },
    async set(_key,next) { value = clone(next); return true; },
    clear() { value = null; },
    read() { return clone(value); },
  };
}

function createMemoryDb(initial = null) {
  let value = clone(initial);
  return {
    async read() { return clone(value); },
    async write(next) { value = clone(next); return clone(value); },
    readRaw() { return clone(value); },
  };
}

test('legacy car state keeps mileage timestamp and starts with empty errors', () => {
  const state = normalizeState({
    mileage:42150,
    updatedAt:'2026-09-27T10:00:00.000Z',
  });
  assert.equal(state.mileage,42150);
  assert.equal(state.mileageUpdatedAt,'2026-09-27T10:00:00.000Z');
  assert.deepEqual(state.errors,[]);
  assert.deepEqual(state.repairArchive,[]);
});

test('dashboard errors persist in durable DB after runtime cache is cleared', async () => {
  const cache = createMemoryCache({
    mileage:42150,
    updatedAt:'2026-09-27T10:00:00.000Z',
  });
  const db = createMemoryDb();

  const added = await addCarError({
    title:'Check Engine',
    occurredAt:'2026-09-27T11:15:00.000Z',
    comment:'После перехода Eco → Normal и нажатия газа',
  },{
    cache,
    db,
    now:'2026-09-27T11:20:00.000Z',
  });

  assert.equal(added.state.mileage,42150);
  assert.equal(added.state.errors.length,1);
  assert.equal(db.readRaw().errors[0].title,'Check Engine');

  cache.clear();
  const reloaded = await readCarState({cache,db});
  assert.equal(reloaded.mileage,42150);
  assert.equal(reloaded.errors.length,1);
  assert.equal(reloaded.errors[0].comment,'После перехода Eco → Normal и нажатия газа');

  const mileageState = await writeMileage(42200,{
    cache,
    db,
    now:'2026-09-27T12:00:00.000Z',
  });
  assert.equal(mileageState.mileage,42200);
  assert.equal(mileageState.errors.length,1);

  cache.clear();
  const afterMileageReload = await readCarState({cache,db});
  assert.equal(afterMileageReload.mileage,42200);
  assert.equal(afterMileageReload.errors.length,1);

  const removed = await removeCarError(added.error.id,{
    cache,
    db,
    now:'2026-09-27T12:30:00.000Z',
  });
  assert.deepEqual(removed.state.errors,[]);

  cache.clear();
  const afterRemoveReload = await readCarState({cache,db});
  assert.equal(afterRemoveReload.mileage,42200);
  assert.deepEqual(afterRemoveReload.errors,[]);
});

test('car UI contains add, date/time, comment and remove flows', () => {
  const root = path.join(__dirname,'..');
  const html = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const js = fs.readFileSync(path.join(root,'public/car.js'),'utf8');
  assert.match(html,/id="carErrorsTitle"/);
  assert.match(html,/id="carErrorOccurredAt" type="datetime-local"/);
  assert.match(html,/id="carErrorComment"/);
  assert.match(js,/api\('add-error'/);
  assert.match(js,/api\('remove-error'/);
  assert.match(js,/После чего началось:/);
});


test('repaired car issue moves into durable archive', async () => {
  const cache=createMemoryCache();
  const db=createMemoryDb();
  const added=await addCarError({
    title:'Стук в подвеске',
    occurredAt:'2026-09-30T08:00:00.000Z',
    comment:'Слышно справа',
  },{cache,db,now:'2026-09-30T08:05:00.000Z'});

  const repaired=await repairCarError(added.error.id,{
    cache,db,now:'2026-09-30T09:00:00.000Z'
  });
  assert.equal(repaired.state.errors.length,0);
  assert.equal(repaired.state.repairArchive.length,1);
  assert.equal(repaired.state.repairArchive[0].title,'Стук в подвеске');

  cache.clear();
  const reloaded=await readCarState({cache,db});
  assert.equal(reloaded.errors.length,0);
  assert.equal(reloaded.repairArchive.length,1);
});

test('repair UI exposes repaired archive flow',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'public/car.js'),'utf8');
  assert.match(html,/id="carErrorsTitle">Требует ремонт/);
  assert.match(js,/buildCarSmartCard\('errors','Требует ремонт'/);
  assert.match(js,/api\('repair-error'/);
  assert.match(js,/car-error-repair/);
  assert.match(js,/car-repair-archive/);
  assert.match(js,/Починил/);
  assert.match(js,/Удалить/);
});

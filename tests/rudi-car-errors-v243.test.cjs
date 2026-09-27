const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeState,
  addCarError,
  removeCarError,
  writeMileage,
} = require('../api/car-store.cjs');

function createMemoryCache(initial = null) {
  let value = initial == null ? null : JSON.parse(JSON.stringify(initial));
  return {
    async get() {
      return value == null ? null : JSON.parse(JSON.stringify(value));
    },
    async set(_key,next) {
      value = JSON.parse(JSON.stringify(next));
      return true;
    },
    read() {
      return value == null ? null : JSON.parse(JSON.stringify(value));
    },
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
});

test('dashboard errors are durable, preserve mileage and can be removed', async () => {
  const cache = createMemoryCache({
    mileage:42150,
    updatedAt:'2026-09-27T10:00:00.000Z',
  });

  const added = await addCarError({
    title:'Check Engine',
    occurredAt:'2026-09-27T11:15:00.000Z',
    comment:'После перехода Eco → Normal и нажатия газа',
  },{
    cache,
    now:'2026-09-27T11:20:00.000Z',
  });

  assert.equal(added.state.mileage,42150);
  assert.equal(added.state.mileageUpdatedAt,'2026-09-27T10:00:00.000Z');
  assert.equal(added.state.errors.length,1);
  assert.equal(added.state.errors[0].title,'Check Engine');
  assert.match(added.state.errors[0].id,/^err_[a-f0-9]{32}$/);

  const mileageState = await writeMileage(42200,{
    cache,
    now:'2026-09-27T12:00:00.000Z',
  });
  assert.equal(mileageState.mileage,42200);
  assert.equal(mileageState.mileageUpdatedAt,'2026-09-27T12:00:00.000Z');
  assert.equal(mileageState.errors.length,1);

  const removed = await removeCarError(added.error.id,{
    cache,
    now:'2026-09-27T12:30:00.000Z',
  });
  assert.equal(removed.state.mileage,42200);
  assert.deepEqual(removed.state.errors,[]);
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

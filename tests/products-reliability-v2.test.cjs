const test = require('node:test');
const assert = require('node:assert/strict');
const durable = require('../api/products-durable-state.cjs');
const state = require('../api/products-state.cjs');

function fakeCache(delay = 0, initial = {}) {
  const values = new Map(Object.entries(initial));
  const pause = () => delay ? new Promise((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
  return {
    values,
    async get(key) { await pause(); return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { await pause(); values.set(key, structuredClone(value)); },
    async delete(key) { await pause(); values.delete(key); },
  };
}

test('empty durable initialization stays empty and is marked initialized', async () => {
  const cache = fakeCache();
  assert.deepEqual(await durable.ensureInitialized([], { cache, settleMs: 0 }), []);
  assert.equal(await durable.isInitialized(cache), true);
  assert.deepEqual(await durable.readProducts({ cache }), []);
});

test('legacy-seed chicken mince is ignored but a later real add remains visible', async () => {
  const cache = fakeCache();
  await durable.ensureInitialized(['фарш куриный', 'сыр'], { cache, settleMs: 0 });
  assert.deepEqual(await durable.readProducts({ cache }), ['сыр']);
  await durable.addProducts(['фарш куриный'], { cache, version: 100, eventId: 'real-user-add', settleMs: 0 });
  assert.deepEqual(new Set(await durable.readProducts({ cache })), new Set(['сыр', 'фарш куриный']));
});

test('wrapper migrates only a real persisted legacy list and invents nothing for missing history', async () => {
  const empty = fakeCache();
  assert.deepEqual(await state.readProductsHistory(empty), []);
  assert.deepEqual(await state.readProductsHistory(empty), []);

  const legacy = fakeCache(0, { 'products:history': ['молоко', 'яйца'] });
  assert.deepEqual(await state.readProductsHistory(legacy), ['молоко', 'яйца']);
});

test('concurrent distinct additions converge', async () => {
  const cache = fakeCache(1);
  await durable.ensureInitialized([], { cache, settleMs: 0 });
  await Promise.all([
    durable.addProducts(['молоко'], { cache, version: 10, eventId: 'a', settleMs: 0 }),
    durable.addProducts(['яйца'], { cache, version: 11, eventId: 'b', settleMs: 0 }),
  ]);
  assert.deepEqual(new Set(await durable.readProducts({ cache })), new Set(['молоко', 'яйца']));
});

test('remove tombstone and clear version prevent old replicas from resurrecting products', async () => {
  const cache = fakeCache();
  await durable.ensureInitialized([], { cache, settleMs: 0 });
  await durable.addProducts(['сыр', 'яйца'], { cache, version: 10, eventId: 'add', settleMs: 0 });
  await durable.removeProducts(['сыр'], { cache, version: 20, eventId: 'remove', settleMs: 0 });
  assert.deepEqual(await durable.readProducts({ cache }), ['яйца']);
  await durable.clearProducts({ cache, version: 30, eventId: 'clear', settleMs: 0 });
  assert.deepEqual(await durable.readProducts({ cache }), []);
});

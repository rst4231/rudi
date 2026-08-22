const test = require('node:test');
const assert = require('node:assert/strict');
const durable = require('../api/products-durable-state.cjs');

function fakeCache() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    values,
  };
}

test('does not seed any hard-coded shopping products', async () => {
  const cache = fakeCache();
  assert.deepEqual(await durable.ensureInitialized([], { cache, settleMs: 0 }), []);
  assert.deepEqual(await durable.readProducts({ cache }), []);
});

test('concurrent distinct additions converge without losing either product', async () => {
  const cache = fakeCache();
  await durable.replaceProducts(['фарш куриный'], { cache, version: 100, settleMs: 0 });
  await Promise.all([
    durable.addProducts(['молоко'], { cache, version: 101, eventId: 'a', settleMs: 1 }),
    durable.addProducts(['яйца'], { cache, version: 102, eventId: 'b', settleMs: 1 }),
  ]);
  const products = await durable.readProducts({ cache });
  assert.deepEqual(new Set(products), new Set(['фарш куриный', 'молоко', 'яйца']));
});

test('one missing replica does not erase the product', async () => {
  const cache = fakeCache();
  await durable.replaceProducts(['фарш куриный', 'молоко'], { cache, version: 200, settleMs: 0 });
  const key = durable.bucketKey('молоко', 0);
  cache.values.delete(key);
  assert.ok((await durable.readProducts({ cache })).includes('молоко'));
});

test('replace is exact and prevents an old product from returning', async () => {
  const cache = fakeCache();
  await durable.replaceProducts(['фарш куриный', 'Шоколад'], { cache, version: 300, settleMs: 0 });
  await durable.replaceProducts(['фарш куриный'], { cache, version: 400, settleMs: 0 });
  assert.deepEqual(await durable.readProducts({ cache }), ['фарш куриный']);
});

test('stale legacy seed cannot resurrect a removed product after durable state exists', async () => {
  const cache = fakeCache();
  await durable.replaceProducts(['фарш куриный'], { cache, version: 500, settleMs: 0 });
  for (const key of [...cache.values.keys()]) {
    if (key.startsWith('products:durable:v3:init:')) cache.values.delete(key);
  }
  await durable.ensureInitialized(['фарш куриный', 'Шоколад'], { cache, settleMs: 0 });
  assert.deepEqual(await durable.readProducts({ cache }), ['фарш куриный']);
});
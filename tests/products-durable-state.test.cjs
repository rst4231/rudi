const test = require('node:test');
const assert = require('node:assert/strict');
const durable = require('../api/products-durable-state.cjs');

function fakeCache(delay = 0) {
  const values = new Map();
  const pause = () => delay ? new Promise((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
  return {
    async get(key) { await pause(); return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { await pause(); values.set(key, structuredClone(value)); },
    async delete(key) { await pause(); values.delete(key); },
    values,
  };
}

test('does not seed any hard-coded shopping products', async () => {
  const cache = fakeCache();
  durable.resetProductsMutationQueueForTests();
  assert.deepEqual(await durable.ensureInitialized([], { cache, settleMs: 0 }), []);
  assert.deepEqual(await durable.readProducts({ cache }), []);
});

test('concurrent additions that collide in every bucket do not lose either product', async () => {
  const cache = fakeCache(1);
  durable.resetProductsMutationQueueForTests();
  assert.deepEqual(
    [0,1,2,3].map((replica) => durable.bucketKey('товар18', replica)),
    [0,1,2,3].map((replica) => durable.bucketKey('товар90', replica)),
  );
  await Promise.all([
    durable.addProducts(['товар18'], { cache, version: 101, eventId: 'a', settleMs: 0 }),
    durable.addProducts(['товар90'], { cache, version: 102, eventId: 'b', settleMs: 0 }),
  ]);
  assert.deepEqual(new Set(await durable.readProducts({ cache })), new Set(['товар18', 'товар90']));
});

test('one missing replica does not erase the product', async () => {
  const cache = fakeCache();
  durable.resetProductsMutationQueueForTests();
  await durable.replaceProducts(['молоко'], { cache, version: 200, settleMs: 0 });
  const key = durable.bucketKey('молоко', 0);
  cache.values.delete(key);
  assert.ok((await durable.readProducts({ cache })).includes('молоко'));
});

test('replace is exact and prevents an old product from returning', async () => {
  const cache = fakeCache();
  durable.resetProductsMutationQueueForTests();
  await durable.replaceProducts(['Шоколад'], { cache, version: 300, settleMs: 0 });
  await durable.replaceProducts(['молоко'], { cache, version: 400, settleMs: 0 });
  assert.deepEqual(await durable.readProducts({ cache }), ['молоко']);
});

test('legacy hard-coded chicken mince seed is hidden but an explicit later add remains visible', async () => {
  const cache = fakeCache();
  durable.resetProductsMutationQueueForTests();
  await durable.ensureInitialized(['фарш куриный', 'молоко'], { cache, settleMs: 0 });
  assert.deepEqual(await durable.readProducts({ cache }), ['молоко']);
  await durable.addProducts(['фарш куриный'], { cache, version: Date.now() + 1000, eventId: 'real-later-add', settleMs: 0 });
  assert.deepEqual(new Set(await durable.readProducts({ cache })), new Set(['молоко', 'фарш куриный']));
});

test('stale legacy seed cannot resurrect a removed product after durable state exists', async () => {
  const cache = fakeCache();
  durable.resetProductsMutationQueueForTests();
  await durable.replaceProducts(['молоко'], { cache, version: 600, settleMs: 0 });
  for (const key of [...cache.values.keys()]) {
    if (key.startsWith('products:durable:v3:init:')) cache.values.delete(key);
  }
  await durable.ensureInitialized(['молоко', 'Шоколад'], { cache, settleMs: 0 });
  assert.deepEqual(await durable.readProducts({ cache }), ['молоко']);
});

test('clear rejects when cache silently drops every clear marker', async () => {
  const values = new Map();
  const cache = {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) {
      if (key.startsWith('products:durable:v3:clear:')) return;
      values.set(key, structuredClone(value));
    },
  };
  durable.resetProductsMutationQueueForTests();
  await assert.rejects(
    durable.clearProducts({ cache, version: 900, eventId: 'clear-silent-drop', settleMs: 0 }),
    /clear state did not persist/,
  );
});

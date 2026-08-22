const test = require('node:test');
const assert = require('node:assert/strict');
const { createStrictRuntimeCache } = require('../api/strict-runtime-cache.cjs');

function fakeOfficialCache() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
  };
}

test('uses official Vercel function cache when runtime cache endpoint env is absent', async () => {
  const official = fakeOfficialCache();
  let seenNamespace = null;
  const cache = createStrictRuntimeCache({
    namespace: 'rudi-products-state-v2',
    env: {},
    attempts: 2,
    retryDelayMs: 0,
    getCacheImpl(options) {
      seenNamespace = options.namespace;
      return official;
    },
  });

  await cache.set('products:test', { ok: true });
  assert.equal(seenNamespace, 'rudi-products-state-v2');
  assert.deepEqual(await cache.get('products:test'), { ok: true });
});

test('official-cache fallback rejects a silently lost write instead of reporting success', async () => {
  const cache = createStrictRuntimeCache({
    namespace: 'rudi-products-state-v2',
    env: {},
    attempts: 2,
    retryDelayMs: 0,
    getCacheImpl() {
      return {
        async get() { return null; },
        async set() {},
        async delete() {},
      };
    },
  });

  await assert.rejects(cache.set('products:test', { ok: true }), /did not persist/);
});

test('official-cache write confirmation compares object values independent of key order', async () => {
  const cache = createStrictRuntimeCache({
    namespace: 'rudi-products-state-v2',
    env: {}, attempts: 1, retryDelayMs: 0,
    getCacheImpl() {
      return {
        async set() {},
        async get() { return { b: 2, a: 1 }; },
        async delete() {},
      };
    },
  });
  await cache.set('x', { a: 1, b: 2 });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStrictRuntimeCache, transformRuntimeCacheKey } = require('../api/strict-runtime-cache.cjs');

function response(status, body, state = 'fresh') {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: state ? { 'x-vercel-cache-state': state, 'content-type':'application/json' } : {} });
}

test('strict cache retries stale read and returns only fresh value in direct mode', async () => {
  let calls = 0;
  const cache = createStrictRuntimeCache({ endpoint:'https://cache/', headers:{a:'b'}, namespace:'ns', retryDelayMs:0, attempts:3, fetchImpl: async () => (++calls === 1 ? response(200,{old:true},'stale') : response(200,{fresh:true},'fresh')) });
  assert.deepEqual(await cache.get('x'), {fresh:true});
  assert.equal(calls, 2);
});

test('strict cache throws instead of converting repeated direct failures to null', async () => {
  const cache = createStrictRuntimeCache({ endpoint:'https://cache/', headers:{a:'b'}, retryDelayMs:0, attempts:2, fetchImpl: async () => response(500,{}) });
  await assert.rejects(() => cache.get('x'), /HTTP 500/);
});

test('strict cache returns null only after confirmed direct 404 retries', async () => {
  let calls=0;
  const cache = createStrictRuntimeCache({ endpoint:'https://cache/', headers:{a:'b'}, retryDelayMs:0, attempts:3, fetchImpl: async () => {calls++; return response(404); } });
  assert.equal(await cache.get('missing'), null);
  assert.equal(calls,3);
});

test('strict cache uses Vercel-compatible namespace hashing in direct mode', () => {
  assert.equal(transformRuntimeCacheKey('products:history','rudi-products-state-v2').startsWith('rudi-products-state-v2$'), true);
});

test('strict cache rejects a direct 200 read without an explicit fresh state', async () => {
  const cache = createStrictRuntimeCache({ endpoint:'https://cache/', headers:{a:'b'}, retryDelayMs:0, attempts:2, fetchImpl: async () => response(200,{unknown:true},'') });
  await assert.rejects(() => cache.get('x'), /read is/);
});

test('production fallback uses official getCache when internal endpoint env is absent', async () => {
  const values = new Map([['x', { ok: true }]]);
  let seenOptions;
  const cache = createStrictRuntimeCache({
    env: {},
    namespace: 'rudi-products-state-v2',
    attempts: 2,
    retryDelayMs: 0,
    getCacheImpl(options) {
      seenOptions = options;
      return {
        async get(key) { return values.has(key) ? values.get(key) : null; },
        async set(key, value) { values.set(key, value); },
        async delete(key) { values.delete(key); },
      };
    },
  });
  assert.deepEqual(await cache.get('x'), { ok: true });
  await cache.set('y', 2);
  assert.equal(await cache.get('y'), 2);
  assert.deepEqual(seenOptions, { namespace: 'rudi-products-state-v2' });
});

test('production fallback retries transient thrown errors from official getCache', async () => {
  let calls = 0;
  const cache = createStrictRuntimeCache({
    env: {}, attempts: 3, retryDelayMs: 0,
    runtimeCache: {
      async get() { calls += 1; if (calls < 2) throw new Error('temporary'); return 'ok'; },
      async set() {}, async delete() {},
    },
  });
  assert.equal(await cache.get('x'), 'ok');
  assert.equal(calls, 2);
});

test('production fallback tolerates partial internal cache env and still uses official getCache', async () => {
  for (const env of [
    { RUNTIME_CACHE_HEADERS: '{"x":"y"}' },
    { RUNTIME_CACHE_ENDPOINT: 'https://internal-cache/' },
  ]) {
    const cache = createStrictRuntimeCache({
      env, retryDelayMs: 0,
      getCacheImpl: () => ({ get: async () => 'official', set: async () => {}, delete: async () => {} }),
    });
    assert.equal(await cache.get('x'), 'official');
  }
});

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


test('durable state migrates an existing runtime-cache value without deleting it', async () => {
  const values = new Map([['score-state', { balances: { 'Рустам': 42 } }]]);
  const calls = [];
  const cache = createStrictRuntimeCache({
    env: {},
    namespace: 'rudi-score-v1',
    botToken: '123:test',
    retryDelayMs: 0,
    attempts: 1,
    runtimeCache: {
      async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
      async set(key, value) { values.set(key, structuredClone(value)); },
      async delete(key) { values.delete(key); },
      async expireTag() {},
    },
    durableFetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === 'GET') return new Response('[]', { status: 200 });
      return new Response('', { status: 201 });
    },
  });

  assert.deepEqual(await cache.get('score-state'), { balances: { 'Рустам': 42 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(values.get('score-state'), { balances: { 'Рустам': 42 } });
  const migration = calls.find((row) => row.init.method === 'POST');
  assert.ok(migration);
  const body = JSON.parse(migration.init.body);
  assert.equal(body[0].namespace, 'rudi-score-v1');
  assert.equal(body[0].key, 'score-state');
});

test('durable state reads Neon first and skips stale runtime value', async () => {
  let runtimeReads = 0;
  const cache = createStrictRuntimeCache({
    env: {},
    namespace: 'rudi-activity-journal-v1',
    botToken: '123:test',
    retryDelayMs: 0,
    attempts: 1,
    runtimeCache: {
      async get() { runtimeReads += 1; return { source: 'runtime' }; },
      async set() {},
      async delete() {},
      async expireTag() {},
    },
    durableFetchImpl: async (_url, init) => {
      assert.equal(init.method, 'GET');
      return new Response(JSON.stringify([{ value: { source: 'neon' }, expires_at: null }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.deepEqual(await cache.get('activity-journal'), { source: 'neon' });
  assert.equal(runtimeReads, 0);
});

test('durable state dual-writes Neon and Runtime Cache and survives Neon outage', async () => {
  const values = new Map();
  let neonDown = false;
  const cache = createStrictRuntimeCache({
    env: {},
    namespace: 'rudi-ui-preferences-v1',
    botToken: '123:test',
    retryDelayMs: 0,
    attempts: 1,
    runtimeCache: {
      async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
      async set(key, value) { values.set(key, structuredClone(value)); },
      async delete(key) { values.delete(key); },
      async expireTag() {},
    },
    durableFetchImpl: async (_url, init) => {
      if (neonDown) return new Response('offline', { status: 503 });
      if (init.method === 'GET') return new Response('[]', { status: 200 });
      return new Response('', { status: 201 });
    },
  });

  await cache.set('rustam', { themeMode: 'dark' }, { ttl: 60 });
  assert.deepEqual(values.get('rustam'), { themeMode: 'dark' });
  neonDown = true;
  assert.deepEqual(await cache.get('rustam'), { themeMode: 'dark' });
});

test('non-durable control-plane keys stay only in Runtime Cache', async () => {
  let durableCalls = 0;
  const values = new Map([['topic-maintenance:test', { ok: true }]]);
  const cache = createStrictRuntimeCache({
    env: {},
    namespace: 'rudi-control-plane-v1',
    retryDelayMs: 0,
    attempts: 1,
    runtimeCache: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); },
      async expireTag() {},
    },
    durableFetchImpl: async () => {
      durableCalls += 1;
      return new Response('[]', { status: 200 });
    },
  });

  assert.deepEqual(await cache.get('topic-maintenance:test'), { ok: true });
  assert.equal(durableCalls, 0);
});

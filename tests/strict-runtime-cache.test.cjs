const test = require('node:test');
const assert = require('node:assert/strict');
const { createStrictRuntimeCache, transformRuntimeCacheKey } = require('../api/strict-runtime-cache.cjs');

function memoryD1() {
  const rows = new Map();
  const calls = [];
  return {
    calls,
    async getRecord(namespace, key) {
      calls.push(['get', namespace, key]);
      return rows.has(namespace + '\0' + key) ? structuredClone(rows.get(namespace + '\0' + key)) : null;
    },
    async set(namespace, key, value, options = {}) {
      calls.push(['set', namespace, key, structuredClone(value), structuredClone(options)]);
      rows.set(namespace + '\0' + key, {
        namespace,
        key,
        value: structuredClone(value),
        tags: Array.isArray(options.tags) ? [...options.tags] : [],
        expires_at: options.expiresAt || null,
      });
      return true;
    },
    async setIfAbsent(namespace, key, value, options = {}) {
      calls.push(['setIfAbsent', namespace, key, structuredClone(value), structuredClone(options)]);
      const id = namespace + '\0' + key;
      if (rows.has(id)) return false;
      rows.set(id, { namespace, key, value: structuredClone(value), tags: options.tags || [], expires_at: options.expiresAt || null });
      return true;
    },
    async remove(namespace, key) {
      calls.push(['delete', namespace, key]);
      rows.delete(namespace + '\0' + key);
      return true;
    },
    async expireTag(namespace, tag) {
      calls.push(['expireTag', namespace, tag]);
      let deleted = 0;
      for (const [id, row] of [...rows.entries()]) {
        if (!id.startsWith(namespace + '\0')) continue;
        if (!(row.tags || []).includes(tag)) continue;
        rows.delete(id);
        deleted += 1;
      }
      return deleted;
    },
  };
}

test('strict cache routes reads and writes through D1 namespace', async () => {
  const d1Client = memoryD1();
  const cache = createStrictRuntimeCache({ namespace: 'rudi-score-v1', d1Client });

  await cache.set('score-state', { balances: { 'Рустам': 42 } }, { tags: ['score'] });
  assert.deepEqual(await cache.get('score-state'), { balances: { 'Рустам': 42 } });

  assert.deepEqual(d1Client.calls[0].slice(0,3), ['set', 'rudi-score-v1', 'score-state']);
  assert.deepEqual(d1Client.calls[1], ['get', 'rudi-score-v1', 'score-state']);
});

test('strict cache ignores expired D1 rows', async () => {
  const d1Client = {
    async getRecord(namespace, key) {
      return {
        namespace,
        key,
        value: { stale: true },
        expires_at: '2026-10-01T00:00:00.000Z',
      };
    },
  };
  const cache = createStrictRuntimeCache({ namespace: 'rudi-feed-v1', d1Client });
  assert.equal(await cache.get('current'), null);
});

test('strict cache delegates atomic set-if-absent to D1', async () => {
  const d1Client = memoryD1();
  const cache = createStrictRuntimeCache({ namespace: 'rudi-daily-question-v1', d1Client });

  assert.equal(await cache.setIfAbsent('generation-lock:2026-10-03', { owner: 1 }, { ttl: 60 }), true);
  assert.equal(await cache.setIfAbsent('generation-lock:2026-10-03', { owner: 2 }, { ttl: 60 }), false);
});

test('strict cache delegates delete and expireTag to D1', async () => {
  const d1Client = memoryD1();
  const cache = createStrictRuntimeCache({ namespace: 'rudi-feed-v1', d1Client });

  await cache.set('one', 1, { tags: ['feed'] });
  await cache.set('two', 2, { tags: ['feed'] });
  await cache.expireTag('feed');
  assert.equal(await cache.get('one'), null);
  assert.equal(await cache.get('two'), null);

  await cache.set('three', 3);
  await cache.delete('three');
  assert.equal(await cache.get('three'), null);
});

test('explicit runtimeCache is accepted only as an injected test double', async () => {
  const values = new Map([['x', { ok: true }]]);
  const runtimeCache = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); return true; },
    async delete(key) { values.delete(key); return true; },
  };
  const cache = createStrictRuntimeCache({ runtimeCache, namespace: 'test' });
  assert.equal(cache, runtimeCache);
  assert.deepEqual(await cache.get('x'), { ok: true });
});

test('legacy key transform helper remains deterministic for compatibility', () => {
  const first = transformRuntimeCacheKey('products:history', 'rudi-products-state-v2');
  const second = transformRuntimeCacheKey('products:history', 'rudi-products-state-v2');
  assert.equal(first, second);
  assert.equal(first.startsWith('rudi-products-state-v2$'), true);
});

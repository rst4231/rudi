const test = require('node:test');
const assert = require('node:assert/strict');
const { createStrictRuntimeCache, transformRuntimeCacheKey } = require('../api/strict-runtime-cache.cjs');

function response(status, body, state = 'fresh') {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: state ? { 'x-vercel-cache-state': state, 'content-type':'application/json' } : {} });
}

test('strict cache retries stale read and returns only fresh value', async () => {
  let calls = 0;
  const cache = createStrictRuntimeCache({ endpoint:'https://cache/', headers:{a:'b'}, namespace:'ns', retryDelayMs:0, attempts:3, fetchImpl: async () => (++calls === 1 ? response(200,{old:true},'stale') : response(200,{fresh:true},'fresh')) });
  assert.deepEqual(await cache.get('x'), {fresh:true});
  assert.equal(calls, 2);
});

test('strict cache throws instead of converting repeated failures to null', async () => {
  const cache = createStrictRuntimeCache({ endpoint:'https://cache/', headers:{a:'b'}, retryDelayMs:0, attempts:2, fetchImpl: async () => response(500,{}) });
  await assert.rejects(() => cache.get('x'), /HTTP 500/);
});

test('strict cache returns null only after confirmed 404 retries', async () => {
  let calls=0;
  const cache = createStrictRuntimeCache({ endpoint:'https://cache/', headers:{a:'b'}, retryDelayMs:0, attempts:3, fetchImpl: async () => {calls++; return response(404); } });
  assert.equal(await cache.get('missing'), null);
  assert.equal(calls,3);
});

test('strict cache uses Vercel-compatible namespace hashing', () => {
  assert.equal(transformRuntimeCacheKey('products:history','rudi-products-state-v2').startsWith('rudi-products-state-v2$'), true);
});


test('strict cache rejects a 200 read without an explicit fresh state', async () => {
  const cache = createStrictRuntimeCache({ endpoint:'https://cache/', headers:{a:'b'}, retryDelayMs:0, attempts:2, fetchImpl: async () => response(200,{unknown:true},'') });
  await assert.rejects(() => cache.get('x'), /read is/);
});

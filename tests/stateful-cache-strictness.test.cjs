const test = require('node:test');
const assert = require('node:assert/strict');
const caches = require('../api/stateful-cache.cjs');

function staleFetch() {
  return async () => new Response(JSON.stringify({ value: 1 }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-vercel-cache-state': 'stale' },
  });
}

for (const [name, factory] of [
  ['topic maintenance', caches.getTopicMaintenanceCache],
  ['labor content', caches.getLaborCache],
  ['labor publication lease', caches.getLaborLeaseCache],
]) {
  test(`${name} cache fails closed on a stale Runtime Cache read`, async () => {
    const cache = factory({ endpoint: 'https://cache.test/', headers: {}, fetchImpl: staleFetch(), attempts: 1, timeoutMs: 500 });
    await assert.rejects(cache.get('state-key'), /Runtime Cache read is stale/);
  });
}

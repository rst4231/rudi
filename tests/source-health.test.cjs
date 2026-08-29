const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifySourceResult,
  recordSourceHealth,
  getSourceHealth,
} = require('../api/source-health.cjs');

function memoryCache() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
  };
}

test('empty is distinct from failed and stale', () => {
  assert.equal(classifySourceResult({ ok: true, itemCount: 0 }), 'empty');
  assert.equal(classifySourceResult({ ok: false, error: 'timeout' }), 'failed');
  assert.equal(classifySourceResult({ ok: true, itemCount: 3, stale: true }), 'stale');
  assert.equal(classifySourceResult({ ok: true, itemCount: 3 }), 'healthy');
});

test('source health persists requested date and sanitized error', async () => {
  const cache = memoryCache();
  await recordSourceHealth({
    sourceId: 'events:yandex',
    requestedDate: '2026-08-30',
    ok: false,
    itemCount: 0,
    error: 'Authorization: Bearer topsecret failed https://api.telegram.org/bot123456:ABC/getMe',
  }, { cache, now: new Date('2026-08-30T00:00:00Z'), secrets: ['topsecret', '123456:ABC'] });
  const row = await getSourceHealth('events:yandex', { cache });
  assert.equal(row.status, 'failed');
  assert.equal(row.requestedDate, '2026-08-30');
  assert.ok(!row.error.includes('topsecret'));
  assert.ok(!row.error.includes('123456:ABC'));
});

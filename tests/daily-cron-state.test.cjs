const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DAILY_CRON_STATE_KEY,
  normalizeDailyCronState,
  recordDailyCronState,
  getDailyCronState,
} = require('../api/daily-cron-state.cjs');

function fakeCache() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, value); },
  };
}

test('daily cron state records completed execution for health diagnostics', async () => {
  const cache = fakeCache();
  await recordDailyCronState({
    status: 'completed',
    authorized: true,
    startedAt: new Date('2026-09-19T00:30:00Z'),
    finishedAt: new Date('2026-09-19T00:31:00Z'),
  }, { cache });

  assert.deepEqual(await getDailyCronState({ cache }), {
    status: 'completed',
    authorized: true,
    startedAt: '2026-09-19T00:30:00.000Z',
    finishedAt: '2026-09-19T00:31:00.000Z',
    error: null,
  });
  assert.ok(cache.values.has(DAILY_CRON_STATE_KEY));
});

test('daily cron state exposes unauthorized attempts without secrets', () => {
  assert.deepEqual(normalizeDailyCronState({
    status: 'unauthorized',
    authorized: false,
    startedAt: '2026-09-19T00:30:00Z',
    finishedAt: '2026-09-19T00:30:01Z',
    error: null,
  }), {
    status: 'unauthorized',
    authorized: false,
    startedAt: '2026-09-19T00:30:00.000Z',
    finishedAt: '2026-09-19T00:30:01.000Z',
    error: null,
  });
});

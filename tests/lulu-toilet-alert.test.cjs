const test = require('node:test');
const assert = require('node:assert/strict');
const { runLuluToiletAlert } = require('../api/lulu-toilet-alert.cjs');
const { markLuluWalk, readLuluState, resetMutationQueueForTests } = require('../api/lulu-store.cjs');

test.beforeEach(() => resetMutationQueueForTests());

test('an overdue Lulu walk no longer sends a toilet push or changes walk history', async () => {
  const rows = new Map();
  const luluCache = {
    async get(key) { return structuredClone(rows.get(key) ?? null); },
    async set(key, value) { rows.set(key, structuredClone(value)); return true; },
  };
  await markLuluWalk('Рустам', { luluCache, now: Date.parse('2026-11-03T03:00:00Z') });
  const before = await readLuluState({ luluCache });
  const deliveries = [];
  const result = await runLuluToiletAlert({
    luluCache,
    now: Date.parse('2026-11-03T18:00:00Z'),
    getWorkWeek: async () => ({ configured: true, days: [{ date: '2026-11-03', events: [] }] }),
    sendPushNotification: async (actor, payload) => {
      deliveries.push({ actor, payload });
      return { sent: true, actor, delivered: 1 };
    },
  });
  assert.deepEqual(deliveries, []);
  assert.deepEqual(result.sent, []);
  assert.equal(result.skipped, 'disabled');
  assert.deepEqual(await readLuluState({ luluCache }), before);
});

test('retired toilet check completes without reading state or the work calendar', async () => {
  let reads = 0;
  const unavailable = async () => { reads++; throw new Error('external-service-unavailable'); };
  const result = await runLuluToiletAlert({
    luluCache: { get: unavailable, set: unavailable },
    getWorkWeek: unavailable,
    sendPushNotification: unavailable,
  });
  assert.equal(reads, 0);
  assert.equal(result.skipped, 'disabled');
  assert.deepEqual(result.sent, []);
});

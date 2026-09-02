const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHealthPayload } = require('../api/control-plane-health.cjs');
const settings = require('../config/rudi-settings.json');

test('health exposes safe events cleanup diagnostics without Telegram identifiers', async () => {
  const cleanup = {
    checkedAt: '2026-09-02T00:31:00.000Z',
    trigger: 'daily',
    date: '2026-09-02',
    targetDateKey: '2026-09-01',
    tracked: 2,
    deleted: 2,
    skipped: null,
    error: null,
  };
  const payload = await buildHealthPayload({
    now: new Date('2026-09-02T10:00:00Z'),
    settingsLoader: async () => ({ settings, source: 'bundled', overrides: {} }),
    getLatestDailyRun: async () => null,
    getLatestPublication: async () => null,
    listSourceHealth: async () => [],
    getAlertState: async () => null,
    getEventCleanupStatus: async () => cleanup,
  });

  assert.deepEqual(payload.topicCleanup, { events: cleanup });
  assert.doesNotMatch(JSON.stringify(payload.topicCleanup), /chatId|messageIds|token/i);
});

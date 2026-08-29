const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHealthPayload } = require('../api/control-plane-health.cjs');
const settings = require('../config/rudi-settings.json');

test('health reports effective settings and omits removed venue rubric', async () => {
  const payload = await buildHealthPayload({
    now: new Date('2026-08-29T17:30:00Z'),
    settingsLoader: async () => ({ settings, source: 'bundled', overrides: {} }),
    getLatestDailyRun: async () => ({ date: '2026-08-29', failures: 0 }),
    getLatestPublication: async (section) => ({ section, status: 'published' }),
    listSourceHealth: async () => [],
    getAlertState: async () => null,
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.service, 'spb-daily-guide-bot');
  assert.equal(payload.date, '2026-08-29');
  assert.equal(payload.sections.events.topicId, 19);
  assert.equal(payload.cron.schedule, '30 21 * * *');
  const text = JSON.stringify(payload);
  assert.ok(!text.includes('Sevkabel'));
  assert.ok(!text.includes('Brusnitsyn'));
});

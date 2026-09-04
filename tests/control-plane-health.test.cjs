const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHealthPayload, syncForumTopicNamesSafe } = require('../api/control-plane-health.cjs');
const settings = require('../config/rudi-settings.json');

test('forum topic maintenance falls back to the known forum chat when cache is empty', async () => {
  const calls = [];
  await syncForumTopicNamesSafe({
    cache: { async get() { return null; }, async set() { return true; } },
    env: { TELEGRAM_BOT_TOKEN: '1:test' },
    configFetchImpl: async () => new Response(JSON.stringify({
      version: 2,
      clients: 126,
      labor: 696,
      names: { clients: 'Для Ди' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /editForumTopic$/);
  assert.deepEqual(calls[0].body, {
    chat_id: '-1004476323368',
    message_thread_id: 126,
    name: 'Для Ди',
  });
  assert.match(calls[1].url, /deleteForumTopic$/);
  assert.deepEqual(calls[1].body, {
    chat_id: '-1004476323368',
    message_thread_id: 696,
  });
});

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

test('health exposes only safe operational settings used by the public dashboard', async () => {
  const effective = structuredClone(settings);
  effective.copy.footers.events = 'Проверочный футер';
  effective.alerts.dedupeMinutes = 240;
  const payload = await buildHealthPayload({
    settingsLoader: async () => ({ settings: effective, source: 'runtime-cache', overrides: { alerts: { dedupeMinutes: 240 } } }),
    getLatestDailyRun: async () => null,
    getLatestPublication: async () => null,
    listSourceHealth: async () => [],
    getAlertState: async () => null,
  });

  assert.deepEqual(payload.operationalSettings, {
    publishing: effective.publishing,
    dedupe: effective.dedupe,
    alerts: effective.alerts,
    sources: effective.sources,
    copy: effective.copy,
  });
  assert.equal(payload.operationalSettings.copy.footers.events, 'Проверочный футер');
  assert.equal(payload.operationalSettings.alerts.dedupeMinutes, 240);
  assert.doesNotMatch(JSON.stringify(payload.operationalSettings), /CRON_SECRET|RUDI_ADMIN_SECRET|TELEGRAM|token/i);
});

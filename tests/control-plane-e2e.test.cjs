const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdminAuthorized } = require('../api/admin-auth.cjs');
const { buildAdminDashboard, handleAdminAction } = require('../api/admin-api.cjs');
const { getContentOverride } = require('../api/section-controls.cjs');
const { applyPreviewContentOverride } = require('../api/preview-sections.cjs');
const { wrapFetch } = require('../api/topic-maintenance.cjs');
const { publishSelectedSection } = require('../api/manual-section-publisher.cjs');
const { getPublicationRecord } = require('../api/publication-journal.cjs');
const { runNativeSection } = require('../api/section-runners.cjs');
const { emitOperationalAlert } = require('../api/alert-service.cjs');

function memoryCache(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async set(key, value) { map.set(key, structuredClone(value)); return true; },
    async delete(key) { map.delete(key); return true; },
  };
}

const env = { CRON_SECRET: 'cron-secret', RUDI_FEEDBACK_SECRET: 'feedback-secret' };
const settings = {
  version: 1,
  timezone: 'Europe/Moscow',
  sections: {
    events: { enabled: true, topicId: 19 },
    holidays: { enabled: true, topicId: 20 },
    facts: { enabled: true, topicId: 72 },
    lulu: { enabled: true, topicId: 73 },
    recipes: { enabled: true, topicId: 74 },
    clients: { enabled: true, topicId: 126 },
    cinema: { enabled: true },
    labor: { enabled: true },
    weekend: { enabled: true },
  },
  sources: {},
  copy: { footers: { facts: '' } },
  publishing: { dailyCronDescription: 'daily', weekendDays: [4, 5], allowAutomaticRetry: true },
  dedupe: { eventsDays: 30, cinemaDays: 60, recipesDays: 45, clientsDays: 45, weekendDays: 30 },
  alerts: { enabled: true, dedupeMinutes: 180 },
};

function originalPreview(date) {
  return {
    requestedDate: date,
    results: { facts: { preview: { message: `original-${date}` } } },
  };
}

async function dashboardPreview(date, controlCache) {
  const override = await getContentOverride(date, 'facts', { cache: controlCache });
  return {
    requestedDate: date,
    sections: {
      facts: applyPreviewContentOverride(
        { section: 'facts', parts: [`original-${date}`], metadata: { available: true } },
        override,
      ),
    },
  };
}

test('admin no-deploy workflow controls one generated section end to end', async () => {
  const controlCache = memoryCache();
  const journalCache = memoryCache();
  const now = new Date('2026-08-29T12:00:00Z');
  const today = '2026-08-29';
  const tomorrow = '2026-08-30';

  assert.equal(isAdminAuthorized({ headers: { authorization: 'Bearer cron-secret' } }, env), true);

  const dashboardOptions = {
    now,
    settingsLoader: async () => ({ settings, overrides: {} }),
    healthBuilder: async () => ({ ok: true, latestPublications: {}, sourceHealth: [], alerts: null }),
    previewProvider: (date) => dashboardPreview(date, controlCache),
    controlCache,
    analyticsCache: controlCache,
  };
  const first = await buildAdminDashboard(dashboardOptions);
  assert.equal(first.settings.sections.facts.enabled, true);
  assert.deepEqual(first.previews.today.sections.facts.parts, [`original-${today}`]);

  const saved = await handleAdminAction('set-content-override', {
    section: 'facts', date: today, parts: ['edited fact'],
  }, { controlCache });
  assert.equal(saved.ok, true);
  const second = await buildAdminDashboard(dashboardOptions);
  assert.deepEqual(second.previews.today.sections.facts.parts, ['edited fact']);
  assert.equal(second.previews.today.sections.facts.overridden, true);

  const networkCalls = [];
  const fakeTelegram = async (_url, init) => {
    const body = JSON.parse(init.body);
    networkCalls.push(body);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 501 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const send = wrapFetch(fakeTelegram, {
    settings,
    controlCache,
    publicationDate: today,
    bypassDailyDedupe: true,
    env,
  });
  const response = await send('https://api.telegram.org/botTEST/sendMessage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message_thread_id: 72, text: 'runtime original' }),
  });
  assert.equal(response.ok, true);
  assert.equal(networkCalls.length, 1);
  assert.equal(networkCalls[0].text, 'edited fact');
  assert.equal(networkCalls[0].reply_markup, undefined);

  await handleAdminAction('skip-section', { section: 'facts', date: tomorrow }, { controlCache });
  let tomorrowNetwork = 0;
  const tomorrowSend = wrapFetch(async () => {
    tomorrowNetwork += 1;
    return new Response('{"ok":true}', { status: 200 });
  }, {
    settings,
    controlCache,
    publicationDate: tomorrow,
    bypassDailyDedupe: true,
    env,
  });
  const suppressed = await tomorrowSend('https://api.telegram.org/botTEST/sendMessage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message_thread_id: 72, text: 'tomorrow fact' }),
  });
  assert.equal(tomorrowNetwork, 0);
  assert.equal((await suppressed.json()).result.suppressed_by_admin, true);

  await handleAdminAction('clear-section-skip', { section: 'facts', date: tomorrow }, { controlCache });
  const manualSends = [];
  const manual = await handleAdminAction('publish-section', { section: 'facts', date: today }, {
    publishSection: (input) => publishSelectedSection(input, {
      settings,
      journalCache,
      controlCache,
      previewProvider: async (date) => originalPreview(date),
      sendTelegram: async (payload) => { manualSends.push(payload); return { messageId: 777 }; },
    }),
  });
  assert.equal(manual.ok, true);
  assert.deepEqual(manualSends.map((row) => row.topicId), [72]);
  assert.deepEqual(manualSends.map((row) => row.text), ['edited fact']);
  const journal = await getPublicationRecord(today, 'facts', { cache: journalCache });
  assert.equal(journal.status, 'published');
  assert.deepEqual(journal.messageIds, [777]);
});

test('failed cinema retry stays isolated and duplicate alert is suppressed', async () => {
  const journalCache = memoryCache();
  const alertCache = memoryCache();
  const sentAlerts = [];
  let cinemaCalls = 0;
  let generatedCalls = 0;
  const alert = (row) => emitOperationalAlert(row, {
    cache: alertCache,
    now: new Date('2026-08-29T12:00:00Z'),
    dedupeMinutes: 180,
    send: async (text) => { sentAlerts.push(text); },
  });
  const failingRunner = async () => { cinemaCalls += 1; throw new Error('cinema down'); };

  await assert.rejects(() => runNativeSection('cinema', {
    date: '2026-08-30', journalCache, maxAttempts: 1, runner: failingRunner, alert,
  }), /cinema down/);
  assert.equal((await getPublicationRecord('2026-08-30', 'cinema', { cache: journalCache })).status, 'failed');
  assert.equal(sentAlerts.length, 1);

  const retried = await handleAdminAction('retry-failed-section', {
    section: 'cinema', date: '2026-08-30',
  }, {
    publishSection: (input) => runNativeSection('cinema', {
      date: input.date,
      retryFailedOnly: input.retryFailedOnly,
      journalCache,
      maxAttempts: 1,
      runner: failingRunner,
      alert,
    }),
  });
  assert.equal(retried.ok, false);
  assert.match(retried.error, /cinema down/);
  assert.equal(cinemaCalls, 2);
  assert.equal(generatedCalls, 0);
  assert.equal(sentAlerts.length, 1);
});
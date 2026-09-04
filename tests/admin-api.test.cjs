const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAdminDashboard, handleAdminAction } = require('../api/admin-api.cjs');
const adminHandler = require('../api/admin.js');

const settings = {
  version: 1,
  timezone: 'Europe/Moscow',
  sections: {
    events: { enabled: true, topicId: 19 }, holidays: { enabled: true, topicId: 20 },
    facts: { enabled: true, topicId: 72 }, lulu: { enabled: true, topicId: 73 },
    recipes: { enabled: true, topicId: 74 }, clients: { enabled: true, topicId: 126 },
    cinema: { enabled: true }, labor: { enabled: true }, weekend: { enabled: true },
  },
  sources: {}, copy: { footers: {} }, publishing: { dailyCronDescription: 'daily', weekendDays: [5, 6], allowAutomaticRetry: true },
  dedupe: {}, alerts: { enabled: true, dedupeMinutes: 180 },
};

function responseStub() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
}

test('dashboard combines health, today/tomorrow previews, skips and analytics', async () => {
  const dashboard = await buildAdminDashboard({
    now: new Date('2026-08-29T12:00:00Z'),
    settingsLoader: async () => ({ settings, overrides: { sections: { facts: { enabled: false } } } }),
    healthBuilder: async () => ({ ok: true, date: '2026-08-29', latestPublications: { facts: { status: 'published' } }, sourceHealth: [], alerts: null }),
    previewProvider: async (date) => ({ requestedDate: date, sections: { facts: { parts: [`facts-${date}`] } } }),
    getSkip: async (date, section) => section === 'facts' && date === '2026-08-30',
    analyticsProvider: async () => ({ facts: { publications: 3, positiveFeedback: 2, negativeFeedback: 1 } }),
  });
  assert.equal(dashboard.ok, true);
  assert.equal(dashboard.previews.today.requestedDate, '2026-08-29');
  assert.equal(dashboard.previews.tomorrow.requestedDate, '2026-08-30');
  assert.equal(dashboard.skips.tomorrow.facts, true);
  assert.equal(dashboard.settings.sections.facts.enabled, true);
  assert.equal(dashboard.overrides.sections.facts.enabled, false);
  assert.equal(dashboard.analytics.facts.publications, 3);
});

test('dashboard stays available when one preview fails', async () => {
  const dashboard = await buildAdminDashboard({
    now: new Date('2026-08-29T12:00:00Z'),
    settingsLoader: async () => ({ settings, overrides: {} }),
    healthBuilder: async () => ({ ok: true, date: '2026-08-29', latestPublications: {}, sourceHealth: [], alerts: null }),
    previewProvider: async (date) => {
      if (date === '2026-08-30') throw new Error('preview-down');
      return { requestedDate: date, sections: {} };
    },
    getSkip: async () => false,
    analyticsProvider: async () => ({}),
  });
  assert.equal(dashboard.ok, true);
  assert.equal(dashboard.previews.today.requestedDate, '2026-08-29');
  assert.equal(dashboard.previews.tomorrow.requestedDate, '2026-08-30');
  assert.equal(dashboard.previews.tomorrow.error, 'preview-unavailable');
  assert.equal(dashboard.previews.tomorrow.reason, 'preview-down');
});

test('unknown admin action returns a validation result and mutates nothing', async () => {
  let mutations = 0;
  const result = await handleAdminAction('anything-goes', {}, {
    setSettingsOverride: async () => { mutations += 1; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown-admin-action');
  assert.equal(mutations, 0);
});

test('set-section-enabled writes only the named enabled flag', async () => {
  const patches = [];
  const result = await handleAdminAction('set-section-enabled', { section: 'facts', enabled: false }, {
    setSettingsOverride: async (patch) => { patches.push(patch); return patch; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(patches, [{ sections: { facts: { enabled: false } } }]);
});

test('retry-failed-section delegates only one failed section', async () => {
  const calls = [];
  const result = await handleAdminAction('retry-failed-section', { section: 'cinema', date: '2026-08-30' }, {
    publishSection: async (input) => { calls.push(input); return { ok: true, section: input.section }; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ section: 'cinema', date: '2026-08-30', retryFailedOnly: true }]);
});

test('cleanup-cinema-messages delegates only validated ids for the requested date', async () => {
  const calls = [];
  const result = await handleAdminAction('cleanup-cinema-messages', {
    date: '2026-09-03',
    messageIds: [823, 824, 825],
  }, {
    cleanupCinema: async (input) => {
      calls.push(input);
      return { deleted: input.messageIds, protected: [], rejected: [] };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ date: '2026-09-03', messageIds: [823, 824, 825] }]);
});

test('cleanup-feedback-keyboards delegates one idempotent legacy cleanup', async () => {
  const calls = [];
  const result = await handleAdminAction('cleanup-feedback-keyboards', {}, {
    cleanupFeedback: async (input) => {
      calls.push(input);
      return { removed: 8, skipped: 1, checked: 9 };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{}]);
  assert.equal(result.removed, 8);
  assert.equal(result.skipped, 1);
});

test('admin endpoint serves dashboard without bearer auth', async () => {
  const req = { method: 'GET', headers: {}, query: {} };
  const res = responseStub();
  await adminHandler.runAdmin(req, res, { buildDashboard: async () => ({ ok: true, marker: 'dashboard' }) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, marker: 'dashboard' });
});

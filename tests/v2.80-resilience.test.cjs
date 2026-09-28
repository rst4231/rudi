const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ticktick = require('../api/ticktick-client.cjs');
const health = require('../api/control-plane-health.cjs');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('v2.80 retries transient TickTick read failures', async () => {
  let calls = 0;
  const result = await ticktick.fetchProjectData('token', 'project', {
    readAttempts: 3,
    readTimeoutMs: 1000,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return { status: 502, ok: false, json: async () => ({}) };
      return { status: 200, ok: true, json: async () => ({ project: { name: 'Общий' }, tasks: [] }) };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.project.name, 'Общий');
});

test('v2.80 retries TickTick network rejection but does not retry auth failure', async () => {
  let calls = 0;
  const result = await ticktick.fetchProjectData('token', 'project', {
    readAttempts: 3,
    readTimeoutMs: 1000,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary network');
      return { status: 200, ok: true, json: async () => ({ tasks: [] }) };
    },
  });
  assert.deepEqual(result.tasks, []);
  assert.equal(calls, 2);

  let authCalls = 0;
  await assert.rejects(
    ticktick.fetchProjectData('token', 'project', {
      readAttempts: 3,
      readTimeoutMs: 1000,
      retryDelayMs: 0,
      fetchImpl: async () => {
        authCalls += 1;
        return { status: 401, ok: false, json: async () => ({}) };
      },
    }),
    /ticktick-token-invalid/
  );
  assert.equal(authCalls, 1);
});

test('v2.80 health hides legacy unauthorized cron state and marks stale pending', () => {
  assert.equal(health.normalizeHealthCronState({
    status: 'unauthorized',
    authorized: false,
    startedAt: '2026-09-28T05:15:31.283Z',
  }), null);

  const recent = health.normalizeHealthPublication({
    status: 'pending',
    startedAt: '2026-09-28T08:55:00.000Z',
    metadata: {},
  }, new Date('2026-09-28T09:00:00.000Z'));
  assert.equal(recent.status, 'pending');

  const stale = health.normalizeHealthPublication({
    status: 'pending',
    startedAt: '2026-09-28T08:00:00.000Z',
    metadata: {},
  }, new Date('2026-09-28T09:00:00.000Z'));
  assert.equal(stale.status, 'stale');
  assert.equal(stale.metadata.healthDerivedStatus, 'stale-pending');
});

test('v2.80 expected cron 401s are warnings, not error logs', () => {
  const daily = read('api/daily-cron.js');
  const feed = read('api/feed-notify-cron.js');
  assert.match(daily, /console\.warn\('RUDI_DAILY_CRON_UNAUTHORIZED'\)/);
  assert.doesNotMatch(daily, /console\.error\('RUDI_DAILY_CRON_UNAUTHORIZED'\)/);
  assert.match(feed, /console\.warn\('RUDI_FEED_NOTIFY_CRON_UNAUTHORIZED'\)/);
  assert.doesNotMatch(feed, /console\.error\('RUDI_FEED_NOTIFY_CRON_UNAUTHORIZED'\)/);
});

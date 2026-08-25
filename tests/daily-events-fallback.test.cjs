const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  runEventsFallback,
} = require('../api/daily-events-fallback.cjs');

function memoryCache(initial = {}) {
  const state = new Map(Object.entries(initial));
  return {
    async get(key) { return state.has(key) ? state.get(key) : null; },
    async set(key, value) { state.set(key, value); return true; },
  };
}

test('events fallback does nothing when both daily event messages were already published', async () => {
  const calls = [];
  const result = await runEventsFallback({
    dateKey: '2026-08-25',
    cache: memoryCache({ 'topic:19:2026-08-25:messages': [701, 702] }),
    runtime: async (...args) => calls.push(args),
  });
  assert.equal(result.skipped, 'already-published');
  assert.equal(calls.length, 0);
});

test('events fallback retries when only one of the two daily event messages exists', async () => {
  const calls = [];
  const runtime = async (req, res) => {
    calls.push(req);
    res.status(200).json({ ok: true, results: { events: { sent: true } } });
  };
  const result = await runEventsFallback({
    dateKey: '2026-08-25',
    cache: memoryCache({ 'topic:19:2026-08-25:messages': [701] }),
    runtime,
  });
  assert.equal(result.ran, true);
  assert.equal(calls.length, 1);
});

test('events fallback republishes only the events rubric when the nightly cron left no event messages', async () => {
  const calls = [];
  const runtime = async (req, res) => {
    calls.push(req);
    res.status(200).json({ ok: true, results: { events: { sent: true } } });
  };
  const result = await runEventsFallback({
    dateKey: '2026-08-25',
    cache: memoryCache(),
    runtime,
  });
  assert.equal(result.ran, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query.only, 'events');
  assert.equal(calls[0].query.date, '2026-08-25');
});

test('Vercel keeps the 00:30 Moscow primary cron and adds a one-hour-later events fallback', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.ok(config.crons.some((cron) => cron.path === '/api/daily' && cron.schedule === '30 21 * * *'));
  assert.ok(config.crons.some((cron) => cron.path === '/api/daily-events-fallback' && cron.schedule === '30 22 * * *'));
});

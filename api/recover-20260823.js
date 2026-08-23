const { createHash, timingSafeEqual } = require('node:crypto');
const indexHandler = require('./index.js');
const { getRecoveryCache } = require('./stateful-cache.cjs');

const RECOVERY_DATE = '2026-08-23';
const RECOVERY_KEY = 'recovery-20260823-complete';
const EXPECTED_KEY_HASH = 'eddafa79375ae67a152d5e93ab2eecb42b29f22b6cb753f79357bef6b7cca5b8';
const TTL_SECONDS = 3 * 24 * 60 * 60;

function moscowDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function securelyMatchesRecoveryKey(value) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(EXPECTED_KEY_HASH, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createCaptureResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; this.headersSent = true; return payload; },
    end(body) { this.payload = body; this.headersSent = true; return body; },
  };
}

async function runEventsRecovery() {
  const request = {
    method: 'GET',
    url: `/api/daily?date=${RECOVERY_DATE}&only=events`,
    query: { route: 'daily', date: RECOVERY_DATE, only: 'events' },
    headers: { 'x-vercel-cron-schedule': '30 21 * * *' },
  };
  const response = createCaptureResponse();
  await indexHandler.runRuntime(request, response);
  if (response.statusCode >= 300 || response.payload?.ok === false) {
    const detail = response.payload?.results?.events?.error || response.payload?.error || `HTTP ${response.statusCode}`;
    throw new Error(`Events recovery failed: ${detail}`);
  }
  return response.payload;
}

async function handler(req, res) {
  if (moscowDateKey() !== RECOVERY_DATE) {
    return res.status(410).json({ ok: false, error: 'recovery-expired' });
  }
  if (!securelyMatchesRecoveryKey(req.query?.key)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-recovery' });
  }

  const cache = getRecoveryCache();
  const completed = await cache.get(RECOVERY_KEY);
  if (completed?.completed === true) {
    return res.status(200).json({ ok: true, alreadyCompleted: true, completedAt: completed.completedAt || null });
  }

  const labor = await indexHandler.publishDailyLaborArticle();
  const events = await runEventsRecovery();
  const completedAt = new Date().toISOString();
  await cache.set(RECOVERY_KEY, { completed: true, completedAt }, {
    ttl: TTL_SECONDS,
    tags: ['one-time-recovery'],
    name: RECOVERY_KEY,
  });

  return res.status(200).json({ ok: true, labor, events, completedAt });
}

module.exports = handler;
module.exports.moscowDateKey = moscowDateKey;
module.exports.securelyMatchesRecoveryKey = securelyMatchesRecoveryKey;
module.exports.runEventsRecovery = runEventsRecovery;

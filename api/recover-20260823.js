const { createHash, timingSafeEqual } = require('node:crypto');
const indexHandler = require('./index.js');
const { getRecoveryCache } = require('./stateful-cache.cjs');

const RECOVERY_DATE = '2026-08-23';
const RECOVERY_KEY = 'recovery-20260823-complete';
const EXPECTED_KEY_HASH = 'ed06a21ce6c7d58cc1228538ec04a6a6057a25ea0ac08dbe7d29fe06c3e29956';
const EVENTS_RECOVERY_DATE = '2026-08-26';
const EVENTS_RECOVERY_KEY = 'events-recovery-20260826-complete';
const EVENTS_EXPECTED_KEY_HASH = '8c09eb7a108c22cdf6814353ad846b2a4866394458edbe62199131a5c9b72c46';
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

function securelyMatchesHash(value, expectedHash) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function securelyMatchesRecoveryKey(value) {
  return securelyMatchesHash(value, EXPECTED_KEY_HASH);
}

function securelyMatchesEventsRecoveryKey(value) {
  return securelyMatchesHash(value, EVENTS_EXPECTED_KEY_HASH);
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

async function runEventsRecovery(dateKey = RECOVERY_DATE) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) throw new Error('CRON_SECRET is not configured');
  const request = {
    method: 'GET',
    url: `/api/daily?date=${dateKey}&only=events`,
    query: { route: 'daily', date: dateKey, only: 'events' },
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      'x-vercel-cron-schedule': '30 21 * * *',
    },
  };
  const response = createCaptureResponse();
  await indexHandler.runRuntime(request, response);
  if (response.statusCode >= 300 || response.payload?.ok === false) {
    const detail = response.payload?.results?.events?.error || response.payload?.error || `HTTP ${response.statusCode}`;
    throw new Error(`Events recovery failed: ${detail}`);
  }
  return response.payload;
}

async function recordCompletion(cache, key, completedAt) {
  await cache.set(key, { completed: true, completedAt }, {
    ttl: TTL_SECONDS,
    tags: ['one-time-recovery'],
    name: key,
  });
}

async function handler(req, res) {
  const today = moscowDateKey();
  const cache = getRecoveryCache();

  if (today === EVENTS_RECOVERY_DATE) {
    if (!securelyMatchesEventsRecoveryKey(req.query?.key)) {
      return res.status(401).json({ ok: false, error: 'unauthorized-events-recovery' });
    }
    const completed = await cache.get(EVENTS_RECOVERY_KEY);
    if (completed?.completed === true) {
      return res.status(200).json({ ok: true, alreadyCompleted: true, completedAt: completed.completedAt || null });
    }

    const events = await runEventsRecovery(EVENTS_RECOVERY_DATE);
    const completedAt = new Date().toISOString();
    await recordCompletion(cache, EVENTS_RECOVERY_KEY, completedAt);
    return res.status(200).json({ ok: true, events, completedAt });
  }

  if (today !== RECOVERY_DATE) {
    return res.status(410).json({ ok: false, error: 'recovery-expired' });
  }
  if (!securelyMatchesRecoveryKey(req.query?.key)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-recovery' });
  }

  const completed = await cache.get(RECOVERY_KEY);
  if (completed?.completed === true) {
    return res.status(200).json({ ok: true, alreadyCompleted: true, completedAt: completed.completedAt || null });
  }

  const labor = await indexHandler.publishDailyLaborArticle();
  const events = await runEventsRecovery();
  const completedAt = new Date().toISOString();
  await recordCompletion(cache, RECOVERY_KEY, completedAt);

  return res.status(200).json({ ok: true, labor, events, completedAt });
}

module.exports = handler;
module.exports.moscowDateKey = moscowDateKey;
module.exports.securelyMatchesRecoveryKey = securelyMatchesRecoveryKey;
module.exports.securelyMatchesEventsRecoveryKey = securelyMatchesEventsRecoveryKey;
module.exports.runEventsRecovery = runEventsRecovery;

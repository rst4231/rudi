const { getControlPlaneCache } = require('./stateful-cache.cjs');

const DAILY_CRON_STATE_KEY = 'daily-cron:last-attempt';
const DAILY_CRON_STATE_TTL_SECONDS = 60 * 60 * 24 * 35;

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeDailyCronState(input = {}) {
  const status = ['started', 'unauthorized', 'completed', 'failed'].includes(String(input.status))
    ? String(input.status)
    : 'started';
  return {
    status,
    authorized: input.authorized === true,
    startedAt: normalizeTimestamp(input.startedAt),
    finishedAt: normalizeTimestamp(input.finishedAt),
    error: input.error ? String(input.error).slice(0, 500) : null,
  };
}

function resolveCache(options = {}) {
  return options.cache || getControlPlaneCache(options.cacheOptions || {});
}

async function recordDailyCronState(input, options = {}) {
  const state = normalizeDailyCronState(input);
  await resolveCache(options).set(DAILY_CRON_STATE_KEY, state, {
    ttl: DAILY_CRON_STATE_TTL_SECONDS,
    tags: ['rudi-daily-cron-state'],
    name: DAILY_CRON_STATE_KEY,
  });
  return state;
}

async function getDailyCronState(options = {}) {
  const value = await resolveCache(options).get(DAILY_CRON_STATE_KEY);
  return value && typeof value === 'object' ? normalizeDailyCronState(value) : null;
}

module.exports = {
  DAILY_CRON_STATE_KEY,
  normalizeDailyCronState,
  recordDailyCronState,
  getDailyCronState,
};

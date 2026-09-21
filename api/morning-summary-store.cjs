const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-morning-summary-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

function cacheOf(options = {}) {
  return options.summaryCache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function sentKey(date, actor) {
  return 'sent:' + String(date || '') + ':' + String(actor || '');
}

function stateKey(actor) {
  return 'state:' + String(actor || '');
}

async function wasSummarySent(date, actor, options = {}) {
  if (!date || !actor) return false;
  return Boolean(await cacheOf(options).get(sentKey(date, actor)).catch(() => null));
}

async function readSummaryState(actor, options = {}) {
  if (!actor) return null;
  const value = await cacheOf(options).get(stateKey(actor)).catch(() => null);
  if (!value || typeof value !== 'object') return null;
  return {
    sentAt: String(value.sentAt || ''),
    date: String(value.date || ''),
  };
}

async function markSummarySent(date, actor, sentAt, options = {}) {
  if (!date || !actor) return false;
  const cache = cacheOf(options);
  const value = { date: String(date), sentAt: String(sentAt || new Date().toISOString()) };
  await Promise.all([
    cache.set(sentKey(date, actor), true, {
      ttl: TTL_SECONDS,
      tags: ['rudi-morning-summary'],
      name: 'morning-summary-' + date + '-' + actor,
    }),
    cache.set(stateKey(actor), value, {
      ttl: TTL_SECONDS,
      tags: ['rudi-morning-summary'],
      name: 'morning-summary-state-' + actor,
    }),
  ]);
  return true;
}

module.exports = {
  NAMESPACE,
  TTL_SECONDS,
  wasSummarySent,
  readSummaryState,
  markSummarySent,
};

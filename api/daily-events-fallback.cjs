const indexHandler = require('./index.js');
const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { getTopicMaintenanceCache } = require('./stateful-cache.cjs');
const { EVENTS_TOPIC_ID, dateKeyInMoscow } = require('./topic-maintenance.cjs');

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

async function runEventsFallback(options = {}) {
  const dateKey = options.dateKey || dateKeyInMoscow(options.now || new Date());
  const cache = options.cache || getTopicMaintenanceCache(options.cacheOptions || {});
  const stored = await cache.get(`topic:${EVENTS_TOPIC_ID}:${dateKey}:messages`);
  const messageIds = Array.isArray(stored)
    ? [...new Set(stored.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (messageIds.length >= 2) {
    return { skipped: 'already-published', date: dateKey, messageIds };
  }

  const runtime = options.runtime || indexHandler.runRuntime;
  const secret = String(options.cronSecret || process.env.CRON_SECRET || '').trim();
  if (!secret && !options.allowUnauthenticatedRuntime) {
    throw new Error('CRON_SECRET is not configured for events fallback');
  }
  const req = {
    method: 'GET',
    url: `/api/daily?date=${encodeURIComponent(dateKey)}&only=events`,
    query: { route: 'daily', date: dateKey, only: 'events' },
    headers: secret ? {
      authorization: `Bearer ${secret}`,
      'x-vercel-cron-schedule': '30 22 * * *',
    } : {},
  };
  const res = createCaptureResponse();
  await runtime(req, res);
  if (res.statusCode >= 300 || res.payload?.ok === false) {
    const detail = res.payload?.results?.events?.error || res.payload?.error || `HTTP ${res.statusCode}`;
    throw new Error(`Events fallback failed: ${detail}`);
  }
  return {
    ran: true,
    date: dateKey,
    priorMessageIds: messageIds,
    result: res.payload?.results?.events || res.payload || null,
  };
}

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }
  try {
    const result = await runEventsFallback();
    console.log('RUDI_EVENTS_FALLBACK_RESULT', result);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('RUDI_EVENTS_FALLBACK_ERROR', error);
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
module.exports.runEventsFallback = runEventsFallback;
module.exports.createCaptureResponse = createCaptureResponse;

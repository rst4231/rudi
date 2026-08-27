const { createHash, timingSafeEqual } = require('node:crypto');
const indexHandler = require('./index.js');
const {
  getRecoveryCache,
  getTopicMaintenanceCache,
  getCinemaPremieresCache,
} = require('./stateful-cache.cjs');
const {
  EVENTS_TOPIC_ID,
  deleteTrackedMessages,
  getKnownForumChatId,
} = require('./topic-maintenance.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { publishWeeklyCinemaPremieres } = require('./cinema-premieres-collage.cjs');

const RECOVERY_DATE = '2026-08-23';
const RECOVERY_KEY = 'recovery-20260823-complete';
const EXPECTED_KEY_HASH = 'ed06a21ce6c7d58cc1228538ec04a6a6057a25ea0ac08dbe7d29fe06c3e29956';
const EVENTS_RECOVERY_DATE = '2026-08-26';
const EVENTS_RECOVERY_KEY = 'events-recovery-20260826-complete';
const EVENTS_FINALIZE_KEY = 'events-recovery-20260826-finalized';
const EVENTS_EXPECTED_KEY_HASH = '8c09eb7a108c22cdf6814353ad846b2a4866394458edbe62199131a5c9b72c46';
const CINEMA_RECOVERY_DATE = '2026-08-27';
const CINEMA_RECOVERY_KEY = 'cinema-recovery-20260827-complete';
const CINEMA_EXPECTED_KEY_HASH = 'dcc8262f572bcca4597378a311933924a6afa916a253fdcb354c58b13fa14aa7';
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

function securelyMatchesCinemaRecoveryKey(value) {
  return securelyMatchesHash(value, CINEMA_EXPECTED_KEY_HASH);
}

function cinemaRecoveryIsComplete(cinema) {
  return cinema?.complete === true && Number(cinema?.published || 0) > 0;
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

async function loadEventsPreview(dateKey, options = {}) {
  const runRuntime = options.runRuntime || indexHandler.runRuntime;
  const request = {
    method: 'GET',
    url: `/api/preview?date=${dateKey}&only=events`,
    query: { route: 'preview', date: dateKey, only: 'events' },
    headers: {},
  };
  const response = createCaptureResponse();
  await runRuntime(request, response);
  if (response.statusCode >= 300 || response.payload?.ok === false) {
    const detail = response.payload?.results?.events?.error || response.payload?.error || `HTTP ${response.statusCode}`;
    throw new Error(`Events preview failed: ${detail}`);
  }
  const preview = response.payload?.results?.events?.preview;
  if (!preview || (!preview.concerts && !preview.stage)) throw new Error('Events preview is empty');
  return preview;
}

async function sendTelegramEventText({ token, chatId, text, fetchImpl }) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: EVENTS_TOPIC_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram event republish failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }
  const payload = await response.json();
  const messageId = Number(payload?.result?.message_id);
  if (!Number.isInteger(messageId) || messageId <= 0) throw new Error('Telegram event republish did not return message_id');
  return messageId;
}

async function finalizeEventsRecovery(dateKey = EVENTS_RECOVERY_DATE, options = {}) {
  const topicCache = options.topicCache || getTopicMaintenanceCache();
  const token = String(options.token || resolveTelegramBotToken(process.env)).trim();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const chatId = options.chatId ?? await getKnownForumChatId({ cache: topicCache });
  if (chatId === undefined || chatId === null || chatId === '') throw new Error('Forum chat id is unavailable for event finalization');

  const trackedMessagesKey = `topic:${EVENTS_TOPIC_ID}:${dateKey}:messages`;
  const cleanupMarkerKey = `topic:${EVENTS_TOPIC_ID}:${dateKey}:cleanup-target`;
  const stored = await topicCache.get(trackedMessagesKey);
  const trackedBefore = Array.isArray(stored)
    ? [...new Set(stored.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];

  const preview = await loadEventsPreview(dateKey, options);
  await topicCache.delete(cleanupMarkerKey);
  const cleanup = await deleteTrackedMessages({
    topicId: EVENTS_TOPIC_ID,
    targetDateKey: dateKey,
    chatId,
    cache: topicCache,
    baseUrl: `https://api.telegram.org/bot${token}`,
    fetchImpl,
  });

  const sentMessageIds = [];
  for (const text of [preview.concerts, preview.stage].filter(Boolean)) {
    sentMessageIds.push(await sendTelegramEventText({ token, chatId, text, fetchImpl }));
  }
  if (!sentMessageIds.length) throw new Error('Events finalization did not publish any messages');

  return {
    trackedBefore,
    deleted: Number(cleanup?.deleted || 0),
    sentMessageIds,
  };
}

async function runCinemaRecovery(dateKey = CINEMA_RECOVERY_DATE, options = {}) {
  const cinemaCache = options.cinemaCache || getCinemaPremieresCache();
  const publish = options.publish || publishWeeklyCinemaPremieres;
  await cinemaCache.delete(`done:${dateKey}`);
  const now = options.now || new Date(`${dateKey}T09:00:00+03:00`);
  return publish({ now, cache: cinemaCache });
}

async function recordCompletion(cache, key, completedAt, detail = {}) {
  await cache.set(key, { completed: true, completedAt, ...detail }, {
    ttl: TTL_SECONDS,
    tags: ['one-time-recovery'],
    name: key,
  });
}

async function handler(req, res) {
  const today = moscowDateKey();
  const cache = getRecoveryCache();

  if (today === CINEMA_RECOVERY_DATE) {
    if (!securelyMatchesCinemaRecoveryKey(req.query?.key)) {
      return res.status(401).json({ ok: false, error: 'unauthorized-cinema-recovery' });
    }
    const completed = await cache.get(CINEMA_RECOVERY_KEY);
    if (completed?.completed === true && cinemaRecoveryIsComplete(completed.cinema)) {
      return res.status(200).json({ ok: true, alreadyCompleted: true, ...completed });
    }

    const cinema = await runCinemaRecovery(CINEMA_RECOVERY_DATE);
    const completedAt = new Date().toISOString();
    if (!cinemaRecoveryIsComplete(cinema)) {
      return res.status(503).json({
        ok: false,
        retryable: true,
        error: 'cinema-recovery-incomplete',
        cinema,
        completedAt,
      });
    }
    await recordCompletion(cache, CINEMA_RECOVERY_KEY, completedAt, { cinema });
    return res.status(200).json({ ok: true, cinema, completedAt });
  }

  if (today === EVENTS_RECOVERY_DATE) {
    if (!securelyMatchesEventsRecoveryKey(req.query?.key)) {
      return res.status(401).json({ ok: false, error: 'unauthorized-events-recovery' });
    }
    const finalized = await cache.get(EVENTS_FINALIZE_KEY);
    if (finalized?.completed === true) {
      return res.status(200).json({ ok: true, alreadyCompleted: true, ...finalized });
    }

    const events = await finalizeEventsRecovery(EVENTS_RECOVERY_DATE);
    const completedAt = new Date().toISOString();
    await recordCompletion(cache, EVENTS_FINALIZE_KEY, completedAt, events);
    await recordCompletion(cache, EVENTS_RECOVERY_KEY, completedAt, events);
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
module.exports.securelyMatchesCinemaRecoveryKey = securelyMatchesCinemaRecoveryKey;
module.exports.cinemaRecoveryIsComplete = cinemaRecoveryIsComplete;
module.exports.runEventsRecovery = runEventsRecovery;
module.exports.loadEventsPreview = loadEventsPreview;
module.exports.finalizeEventsRecovery = finalizeEventsRecovery;
module.exports.runCinemaRecovery = runCinemaRecovery;

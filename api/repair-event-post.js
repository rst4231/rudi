const { createHash, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');

const { runPreview } = require('./preview.js');
const { replaceEventMessage, isConcertDigestText } = require('./event-collage.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { getKnownForumChatId } = require('./topic-maintenance.cjs');
const { resolveForumChatId } = require('./forum-chat-id.cjs');
const { getRecoveryCache } = require('./stateful-cache.cjs');

const REPAIR_DATE = '2026-08-30';
const OLD_MESSAGE_ID = 768;
const EVENTS_TOPIC_ID = 19;
const REPAIR_KEY = 'event-post-repair-20260830-768';
const EXPECTED_KEY_HASH = '0a2505035d92e4f499e4194a662b18995a2106ffc2ea3c7dbb779095903c0f0c';
const TTL_SECONDS = 2 * 24 * 60 * 60;

function moscowDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function securelyMatchesRepairKey(value) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(EXPECTED_KEY_HASH, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readGeneratedRuntimeSource() {
  try { return fs.readFileSync(require.resolve('../runtime/generated-runtime.cjs'), 'utf8'); }
  catch { return ''; }
}

function createCaptureResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    payload: null,
    status(code) { this.statusCode = Number(code) || 200; return this; },
    json(payload) { this.payload = payload; this.headersSent = true; return payload; },
    send(payload) { this.payload = payload; this.headersSent = true; return payload; },
    setHeader() {},
  };
}

async function loadConcertText(options = {}) {
  if (typeof options.concertText === 'string' && options.concertText.trim()) return options.concertText.trim();
  const req = { method: 'GET', query: { date: REPAIR_DATE } };
  const res = createCaptureResponse();
  const previewRunner = options.runPreview || runPreview;
  await previewRunner(req, res, options.previewOptions || {});
  if (res.statusCode >= 400) throw new Error(`Event preview failed with status ${res.statusCode}`);
  const parts = res.payload?.sections?.events?.parts || [];
  const text = parts.find((part) => isConcertDigestText(part));
  if (!text) throw new Error('Pop and hip-hop concert preview is unavailable');
  return text;
}

async function resolveChatId(options = {}) {
  if (options.chatId !== undefined && options.chatId !== null) return options.chatId;
  const cached = await getKnownForumChatId();
  return resolveForumChatId({
    cached,
    env: options.env || process.env,
    runtimeSource: cached === null ? readGeneratedRuntimeSource() : '',
  });
}

async function runEventPostRepair(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (moscowDateKey(now) !== REPAIR_DATE) return { ok: false, status: 410, error: 'event-repair-expired' };

  const cache = options.cache || getRecoveryCache();
  const completed = await cache.get(REPAIR_KEY);
  if (completed?.completed === true) return { ok: true, status: 200, alreadyCompleted: true, ...completed };

  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = await resolveChatId(options);
  if (chatId === null || chatId === undefined || chatId === '') throw new Error('Telegram forum chat id is unavailable');
  const text = await loadConcertText(options);
  const replace = options.replaceEventMessage || replaceEventMessage;
  const replacement = await replace({
    token,
    chatId,
    topicId: EVENTS_TOPIC_ID,
    oldMessageId: OLD_MESSAGE_ID,
    text,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    telegramFetchImpl: options.telegramFetchImpl || globalThis.fetch,
  });

  const result = {
    completed: true,
    completedAt: now.toISOString(),
    oldMessageId: OLD_MESSAGE_ID,
    newMessageId: replacement.newMessageId,
    topicId: EVENTS_TOPIC_ID,
  };
  await cache.set(REPAIR_KEY, result, {
    ttl: TTL_SECONDS,
    tags: ['one-time-recovery'],
    name: REPAIR_KEY,
  });
  return { ok: true, status: 200, ...result };
}

async function handler(req, res) {
  if (!securelyMatchesRepairKey(req?.query?.key)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-event-repair' });
  }
  try {
    const result = await runEventPostRepair();
    return res.status(result.status || 200).json(result);
  } catch (error) {
    console.error('RUDI_EVENT_POST_REPAIR_ERROR', error);
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
module.exports.runEventPostRepair = runEventPostRepair;
module.exports.securelyMatchesRepairKey = securelyMatchesRepairKey;
module.exports.loadConcertText = loadConcertText;
module.exports.moscowDateKey = moscowDateKey;
module.exports.REPAIR_DATE = REPAIR_DATE;
module.exports.OLD_MESSAGE_ID = OLD_MESSAGE_ID;
module.exports.EVENTS_TOPIC_ID = EVENTS_TOPIC_ID;

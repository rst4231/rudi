const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { appendForDiMessages } = require('./for-di-feed-store.cjs');

const FOR_DI_TOPIC_ID = 126;
const TTL_SECONDS = 60 * 60 * 24 * 14;
const MAX_MESSAGES_PER_DAY = 20;

function cacheOf(options = {}) {
  return options.forDiCache || options.cache || createStrictRuntimeCache({
    namespace: 'rudi-for-di-private-v1',
    confirmWrites: false,
    ...(options.cacheOptions || {}),
  });
}

function dateKeyInMoscow(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function messageKey(dateKey) {
  return `for-di:messages:${dateKey}`;
}

function fingerprint(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 24);
}

function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return '';
    return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || '';
  } catch {
    return '';
  }
}

function parsePayload(init = {}) {
  if (typeof init.body === 'string') {
    try { return JSON.parse(init.body); } catch { return null; }
  }
  if (init.body instanceof URLSearchParams) return Object.fromEntries(init.body.entries());
  if (typeof FormData !== 'undefined' && init.body instanceof FormData) return Object.fromEntries(init.body.entries());
  return null;
}

async function queueForDiMessage(text, options = {}) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;
  const now = options.now || new Date();
  const dateKey = options.dateKey || dateKeyInMoscow(now);
  const cache = cacheOf(options);
  const key = messageKey(dateKey);
  const current = await cache.get(key).catch(() => null);
  const rows = Array.isArray(current) ? current : [];
  const id = fingerprint(normalized);
  const existing = rows.find((row) => row?.fingerprint === id);
  if (existing) return existing;
  const entry = {
    fingerprint: id,
    text: normalized,
    parseMode: options.parseMode === false ? false : true,
    source: String(options.source || '').trim() || null,
    createdAt: new Date(now).toISOString(),
  };
  const next = [...rows, entry].slice(-MAX_MESSAGES_PER_DAY);
  await cache.set(key, next, { ttl: TTL_SECONDS, tags: ['rudi-for-di-private'] });
  return entry;
}

async function queueForDiTelegramRequest(input, init = {}, options = {}) {
  const method = telegramMethod(input);
  if (!['sendMessage', 'sendPhoto', 'sendDocument', 'sendVideo', 'sendAudio', 'sendVoice', 'sendAnimation'].includes(method)) return null;
  const payload = parsePayload(init);
  if (Number(payload?.message_thread_id) !== FOR_DI_TOPIC_ID) return null;
  const text = typeof payload?.text === 'string' ? payload.text : (typeof payload?.caption === 'string' ? payload.caption : '');
  return queueForDiMessage(text, options);
}

async function readForDiMessages(options = {}) {
  const now = options.now || new Date();
  const dateKey = options.dateKey || dateKeyInMoscow(now);
  const cache = cacheOf(options);
  const rows = await cache.get(messageKey(dateKey)).catch(() => null);
  const messages = Array.isArray(rows) ? rows.filter((row) => String(row?.text || '').trim()) : [];
  return { dateKey, messages };
}

async function hasQueuedForDiSource(sources, options = {}) {
  const wanted = new Set((Array.isArray(sources) ? sources : [sources]).map((value) => String(value || '').trim()).filter(Boolean));
  if (!wanted.size) return false;
  const { messages } = await readForDiMessages(options);
  return messages.some((row) => wanted.has(String(row?.source || '').trim()));
}

async function publishForDiToRudi(options = {}) {
  const now = options.now || new Date();
  const { dateKey, messages } = await readForDiMessages({ ...options, now });
  const publishable = messages.filter((row) => String(row?.source || '').trim() === 'labor');
  if (!publishable.length) {
    return {
      dateKey,
      queued: messages.length,
      published: 0,
      sent: 0,
      skipped: messages.length ? 'no-enabled-categories' : 'empty',
      stylistDevelopmentEnabled: false,
    };
  }

  const result = await appendForDiMessages(publishable, dateKey, {
    ...options,
    now,
  });

  return {
    dateKey,
    queued: messages.length,
    published: result.added,
    total: result.state.items.length,
    sent: 0,
    telegramDelivery: false,
    stylistDevelopmentEnabled: false,
  };
}

module.exports = {
  FOR_DI_TOPIC_ID,
  dateKeyInMoscow,
  queueForDiMessage,
  queueForDiTelegramRequest,
  readForDiMessages,
  hasQueuedForDiSource,
  publishForDiToRudi,
};

const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const HOLIDAYS_TOPIC_ID = 44;
const STATE_NAMESPACE = 'rudi-holiday-rollover-v1';
const TOPIC_NAMESPACE = 'rudi-topic-maintenance-v1';
const STATE_KEY = 'holidays:live-messages';
const STATE_REPLICA_COUNT = 3;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 90;
const LOOKBACK_DAYS = 35;
const MESSAGE_CREATING_METHODS = new Set([
  'sendMessage', 'sendPhoto', 'sendMediaGroup', 'sendDocument', 'sendVideo',
  'sendAudio', 'sendVoice', 'sendAnimation', 'sendVenue', 'sendLocation',
  'sendContact', 'sendPoll', 'sendDice', 'sendSticker',
]);

function telegramEndpoint(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return null;
    const match = url.pathname.match(/^(\/bot[^/]+)\/([A-Za-z0-9_]+)$/);
    return match ? { baseUrl: `${url.origin}${match[1]}`, method: match[2] } : null;
  } catch { return null; }
}

function parseRequestPayload(init = {}) {
  if (typeof init.body === 'string') {
    try { return JSON.parse(init.body); } catch { return null; }
  }
  if (init.body instanceof URLSearchParams) {
    return Object.fromEntries(init.body.entries());
  }
  return null;
}

function extractMessageIds(result) {
  const rows = Array.isArray(result) ? result : [result];
  return [...new Set(rows.map((row) => Number(row?.message_id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function dateKeyInMoscow(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function stateKey(index) { return `${STATE_KEY}:${index}`; }

function normalizeState(value) {
  if (!value || typeof value !== 'object') return null;
  const messageIds = [...new Set((Array.isArray(value.messageIds) ? value.messageIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  return { version: Number(value.version || 0), messageIds };
}

async function readLatestState(cache) {
  const values = await Promise.all(Array.from({ length: STATE_REPLICA_COUNT }, (_, index) => cache.get(stateKey(index))));
  return values.map(normalizeState).filter(Boolean).sort((a, b) => b.version - a.version)[0] || null;
}

async function writeState(cache, messageIds, version = Date.now()) {
  const state = { version, messageIds: [...new Set(messageIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))] };
  await Promise.all(Array.from({ length: STATE_REPLICA_COUNT }, (_, index) => cache.set(stateKey(index), state, {
    ttl: CACHE_TTL_SECONDS, tags: ['rudi-holiday-rollover'],
  })));
  const confirmed = await readLatestState(cache);
  if (!confirmed || confirmed.version < version) throw new Error('Holiday rollover state did not persist');
  return confirmed;
}

async function readTrackedHolidayMessages(topicCache, now = new Date(), lookbackDays = LOOKBACK_DAYS) {
  const today = dateKeyInMoscow(now);
  const dateKeys = Array.from({ length: lookbackDays + 1 }, (_, age) => shiftDateKey(today, -age));
  const storedByDate = await Promise.all(dateKeys.map((dateKey) =>
    topicCache.get(`topic:${HOLIDAYS_TOPIC_ID}:${dateKey}:messages`)));
  const found = new Set();
  for (const stored of storedByDate) {
    if (!Array.isArray(stored)) continue;
    for (const id of stored) {
      const numeric = Number(id);
      if (Number.isInteger(numeric) && numeric > 0) found.add(numeric);
    }
  }
  return [...found];
}

async function responseDetail(response) {
  let detail = '';
  try { detail = await response.text(); } catch {}
  return detail;
}

function isAlreadyGoneResponse(response, detail) {
  return response.status === 400
    && /message to delete not found|MESSAGE_ID_INVALID|message identifier is not specified/i.test(detail);
}

async function deleteMessageChunk(baseUrl, chatId, messageIds, fetchImpl) {
  return fetchImpl(`${baseUrl}/deleteMessages`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_ids: messageIds }),
  });
}

async function deleteMessages(baseUrl, chatId, messageIds, fetchImpl) {
  const ids = [...new Set(messageIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return 0;
  let deleted = 0;
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const response = await deleteMessageChunk(baseUrl, chatId, chunk, fetchImpl);
    if (response.ok) {
      deleted += chunk.length;
      continue;
    }
    const detail = await responseDetail(response);
    if (!isAlreadyGoneResponse(response, detail)) {
      throw new Error(`Telegram deleteMessages failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
    }
    if (chunk.length === 1) {
      deleted += 1;
      continue;
    }
    for (const id of chunk) {
      const single = await deleteMessageChunk(baseUrl, chatId, [id], fetchImpl);
      if (single.ok) {
        deleted += 1;
        continue;
      }
      const singleDetail = await responseDetail(single);
      if (!isAlreadyGoneResponse(single, singleDetail)) {
        throw new Error(`Telegram deleteMessages failed: HTTP ${single.status}${singleDetail ? ` ${singleDetail}` : ''}`);
      }
      deleted += 1;
    }
  }
  return deleted;
}

async function handleHolidayPublication(input, init, response, options = {}) {
  const endpoint = telegramEndpoint(input);
  const payload = parseRequestPayload(init);
  if (!endpoint || !MESSAGE_CREATING_METHODS.has(endpoint.method)) return response;
  if (Number(payload?.message_thread_id) !== HOLIDAYS_TOPIC_ID || !response?.ok) return response;

  const body = await response.clone().json();
  const newMessageIds = extractMessageIds(body?.result);
  if (!newMessageIds.length) return response;

  const stateCache = options.stateCache || createStrictRuntimeCache({ namespace: STATE_NAMESPACE, ...(options.cacheOptions || {}) });
  const topicCache = options.topicCache || createStrictRuntimeCache({ namespace: TOPIC_NAMESPACE, ...(options.cacheOptions || {}) });
  const current = await readLatestState(stateCache);
  const previousIds = current?.messageIds?.length
    ? current.messageIds
    : await readTrackedHolidayMessages(topicCache, options.now || new Date(), options.lookbackDays || LOOKBACK_DAYS);
  const newSet = new Set(newMessageIds);
  const staleIds = previousIds.filter((id) => !newSet.has(id));

  try {
    await deleteMessages(endpoint.baseUrl, payload?.chat_id, staleIds, options.fetchImpl || globalThis.fetch);
    await writeState(stateCache, newMessageIds);
  } catch (error) {
    await writeState(stateCache, [...staleIds, ...newMessageIds]);
    throw error;
  }
  return response;
}

module.exports = {
  HOLIDAYS_TOPIC_ID, STATE_NAMESPACE, TOPIC_NAMESPACE,
  telegramEndpoint, parseRequestPayload, extractMessageIds,
  readLatestState, writeState, readTrackedHolidayMessages,
  deleteMessages, handleHolidayPublication,
};

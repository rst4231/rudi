const EVENTS_TOPIC_ID = 19;
const HOLIDAYS_TOPIC_ID = 44;
const CLIENTS_TOPIC_ID = 126;
const COUPLE_TOPIC_ID = 237;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 35;
const CLEANUP_LOOKBACK_DAYS = 35;
const MANAGED_TOPICS = new Map([
  [EVENTS_TOPIC_ID, 1],
  [HOLIDAYS_TOPIC_ID, 1],
]);
const MESSAGE_CREATING_METHODS = new Set([
  'sendMessage', 'sendPhoto', 'sendMediaGroup', 'sendDocument', 'sendVideo',
  'sendAudio', 'sendVoice', 'sendAnimation', 'sendVenue', 'sendLocation',
  'sendContact', 'sendPoll', 'sendDice', 'sendSticker',
]);

function getRuntimeCache() {
  const { getCache } = require('@vercel/functions');
  return getCache({ namespace: 'rudi-topic-maintenance-v1' });
}

function dateKeyInMoscow(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftDateKey(dateKey, days) {
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function topicMessagesKey(topicId, dateKey) { return `topic:${topicId}:${dateKey}:messages`; }
function topicChatKey(topicId) { return `topic:${topicId}:chat-id`; }
function topicCleanupKey(topicId, dateKey) { return `topic:${topicId}:${dateKey}:cleanup`; }
function topicTargetCleanupKey(topicId, targetDateKey) { return `topic:${topicId}:${targetDateKey}:cleanup-target`; }
function coupleDeletedKey(chatId) { return `topic:${COUPLE_TOPIC_ID}:deleted:${chatId}`; }

function telegramEndpoint(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return null;
    const match = url.pathname.match(/^(\/bot[^/]+)\/([A-Za-z0-9_]+)$/);
    if (!match) return null;
    return { method: match[2], baseUrl: `${url.origin}${match[1]}` };
  } catch { return null; }
}

function parseRequestPayload(init = {}) {
  if (typeof init.body === 'string') {
    try { return JSON.parse(init.body); } catch { return null; }
  }
  if (init.body instanceof URLSearchParams) {
    const payload = Object.fromEntries(init.body.entries());
    if (payload.message_thread_id !== undefined) payload.message_thread_id = Number(payload.message_thread_id);
    if (payload.chat_id !== undefined && /^-?\d+$/.test(payload.chat_id)) payload.chat_id = Number(payload.chat_id);
    return payload;
  }
  if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
    const payload = Object.fromEntries(init.body.entries());
    if (payload.message_thread_id !== undefined) payload.message_thread_id = Number(payload.message_thread_id);
    if (payload.chat_id !== undefined && /^-?\d+$/.test(String(payload.chat_id))) payload.chat_id = Number(payload.chat_id);
    return payload;
  }
  return null;
}

function telegramOkResponse(result = true) {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}

async function telegramJsonCall(baseUrl, method, payload, fetchImpl) {
  return fetchImpl(`${baseUrl}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
}

function extractMessageIds(result) {
  const rows = Array.isArray(result) ? result : [result];
  return rows.map((row) => Number(row?.message_id)).filter((id) => Number.isInteger(id) && id > 0);
}

function sanitizeClientsText(text) {
  if (typeof text !== 'string') return null;
  const marker = /(?:💡\s*)?<b>Совет[^<\n]*от маркетолога<\/b>/i;
  const match = marker.exec(text);
  if (!match) return null;
  const prefixStart = text.lastIndexOf('💡', match.index);
  return text.slice(prefixStart >= 0 ? prefixStart : match.index).trim();
}

function sanitizeClientsRequest(init, payload) {
  const field = typeof payload?.text === 'string' ? 'text' : (typeof payload?.caption === 'string' ? 'caption' : null);
  if (!field) return { init, allowed: false };
  const cleaned = sanitizeClientsText(payload[field]);
  if (!cleaned) return { init, allowed: false };
  if (typeof init.body === 'string') {
    return { init: { ...init, body: JSON.stringify({ ...payload, [field]: cleaned }) }, allowed: true };
  }
  if (init.body instanceof URLSearchParams) {
    const body = new URLSearchParams(init.body);
    body.set(field, cleaned);
    return { init: { ...init, body }, allowed: true };
  }
  if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
    const body = new FormData();
    for (const [key, value] of init.body.entries()) {
      if (key === field) continue;
      if (typeof value === 'string') body.append(key, value);
      else body.append(key, value, typeof value.name === 'string' && value.name ? value.name : 'blob');
    }
    body.set(field, cleaned);
    return { init: { ...init, body }, allowed: true };
  }
  return { init, allowed: false };
}

async function rememberPublishedMessages(topicId, chatId, messageIds, dateKey, cache) {
  if (!MANAGED_TOPICS.has(topicId) || !messageIds.length) return;
  const key = topicMessagesKey(topicId, dateKey);
  const existing = await cache.get(key);
  const previous = Array.isArray(existing) ? existing : [];
  const merged = [...new Set([...previous, ...messageIds])];
  await cache.set(key, merged, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-topic-messages'] });
  await cache.set(topicChatKey(topicId), chatId, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-topic-messages'] });
}

async function deleteTrackedMessages({ topicId, targetDateKey, chatId, cache, baseUrl, fetchImpl }) {
  const markerKey = topicTargetCleanupKey(topicId, targetDateKey);
  if (await cache.get(markerKey)) return { skipped: true, deleted: 0 };
  const stored = await cache.get(topicMessagesKey(topicId, targetDateKey));
  const messageIds = Array.isArray(stored)
    ? [...new Set(stored.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (!messageIds.length) return { deleted: 0 };

  let deleted = 0;
  for (let index = 0; index < messageIds.length; index += 100) {
    const chunk = messageIds.slice(index, index + 100);
    const response = await telegramJsonCall(baseUrl, 'deleteMessages', { chat_id: chatId, message_ids: chunk }, fetchImpl);
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch {}
      throw new Error(`Telegram deleteMessages failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
    }
    deleted += chunk.length;
  }
  await cache.set(markerKey, true, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-topic-cleanup'] });
  await cache.delete(topicMessagesKey(topicId, targetDateKey));
  return { deleted };
}

async function deletePreviousDayTrackedMessages({ topicId, todayKey, chatId, cache, baseUrl, fetchImpl }) {
  const targetDateKey = shiftDateKey(todayKey, -1);
  return deleteTrackedMessages({ topicId, targetDateKey, chatId, cache, baseUrl, fetchImpl });
}

async function prepareDailyTopicCleanup(options = {}) {
  const cache = options.cache || getRuntimeCache();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = String(options.token || '').trim();
  if (!token) throw new Error('Telegram bot token is required for topic cleanup');
  const baseUrl = `https://api.telegram.org/bot${token}`;
  const todayKey = dateKeyInMoscow(options.now || new Date());
  const lookbackDays = Math.max(1, Number(options.lookbackDays || CLEANUP_LOOKBACK_DAYS));
  const results = [];

  for (const [topicId, retentionDays] of MANAGED_TOPICS) {
    const chatId = await cache.get(topicChatKey(topicId));
    if (chatId === undefined || chatId === null || chatId === '') {
      results.push({ topicId, skipped: 'chat-id-not-recorded' });
      continue;
    }
    for (let ageDays = retentionDays; ageDays <= lookbackDays; ageDays += 1) {
      const targetDateKey = shiftDateKey(todayKey, -ageDays);
      try {
        const result = await deleteTrackedMessages({ topicId, targetDateKey, chatId, cache, baseUrl, fetchImpl });
        if (result.deleted || ageDays === retentionDays) results.push({ topicId, targetDateKey, ...result });
      } catch (error) {
        console.error('RUDI_TOPIC_CLEANUP_ERROR', { topicId, targetDateKey, error });
        results.push({ topicId, targetDateKey, error: String(error?.message || error) });
      }
    }
    await cache.set(topicCleanupKey(topicId, todayKey), true, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-topic-cleanup'] });
  }
  return results;
}

async function getKnownForumChatId(options = {}) {
  const cache = options.cache || getRuntimeCache();
  for (const topicId of [EVENTS_TOPIC_ID, HOLIDAYS_TOPIC_ID]) {
    const chatId = await cache.get(topicChatKey(topicId));
    if (chatId !== undefined && chatId !== null && chatId !== '') return chatId;
  }
  return null;
}

async function deleteCoupleTopicOnce({ chatId, baseUrl, cache, fetchImpl }) {
  if (chatId === undefined || chatId === null || chatId === '') return false;
  const key = coupleDeletedKey(chatId);
  if (await cache.get(key)) return true;
  const response = await telegramJsonCall(baseUrl, 'deleteForumTopic', {
    chat_id: chatId, message_thread_id: COUPLE_TOPIC_ID,
  }, fetchImpl);
  if (response.ok) {
    await cache.set(key, true, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-removed-topics'] });
    return true;
  }
  let detail = '';
  try { detail = await response.text(); } catch {}
  if (!/TOPIC_ID_INVALID/i.test(detail)) {
    console.error('RUDI_COUPLE_TOPIC_DELETE_ERROR', `HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
  }
  return false;
}

async function handleTelegramTopicRequest(input, init = {}, options = {}) {
  const endpoint = telegramEndpoint(input);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!endpoint) return fetchImpl(input, init);

  let payload = parseRequestPayload(init);
  const topicId = Number(payload?.message_thread_id);
  let nextInit = init;

  if (topicId === CLIENTS_TOPIC_ID && MESSAGE_CREATING_METHODS.has(endpoint.method)) {
    const sanitized = sanitizeClientsRequest(init, payload);
    if (!sanitized.allowed) return telegramOkResponse({ message_id: 0, message_thread_id: CLIENTS_TOPIC_ID });
    nextInit = sanitized.init;
    payload = parseRequestPayload(nextInit);
  }

  let cache;
  if (topicId === COUPLE_TOPIC_ID && MESSAGE_CREATING_METHODS.has(endpoint.method)) {
    try {
      cache = options.cache || getRuntimeCache();
      await deleteCoupleTopicOnce({ chatId: payload?.chat_id, baseUrl: endpoint.baseUrl, cache, fetchImpl });
    } catch (error) { console.error('RUDI_COUPLE_TOPIC_MAINTENANCE_ERROR', error); }
    return telegramOkResponse({ message_id: 0, message_thread_id: COUPLE_TOPIC_ID });
  }

  if (MANAGED_TOPICS.has(topicId) && MESSAGE_CREATING_METHODS.has(endpoint.method)) {
    try {
      cache = options.cache || getRuntimeCache();
      await deleteCoupleTopicOnce({ chatId: payload?.chat_id, baseUrl: endpoint.baseUrl, cache, fetchImpl });
    } catch (error) { console.error('RUDI_COUPLE_TOPIC_MAINTENANCE_ERROR', error); }
  }

  const response = await fetchImpl(input, nextInit);
  if (!response.ok || !MANAGED_TOPICS.has(topicId) || !MESSAGE_CREATING_METHODS.has(endpoint.method)) return response;

  try {
    cache = cache || options.cache || getRuntimeCache();
    const body = await response.clone().json();
    const messageIds = extractMessageIds(body?.result);
    if (messageIds.length) {
      const todayKey = dateKeyInMoscow(options.now || new Date());
      try {
        await deletePreviousDayTrackedMessages({
          topicId,
          todayKey,
          chatId: payload?.chat_id,
          cache,
          baseUrl: endpoint.baseUrl,
          fetchImpl,
        });
      } catch (error) {
        console.error('RUDI_TOPIC_ROLLOVER_ERROR', { topicId, error });
      }
      await rememberPublishedMessages(topicId, payload?.chat_id, messageIds, todayKey, cache);
    }
  } catch (error) { console.error('RUDI_TOPIC_MESSAGE_TRACK_ERROR', error); }
  return response;
}

function isRemovedCoupleTopicUpdate(req) {
  const update = req?.body || {};
  const message = update.callback_query?.message || update.message || update.edited_message;
  return Number(message?.message_thread_id) === COUPLE_TOPIC_ID;
}

function sanitizeHealthPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.topics || typeof payload.topics !== 'object') return payload;
  const { couple, ...topics } = payload.topics;
  return { ...payload, topics };
}

module.exports = {
  EVENTS_TOPIC_ID, HOLIDAYS_TOPIC_ID, CLIENTS_TOPIC_ID, COUPLE_TOPIC_ID,
  dateKeyInMoscow, shiftDateKey, prepareDailyTopicCleanup, getKnownForumChatId,
  handleTelegramTopicRequest, isRemovedCoupleTopicUpdate, sanitizeHealthPayload,
  sanitizeClientsText, telegramEndpoint, parseRequestPayload, rememberPublishedMessages,
  deleteTrackedMessages, deleteCoupleTopicOnce,
};

const EVENTS_TOPIC_ID = 19;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 35;
const ACTIVE_KEY = `topic:${EVENTS_TOPIC_ID}:active`;
const STATUS_KEY = `topic:${EVENTS_TOPIC_ID}:cleanup:last`;

function normalizeMessageIds(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function normalizeActiveState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const dateKey = String(input.dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const chatId = input.chatId;
  if (chatId === undefined || chatId === null || chatId === '') return null;
  const messageIds = normalizeMessageIds(input.messageIds);
  if (!messageIds.length) return null;
  return { dateKey, chatId, messageIds };
}

function normalizeDateKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeCleanupStatus(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const date = normalizeDateKey(input.date);
  if (!date) return null;
  let checkedAt;
  try { checkedAt = new Date(input.checkedAt).toISOString(); } catch { return null; }
  if (checkedAt === 'Invalid Date') return null;
  return {
    checkedAt,
    trigger: String(input.trigger || '').trim() || 'unknown',
    date,
    targetDateKey: normalizeDateKey(input.targetDateKey),
    tracked: Math.max(0, Number(input.tracked || 0)),
    deleted: Math.max(0, Number(input.deleted || 0)),
    skipped: input.skipped ? String(input.skipped).slice(0, 200) : null,
    error: input.error ? String(input.error).slice(0, 500) : null,
  };
}

function alreadyDeleted(detail) {
  return /message to delete not found|MESSAGE_ID_INVALID|message identifier is not specified/i.test(String(detail || ''));
}

async function rememberActiveEventMessages({ dateKey, chatId, messageIds, cache }) {
  const ids = normalizeMessageIds(messageIds);
  if (!ids.length) return null;
  const nextDateKey = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDateKey)) throw new Error('Active event date must be YYYY-MM-DD');
  if (chatId === undefined || chatId === null || chatId === '') throw new Error('Active event chat id is required');

  const current = normalizeActiveState(await cache.get(ACTIVE_KEY));
  if (current && current.dateKey !== nextDateKey) return current;

  const next = {
    dateKey: nextDateKey,
    chatId,
    messageIds: [...new Set([...(current?.messageIds || []), ...ids])],
  };
  await cache.set(ACTIVE_KEY, next, {
    ttl: CACHE_TTL_SECONDS,
    tags: ['rudi-topic-messages'],
    name: ACTIVE_KEY,
  });
  return next;
}

async function rememberEventCleanupStatus(input, cache) {
  const status = normalizeCleanupStatus(input);
  if (!status) throw new Error('Invalid event cleanup status');
  await cache.set(STATUS_KEY, status, {
    ttl: CACHE_TTL_SECONDS,
    tags: ['rudi-topic-cleanup'],
    name: STATUS_KEY,
  });
  return status;
}

async function getEventCleanupStatus(cache) {
  return normalizeCleanupStatus(await cache.get(STATUS_KEY));
}

async function deleteActiveEventMessagesBeforeDate({ beforeDateKey, chatId, cache, baseUrl, fetchImpl }) {
  const active = normalizeActiveState(await cache.get(ACTIVE_KEY));
  if (!active) return { tracked: 0, deleted: 0, skipped: 'active-not-recorded' };
  const boundary = String(beforeDateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(boundary)) throw new Error('Active event cleanup date must be YYYY-MM-DD');
  if (active.dateKey >= boundary) {
    return { tracked: active.messageIds.length, deleted: 0, skipped: 'active-is-current', targetDateKey: active.dateKey };
  }

  const effectiveChatId = active.chatId ?? chatId;
  if (effectiveChatId === undefined || effectiveChatId === null || effectiveChatId === '') {
    return { tracked: active.messageIds.length, deleted: 0, skipped: 'chat-id-not-recorded', targetDateKey: active.dateKey };
  }
  const response = await fetchImpl(`${baseUrl}/deleteMessages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: effectiveChatId, message_ids: active.messageIds }),
  });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    if (!alreadyDeleted(detail)) {
      throw new Error(`Telegram active event deleteMessages failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
    }
  }

  await cache.delete(ACTIVE_KEY);
  await cache.delete(`topic:${EVENTS_TOPIC_ID}:${active.dateKey}:messages`);
  return { tracked: active.messageIds.length, deleted: active.messageIds.length, targetDateKey: active.dateKey };
}

module.exports = {
  ACTIVE_KEY,
  STATUS_KEY,
  normalizeActiveState,
  normalizeCleanupStatus,
  rememberActiveEventMessages,
  rememberEventCleanupStatus,
  getEventCleanupStatus,
  deleteActiveEventMessagesBeforeDate,
};

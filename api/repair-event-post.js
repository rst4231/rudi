const { createHash, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');

const { replaceEventMessage, isConcertDigestText } = require('./event-collage.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { getKnownForumChatId, rememberPublishedMessages, resolveTopicCache } = require('./topic-maintenance.cjs');
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function safeEntityUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function entityTags(entity, text) {
  const type = String(entity?.type || '');
  if (type === 'bold') return ['<b>', '</b>'];
  if (type === 'italic') return ['<i>', '</i>'];
  if (type === 'underline') return ['<u>', '</u>'];
  if (type === 'strikethrough') return ['<s>', '</s>'];
  if (type === 'code') return ['<code>', '</code>'];
  if (type === 'text_link') {
    const url = safeEntityUrl(entity?.url);
    return url ? [`<a href="${escapeHtml(url)}">`, '</a>'] : null;
  }
  if (type === 'url') {
    const offset = Number(entity?.offset);
    const length = Number(entity?.length);
    const url = safeEntityUrl(text.slice(offset, offset + length));
    return url ? [`<a href="${escapeHtml(url)}">`, '</a>'] : null;
  }
  return null;
}

function telegramMessageToHtml(message = {}) {
  const text = String(message.text ?? message.caption ?? '');
  const entities = Array.isArray(message.entities)
    ? message.entities
    : Array.isArray(message.caption_entities) ? message.caption_entities : [];
  const supported = entities.map((entity) => {
    const offset = Number(entity?.offset);
    const length = Number(entity?.length);
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0 || offset + length > text.length) return null;
    const tags = entityTags(entity, text);
    return tags ? { offset, end: offset + length, open: tags[0], close: tags[1] } : null;
  }).filter(Boolean);

  if (!supported.length) return escapeHtml(text);
  const boundaries = new Set([0, text.length]);
  for (const entity of supported) {
    boundaries.add(entity.offset);
    boundaries.add(entity.end);
  }
  const positions = [...boundaries].sort((a, b) => a - b);
  let html = '';
  for (let index = 0; index < positions.length - 1; index += 1) {
    const position = positions[index];
    const next = positions[index + 1];
    const closing = supported
      .filter((entity) => entity.end === position)
      .sort((a, b) => b.offset - a.offset || a.end - b.end);
    for (const entity of closing) html += entity.close;
    const opening = supported
      .filter((entity) => entity.offset === position)
      .sort((a, b) => b.end - a.end);
    for (const entity of opening) html += entity.open;
    html += escapeHtml(text.slice(position, next));
  }
  const finalPosition = positions.at(-1);
  const finalClosing = supported
    .filter((entity) => entity.end === finalPosition)
    .sort((a, b) => b.offset - a.offset || a.end - b.end);
  for (const entity of finalClosing) html += entity.close;
  return html;
}

async function telegramJsonCall(telegramFetchImpl, token, method, payload) {
  const response = await telegramFetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await response.clone().json(); } catch {}
  if (!response?.ok || data?.ok === false) {
    const detail = data?.description ? ` ${data.description}` : '';
    throw new Error(`Telegram ${method} failed: HTTP ${response?.status || 0}${detail}`);
  }
  return data?.result;
}

async function readOriginalEventText(options = {}) {
  const token = String(options.token || '').trim();
  const chatId = options.chatId;
  const topicId = Number(options.topicId);
  const oldMessageId = Number(options.oldMessageId);
  const telegramFetchImpl = options.telegramFetchImpl || globalThis.fetch;
  if (!token) throw new Error('Telegram bot token is required');
  if (chatId === undefined || chatId === null || chatId === '') throw new Error('Telegram chat id is required');
  if (!Number.isInteger(topicId) || topicId <= 0) throw new Error('Telegram topic id is required');
  if (!Number.isInteger(oldMessageId) || oldMessageId <= 0) throw new Error('Old Telegram message id is required');

  let temporaryMessageId = null;
  let forwarded;
  try {
    forwarded = await telegramJsonCall(telegramFetchImpl, token, 'forwardMessage', {
      chat_id: chatId,
      message_thread_id: topicId,
      from_chat_id: chatId,
      message_id: oldMessageId,
      disable_notification: true,
    });
    temporaryMessageId = Number(forwarded?.message_id) || null;
    const html = telegramMessageToHtml(forwarded);
    if (!html.trim() || !isConcertDigestText(html)) throw new Error('Forwarded message is not the expected concert digest');
    return html;
  } finally {
    if (Number.isInteger(temporaryMessageId) && temporaryMessageId > 0) {
      await telegramJsonCall(telegramFetchImpl, token, 'deleteMessage', {
        chat_id: chatId,
        message_id: temporaryMessageId,
      });
    }
  }
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
  const text = typeof options.concertText === 'string' && options.concertText.trim()
    ? options.concertText.trim()
    : await readOriginalEventText({
      token,
      chatId,
      topicId: EVENTS_TOPIC_ID,
      oldMessageId: OLD_MESSAGE_ID,
      telegramFetchImpl: options.telegramFetchImpl || globalThis.fetch,
    });
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

  const topicCache = options.topicCache || resolveTopicCache(options.topicCacheOptions || {});
  await rememberPublishedMessages(
    EVENTS_TOPIC_ID,
    chatId,
    [replacement.newMessageId],
    moscowDateKey(now),
    topicCache,
  );

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
module.exports.telegramMessageToHtml = telegramMessageToHtml;
module.exports.readOriginalEventText = readOriginalEventText;
module.exports.moscowDateKey = moscowDateKey;
module.exports.REPAIR_DATE = REPAIR_DATE;
module.exports.OLD_MESSAGE_ID = OLD_MESSAGE_ID;
module.exports.EVENTS_TOPIC_ID = EVENTS_TOPIC_ID;

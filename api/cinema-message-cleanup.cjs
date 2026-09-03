const { getPublicationRecord } = require('./publication-journal.cjs');
const { getKnownForumChatId } = require('./topic-maintenance.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { loadEventsConfig } = require('./events-config.cjs');

const MAX_CLEANUP_IDS = 20;

function normalizeMessageIds(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, MAX_CLEANUP_IDS);
}

function isCinemaCleanupText(value) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  return /(?:^|\s)Кинопремьеры\s+—\s+/iu.test(text)
    || /Новых\s+кинопремьер\s+на\s+этой\s+неделе\s+в\s+Кинополис\s+Мурино\s+и\s+Мираж\s+Синема\s+не\s+найдено/iu.test(text);
}

async function telegramJson(fetchImpl, token, method, payload) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await response.clone().json(); } catch {}
  return { response, data };
}

async function cleanupCinemaMessages(input = {}, options = {}) {
  const date = String(input.date || '').trim();
  const messageIds = normalizeMessageIds(input.messageIds);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid-date');
  if (!messageIds.length) throw new Error('messageIds-required');

  const getRecord = options.getRecord || ((requestedDate) => getPublicationRecord(requestedDate, 'cinema', { cache: options.journalCache }));
  const current = await getRecord(date, 'cinema');
  const protectedSet = new Set(normalizeMessageIds(current?.messageIds));
  const protectedIds = messageIds.filter((id) => protectedSet.has(id));
  const candidates = messageIds.filter((id) => !protectedSet.has(id));
  if (!candidates.length) return { date, deleted: [], protected: protectedIds, rejected: [], unavailable: [] };

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = options.chatId
    || await getKnownForumChatId({ cache: options.topicCache })
    || findForumChatIdInEnv(options.env || process.env);
  if (!chatId) throw new Error('Telegram forum chat id is unavailable for cinema cleanup');

  let topicId = Number(options.topicId);
  if (!Number.isInteger(topicId) || topicId <= 0) {
    const config = options.config || await (options.configLoader || loadEventsConfig)({ fetchImpl, now: Date.now() });
    topicId = Number(config?.cinemaPremieres?.topicId);
  }
  if (!Number.isInteger(topicId) || topicId <= 0) throw new Error('Cinema topic id is unavailable for cleanup');

  const deleted = [];
  const rejected = [];
  const unavailable = [];

  for (const messageId of candidates) {
    const forwarded = await telegramJson(fetchImpl, token, 'forwardMessage', {
      chat_id: chatId,
      message_thread_id: topicId,
      from_chat_id: chatId,
      message_id: messageId,
      disable_notification: true,
    });
    if (!forwarded.response?.ok || !forwarded.data?.result) {
      unavailable.push(messageId);
      continue;
    }

    const temporaryId = Number(forwarded.data.result.message_id);
    const text = forwarded.data.result.caption || forwarded.data.result.text || '';
    if (Number.isInteger(temporaryId) && temporaryId > 0) {
      try { await telegramJson(fetchImpl, token, 'deleteMessage', { chat_id: chatId, message_id: temporaryId }); } catch {}
    }

    if (!isCinemaCleanupText(text)) {
      rejected.push(messageId);
      continue;
    }

    const removed = await telegramJson(fetchImpl, token, 'deleteMessage', { chat_id: chatId, message_id: messageId });
    if (removed.response?.ok) deleted.push(messageId);
    else unavailable.push(messageId);
  }

  return { date, deleted, protected: protectedIds, rejected, unavailable };
}

module.exports = {
  MAX_CLEANUP_IDS,
  normalizeMessageIds,
  isCinemaCleanupText,
  cleanupCinemaMessages,
};

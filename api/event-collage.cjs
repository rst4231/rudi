const base = require('./event-collage-base.cjs');
const { wrapStageEventFetch } = require('./stage-poster.cjs');

function withStageEventFetch(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return { ...options, fetchImpl: wrapStageEventFetch(fetchImpl) };
}

async function fetchEventPoster(pageUrl, options = {}) {
  return base.fetchEventPoster(pageUrl, withStageEventFetch(options));
}

async function maybeSendEventCollage(input, init = {}, options = {}) {
  return base.maybeSendEventCollage(input, init, withStageEventFetch(options));
}

async function responseJson(response) {
  try { return await response.clone().json(); } catch { return null; }
}

async function replaceEventMessage(options = {}) {
  const token = String(options.token || '').trim();
  const chatId = options.chatId;
  const topicId = Number(options.topicId);
  const oldMessageId = Number(options.oldMessageId);
  const text = String(options.text || '').trim();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const telegramFetchImpl = options.telegramFetchImpl || fetchImpl;
  if (!token) throw new Error('Telegram bot token is required');
  if (chatId === undefined || chatId === null || chatId === '') throw new Error('Telegram chat id is required');
  if (!Number.isInteger(topicId) || topicId <= 0) throw new Error('Telegram topic id is required');
  if (!Number.isInteger(oldMessageId) || oldMessageId <= 0) throw new Error('Old Telegram message id is required');
  if (!text) throw new Error('Event text is required');

  const sendUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  const photoResponse = await maybeSendEventCollage(sendUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: topicId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  }, { fetchImpl, telegramFetchImpl, timeoutMs: options.timeoutMs });
  if (!photoResponse?.ok) throw new Error('Event collage was not published');
  const photoData = await responseJson(photoResponse);
  const newMessageId = Number(photoData?.result?.message_id);
  if (!Number.isInteger(newMessageId) || newMessageId <= 0) throw new Error('Telegram collage message id is unavailable');

  const deleteResponse = await telegramFetchImpl(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: oldMessageId }),
  });
  if (!deleteResponse?.ok) {
    let detail = '';
    try { detail = await deleteResponse.text(); } catch {}
    throw new Error(`Telegram old event delete failed: HTTP ${deleteResponse?.status || 0}${detail ? ` ${detail}` : ''}`);
  }

  return { oldMessageId, newMessageId, topicId };
}

module.exports = {
  ...base,
  fetchEventPoster,
  maybeSendEventCollage,
  replaceEventMessage,
};

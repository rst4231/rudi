const base = require('./event-collage-base.cjs');
const { wrapStageEventFetch } = require('./stage-poster.cjs');

function withStageEventFetch(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return { ...options, fetchImpl: wrapStageEventFetch(fetchImpl) };
}

function isNumberedEventLine(line) {
  return /^(?:<[^>]+>\s*)*\d+\.\s/u.test(String(line || '').trimStart());
}

function normalizeStageLocationLine(line) {
  const value = String(line || '').trim();
  const match = value.match(/^(📍\s*Stage StandUp Club)\s*\|\s*[^,|]+(?:\s*\|\s*)?,?\s*(.+)$/iu);
  if (!match) return value;
  const address = String(match[2] || '').replace(/^[,|\s]+/u, '').trim();
  return address ? `${match[1]}, ${address}` : match[1];
}

function sanitizeStageDigestText(text) {
  const source = String(text || '');
  if (!base.isStageDigestText(source)) return source;

  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  const locationLine = lines.find((line) => /^📍\s*Stage StandUp Club/iu.test(line.trim()));
  const location = locationLine ? normalizeStageLocationLine(locationLine) : '';
  const output = [];
  let locationInserted = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^💳/u.test(trimmed)) continue;
    if (/^📍\s*Stage StandUp Club/iu.test(trimmed)) continue;
    if (!locationInserted && location && isNumberedEventLine(trimmed)) {
      output.push(location);
      locationInserted = true;
    }
    output.push(line);
  }

  if (location && !locationInserted) output.push(location);
  return output.join('\n');
}

function sanitizeStageTelegramRequest(init = {}) {
  if (typeof init.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      if (!base.isStageDigestText(payload?.text)) return init;
      const text = sanitizeStageDigestText(payload.text);
      if (text === payload.text) return init;
      return { ...init, body: JSON.stringify({ ...payload, text }) };
    } catch {
      return init;
    }
  }
  if (init.body instanceof URLSearchParams) {
    const text = init.body.get('text');
    if (!base.isStageDigestText(text)) return init;
    const sanitized = sanitizeStageDigestText(text);
    if (sanitized === text) return init;
    const body = new URLSearchParams(init.body);
    body.set('text', sanitized);
    return { ...init, body };
  }
  return init;
}

function compactEventCaption(text) {
  return base.compactEventCaption(sanitizeStageDigestText(text));
}

function compactEventTelegramRequest(init = {}) {
  return base.compactEventTelegramRequest(sanitizeStageTelegramRequest(init));
}

function fitEventCaption(text, maxVisible) {
  return base.fitEventCaption(sanitizeStageDigestText(text), maxVisible);
}

async function fetchEventPoster(pageUrl, options = {}) {
  return base.fetchEventPoster(pageUrl, withStageEventFetch(options));
}

async function maybeSendEventCollage(input, init = {}, options = {}) {
  return base.maybeSendEventCollage(input, sanitizeStageTelegramRequest(init), withStageEventFetch(options));
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
  sanitizeStageDigestText,
  compactEventCaption,
  compactEventTelegramRequest,
  fitEventCaption,
  fetchEventPoster,
  maybeSendEventCollage,
  replaceEventMessage,
};

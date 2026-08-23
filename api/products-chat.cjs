const fs = require('node:fs');
const { cleanProductUtterance } = require('./products-state-base.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { getKnownForumChatId } = require('./topic-maintenance.cjs');
const { resolveForumChatId } = require('./forum-chat-id.cjs');

const PRODUCTS_TOPIC_ID = 263;

function isProductsTopicUpdate(req) {
  const update = req?.body || {};
  const message = update.callback_query?.message
    || update.message
    || update.edited_message
    || update.channel_post
    || update.edited_channel_post;
  return Number(message?.message_thread_id) === PRODUCTS_TOPIC_ID;
}

function aliceInput(req) {
  const request = req?.body?.request || {};
  const command = typeof request.command === 'string' ? request.command.trim() : '';
  const utterance = typeof request.original_utterance === 'string' ? request.original_utterance.trim() : '';
  return command || utterance;
}

function cleanAliceProductText(req) {
  return cleanProductUtterance(aliceInput(req)).trim();
}

function buildAliceProductAddedResponse(req) {
  const text = 'Добавил.';
  return {
    response: { text, tts: text, end_session: false },
    version: req?.body?.version || '1.0',
  };
}

function buildAliceNoSharedListResponse(req) {
  const text = 'Общего списка больше нет. Просто назовите продукты, и Руди отправит их в чат.';
  return {
    response: { text, tts: text, end_session: false },
    version: req?.body?.version || '1.0',
  };
}

function readGeneratedRuntimeSource() {
  try { return fs.readFileSync(require.resolve('../runtime/generated-runtime.cjs'), 'utf8'); }
  catch { return ''; }
}

async function resolveProductsForumChatId() {
  const cached = await getKnownForumChatId();
  return resolveForumChatId({
    cached,
    env: process.env,
    runtimeSource: cached === null ? readGeneratedRuntimeSource() : '',
  });
}

async function telegramJsonCall(token, method, payload, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await response.clone().json(); } catch {}
  if (!response.ok || body?.ok === false) {
    let detail = '';
    if (body) detail = JSON.stringify(body);
    else { try { detail = await response.text(); } catch {} }
    throw new Error(`Telegram ${method} failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
  }
  return body;
}

async function sendAliceProductMessage(req, options = {}) {
  const text = cleanAliceProductText(req);
  if (!text) throw new Error('Product text is empty');
  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = options.chatId ?? await resolveProductsForumChatId();
  if (chatId === null || chatId === undefined || chatId === '') {
    throw new Error('Telegram forum chat id is unavailable');
  }
  const sent = await telegramJsonCall(token, 'sendMessage', {
    chat_id: chatId,
    message_thread_id: PRODUCTS_TOPIC_ID,
    text,
  }, options.fetchImpl || globalThis.fetch);
  const messageId = Number(sent?.result?.message_id);
  return {
    text,
    messageId: Number.isInteger(messageId) ? messageId : null,
  };
}

async function acknowledgeLegacyProductsCallback(req, options = {}) {
  const callbackId = req?.body?.callback_query?.id;
  if (!callbackId) return false;
  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  try {
    await telegramJsonCall(token, 'answerCallbackQuery', {
      callback_query_id: callbackId,
      text: 'Эта кнопка больше не используется.',
    }, fetchImpl);
    return true;
  } catch (error) {
    if (/HTTP 400|query is too old|query ID is invalid|response timeout expired/i.test(String(error?.message || error))) {
      return false;
    }
    throw error;
  }
}

module.exports = {
  PRODUCTS_TOPIC_ID,
  isProductsTopicUpdate,
  cleanAliceProductText,
  buildAliceProductAddedResponse,
  buildAliceNoSharedListResponse,
  resolveProductsForumChatId,
  sendAliceProductMessage,
  acknowledgeLegacyProductsCallback,
  telegramJsonCall,
};

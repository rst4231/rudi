const fs = require('node:fs');
const {
  cleanProductUtterance,
  normalizeCompoundProducts,
  restoreCompoundProducts,
} = require('./products-state-base.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { getKnownForumChatId } = require('./topic-maintenance.cjs');
const { resolveForumChatId } = require('./forum-chat-id.cjs');
const {
  normalizeProductMessageText,
  recordAliceProductMessage,
  findLatestAliceProductMessage,
  removeAliceProductMessageRecord,
  readAliceProductMessageRecords,
  writeAliceProductMessageRecords,
} = require('./products-message-store.cjs');

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

function aliceOriginalInput(req) {
  const request = req?.body?.request || {};
  const utterance = typeof request.original_utterance === 'string' ? request.original_utterance.trim() : '';
  const command = typeof request.command === 'string' ? request.command.trim() : '';
  return utterance || command;
}

function cleanAliceProductText(req) {
  return cleanProductUtterance(aliceInput(req)).trim();
}

function getAliceProductDeleteTarget(req) {
  const text = aliceInput(req)
    .replace(/^руди[,.:;\s-]*/iu, '')
    .trim();
  const match = text.match(/^(?:удали|удалить|удалите|убери|убрать|уберите)\s+(.+)$/iu);
  if (!match) return '';
  return String(match[1] || '')
    .replace(/[.!?]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function splitAliceProductItems(req) {
  if (getAliceProductDeleteTarget(req)) return [];
  const text = cleanProductUtterance(aliceOriginalInput(req)).trim();
  if (!text) return [];

  const protectedText = normalizeCompoundProducts(text);
  const hasExplicitSeparators = /[,;\n]|\s+и\s+/iu.test(protectedText);
  const parts = hasExplicitSeparators
    ? protectedText.split(/\s*(?:[,;\n]+|\s+и\s+)\s*/iu)
    : protectedText.split(/\s+/u);

  return parts
    .map((item) => restoreCompoundProducts(item)
      .replace(/^[-–—•]+\s*/u, '')
      .replace(/[.!?]+$/u, '')
      .replace(/\s+/gu, ' ')
      .trim())
    .filter(Boolean);
}

function buildAliceProductAddedResponse(req) {
  const text = 'Добавил.';
  return {
    response: { text, tts: text, end_session: false },
    version: req?.body?.version || '1.0',
  };
}

function buildAliceProductDeletedResponse(req, result = {}) {
  const text = result.deleted
    ? `Удалил ${result.text}.`
    : `Не нашёл ${result.text || 'такую позицию'}.`;
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

async function sendAliceProductMessages(req, options = {}) {
  const items = splitAliceProductItems(req);
  if (!items.length) throw new Error('Product text is empty');
  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = options.chatId ?? await resolveProductsForumChatId();
  if (chatId === null || chatId === undefined || chatId === '') {
    throw new Error('Telegram forum chat id is unavailable');
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sentItems = [];

  for (const text of items) {
    const sent = await telegramJsonCall(token, 'sendMessage', {
      chat_id: chatId,
      message_thread_id: PRODUCTS_TOPIC_ID,
      text,
    }, fetchImpl);
    const messageId = Number(sent?.result?.message_id);
    if (!Number.isInteger(messageId)) throw new Error('Telegram sendMessage did not return message_id');
    const record = {
      text,
      normalized: normalizeProductMessageText(text),
      messageId,
      createdAt: Number(now()),
    };
    try {
      await recordAliceProductMessage(record, { cache: options.cache });
    } catch (error) {
      try {
        await telegramJsonCall(token, 'deleteMessage', { chat_id: chatId, message_id: messageId }, fetchImpl);
      } catch {}
      throw error;
    }
    sentItems.push(record);
  }

  return { items: sentItems };
}

async function sendAliceProductMessage(req, options = {}) {
  const result = await sendAliceProductMessages(req, options);
  if (result.items.length === 1) return result.items[0];
  return {
    text: result.items.map((item) => item.text).join(', '),
    messageId: null,
    items: result.items,
  };
}

async function deleteAliceProductMessage(req, options = {}) {
  const target = getAliceProductDeleteTarget(req);
  if (!target) return { deleted: false, text: '' };
  const record = await findLatestAliceProductMessage(target, { cache: options.cache });
  if (!record) return { deleted: false, text: target };

  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = options.chatId ?? await resolveProductsForumChatId();
  if (chatId === null || chatId === undefined || chatId === '') {
    throw new Error('Telegram forum chat id is unavailable');
  }
  await telegramJsonCall(token, 'deleteMessage', {
    chat_id: chatId,
    message_id: record.messageId,
  }, options.fetchImpl || globalThis.fetch);
  await removeAliceProductMessageRecord(record, { cache: options.cache });
  return { deleted: true, text: record.text, messageId: record.messageId };
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
  getAliceProductDeleteTarget,
  splitAliceProductItems,
  buildAliceProductAddedResponse,
  buildAliceProductDeletedResponse,
  buildAliceNoSharedListResponse,
  resolveProductsForumChatId,
  sendAliceProductMessage,
  sendAliceProductMessages,
  deleteAliceProductMessage,
  readAliceProductMessageRecords,
  writeAliceProductMessageRecords,
  acknowledgeLegacyProductsCallback,
  telegramJsonCall,
};

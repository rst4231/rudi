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

const IMPLICIT_PRODUCT_START = /^(?:картошк\p{L}*|орех\p{L}*|чай|кофе|молок\p{L}*|кефир|йогурт\p{L}*|творог\p{L}*|сыр\p{L}*|сметан\p{L}*|масл\p{L}*|яйц\p{L}*|хлеб\p{L}*|батон\p{L}*|булк\p{L}*|лаваш\p{L}*|багет\p{L}*|макарон\p{L}*|рис|греч\p{L}*|овсян\p{L}*|хлопь\p{L}*|фасол\p{L}*|горох\p{L}*|чечев\p{L}*|мук\p{L}*|сахар|соль|специ\p{L}*|приправ\p{L}*|соус\p{L}*|кетчуп|майонез|консерв\p{L}*|вод\p{L}*|сок|газиров\p{L}*|кола|морс|компот|энергет\p{L}*|лимонад|шоколад\p{L}*|конфет\p{L}*|печень\p{L}*|вафл\p{L}*|мармелад\p{L}*|зефир|торт|чипс\p{L}*|сухар\p{L}*|батончик\p{L}*|морожен\p{L}*|пельмен\p{L}*|вареник\p{L}*|наггет\p{L}*|томат\p{L}*|помид\p{L}*|огур\p{L}*|капуст\p{L}*|морков\p{L}*|лук|чеснок|перец|баклаж\p{L}*|кабач\p{L}*|тыкв\p{L}*|св[её]кл\p{L}*|редис\p{L}*|салат|укроп|петруш\p{L}*|кинз\p{L}*|зелень|броккол\p{L}*|цветн\p{L}*|яблок\p{L}*|банан\p{L}*|апельс\p{L}*|мандарин\p{L}*|лимон|лайм|груш\p{L}*|виноград|персик\p{L}*|нектар\p{L}*|абрикос\p{L}*|слив\p{L}*|арбуз|дын\p{L}*|киви|манго|ананас|ягод\p{L}*|клубник\p{L}*|малин\p{L}*|голубик\p{L}*|черник\p{L}*|вишн\p{L}*|черешн\p{L}*|мяс\p{L}*|говя\p{L}*|свин\p{L}*|кур\p{L}*|индей\p{L}*|фарш|котлет\p{L}*|колбас\p{L}*|сосиск\p{L}*|ветчин\p{L}*|бекон|рыб\p{L}*|лосос\p{L}*|с[её]мг\p{L}*|форел\p{L}*|тунец|кревет\p{L}*|морепродукт\p{L}*|бумаг\p{L}*|салфет\p{L}*|пакет\p{L}*|губк\p{L}*|порошок|капсул\p{L}*|перчатк\p{L}*|фольг\p{L}*|пл[её]нк\p{L}*|шампун\p{L}*|гель|мыло|дезодорант|крем|корм|лакомств\p{L}*|пеленк\p{L}*|наполнитель\p{L}*|миска|ошейник|поводок)$/iu;

function splitImplicitProductSequence(value) {
  const words = String(value || '').split(/\s+/u).filter(Boolean);
  if (words.length < 2) return [String(value || '').trim()].filter(Boolean);

  const groups = [];
  let current = [];
  let currentHasProductStart = false;
  for (const word of words) {
    const restored = restoreCompoundProducts(word);
    const startsProduct = IMPLICIT_PRODUCT_START.test(restored);
    if (startsProduct && current.length && currentHasProductStart) {
      groups.push(current.join(' '));
      current = [];
      currentHasProductStart = false;
    }
    current.push(word);
    if (startsProduct) currentHasProductStart = true;
  }
  if (current.length) groups.push(current.join(' '));

  return groups.map((item) => restoreCompoundProducts(item).trim()).filter(Boolean);
}

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
    : splitImplicitProductSequence(protectedText);

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
  splitImplicitProductSequence,
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

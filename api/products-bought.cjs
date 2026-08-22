const { AsyncLocalStorage } = require('node:async_hooks');

const PRODUCTS_TOPIC_ID = 263;
const SHOPPING_BOUGHT_CALLBACK = 'rudi:products:bought';
const productsContext = new AsyncLocalStorage();
const answeredCallbackContext = new AsyncLocalStorage();

function productsContextActive() {
  return productsContext.getStore()?.products === true;
}

function runWithProductsContext(task) {
  return productsContext.run({ products: true }, task);
}

function runWithAnsweredCallbackContext(task) {
  return answeredCallbackContext.run({ callbackAnswered: true }, task);
}

async function runWithExistingClearAction(req, clearCallbackData, task) {
  const callback = req?.body?.callback_query;
  if (!callback) throw new Error('Telegram callback query is missing');
  const originalData = callback.data;
  callback.data = clearCallbackData;
  try {
    return await runWithProductsContext(() => runWithAnsweredCallbackContext(task));
  } finally {
    callback.data = originalData;
  }
}

function isProductsTopicUpdate(req) {
  const update = req?.body || {};
  const message = update.callback_query?.message || update.message || update.edited_message;
  return Number(message?.message_thread_id) === PRODUCTS_TOPIC_ID;
}

function findClearCallbackData(message = {}) {
  const rows = message?.reply_markup?.inline_keyboard;
  if (!Array.isArray(rows)) return null;
  for (const button of rows.flat()) {
    if (!button || typeof button.text !== 'string') continue;
    if (!/очистить/i.test(button.text)) continue;
    if (typeof button.callback_data === 'string' && button.callback_data.trim()) {
      return button.callback_data;
    }
  }
  return null;
}

function isTelegramMethod(input, methods) {
  const value = typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return false;
    const match = url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/);
    return Boolean(match && methods.includes(match[1]));
  } catch {
    return false;
  }
}

function shouldSuppressAnsweredCallbackQuery(input) {
  return answeredCallbackContext.getStore()?.callbackAnswered === true
    && isTelegramMethod(input, ['answerCallbackQuery']);
}

function parseReplyMarkup(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
}

function withBoughtButton(replyMarkup) {
  if (!replyMarkup || !Array.isArray(replyMarkup.inline_keyboard)) return null;
  const exists = replyMarkup.inline_keyboard.flat().some((button) => button?.callback_data === SHOPPING_BOUGHT_CALLBACK);
  if (exists) return replyMarkup;
  return { ...replyMarkup, inline_keyboard: [...replyMarkup.inline_keyboard, [{ text: 'Куплено', callback_data: SHOPPING_BOUGHT_CALLBACK }]] };
}

function addBoughtButtonToTelegramRequest(input, init = {}) {
  if (!isTelegramMethod(input, ['sendMessage', 'editMessageText', 'editMessageReplyMarkup'])) return init;
  if (typeof init.body === 'string') {
    let payload;
    try { payload = JSON.parse(init.body); } catch { return init; }
    const scopedToProducts = Number(payload?.message_thread_id) === PRODUCTS_TOPIC_ID || productsContextActive();
    if (!scopedToProducts) return init;
    const current = parseReplyMarkup(payload.reply_markup);
    const replyMarkup = withBoughtButton(current);
    if (!replyMarkup || replyMarkup === current) return init;
    return { ...init, body: JSON.stringify({ ...payload, reply_markup: replyMarkup }) };
  }
  if (init.body instanceof URLSearchParams) {
    const scopedToProducts = Number(init.body.get('message_thread_id')) === PRODUCTS_TOPIC_ID || productsContextActive();
    if (!scopedToProducts) return init;
    const current = parseReplyMarkup(init.body.get('reply_markup'));
    const replyMarkup = withBoughtButton(current);
    if (!replyMarkup || replyMarkup === current) return init;
    const body = new URLSearchParams(init.body);
    body.set('reply_markup', JSON.stringify(replyMarkup));
    return { ...init, body };
  }
  return init;
}

function formatTelegramUserName(user = {}) {
  const profileName = [user.first_name, user.last_name].filter((part) => typeof part === 'string' && part.trim()).map((part) => part.trim()).join(' ');
  if (profileName) return profileName;
  if (typeof user.username === 'string' && user.username.trim()) return `@${user.username.trim().replace(/^@/, '')}`;
  return 'Пользователь Telegram';
}

function formatMoscowDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.day}.${map.month}.${map.year}, ${map.hour}:${map.minute}`;
}

function resolveTelegramBotToken(env = process.env) {
  const preferredKeys = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_TOKEN', 'TG_BOT_TOKEN', 'BOT_TOKEN'];
  for (const key of preferredKeys) if (typeof env[key] === 'string' && env[key].trim()) return env[key].trim();
  for (const [key, value] of Object.entries(env)) {
    if (!/(telegram|(^|_)tg(_|$)|bot)/i.test(key)) continue;
    if (typeof value === 'string' && /^\d+:[A-Za-z0-9_-]{20,}$/.test(value.trim())) return value.trim();
  }
  throw new Error('Telegram bot token is not configured');
}

async function telegramCall(token, method, payload, fetchImpl) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram ${method} failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
  }
  return response;
}

function isEmptyProductsListMessage(message = {}) {
  const text = [message?.text, message?.caption]
    .find((value) => typeof value === 'string' && value.trim());
  if (!text) return false;
  return /(?:список[^\n.!?]*пуст|пока\s+пуст(?:о)?|ничего\s+не\s+добавлено|нет\s+(?:добавленных\s+)?продуктов|продуктов\s+(?:пока\s+)?нет)/i.test(text);
}

function buildBoughtNotice(callback, now = new Date()) {
  const chatId = callback?.message?.chat?.id;
  if (chatId === undefined || chatId === null) return null;
  const name = formatTelegramUserName(callback.from);
  return {
    chat_id: chatId,
    message_thread_id: PRODUCTS_TOPIC_ID,
    text: `${name} купил продукты\n${formatMoscowDateTime(now)}`,
  };
}

async function handleBoughtCallback(req, res, options = {}) {
  const callback = req?.body?.callback_query;
  if (callback?.data !== SHOPPING_BOUGHT_CALLBACK) return false;
  if (Number(callback?.message?.message_thread_id) !== PRODUCTS_TOPIC_ID) return false;
  const chatId = callback?.message?.chat?.id;
  if (chatId === undefined || chatId === null) return false;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  await telegramCall(token, 'answerCallbackQuery', { callback_query_id: callback.id }, fetchImpl);
  if (isEmptyProductsListMessage(callback.message)) {
    return { empty: true };
  }
  const clearCallbackData = findClearCallbackData(callback.message);
  if (!clearCallbackData) {
    throw new Error('Products Очистить action is missing from the Telegram keyboard');
  }
  return {
    clearCallbackData,
    notice: buildBoughtNotice(callback, options.now || new Date()),
  };
}

async function sendBoughtNotice(action, options = {}) {
  if (!action?.notice) return false;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  await telegramCall(token, 'sendMessage', action.notice, fetchImpl);
  return true;
}

module.exports = {
  PRODUCTS_TOPIC_ID,
  SHOPPING_BOUGHT_CALLBACK,
  addBoughtButtonToTelegramRequest,
  formatTelegramUserName,
  formatMoscowDateTime,
  resolveTelegramBotToken,
  handleBoughtCallback,
  sendBoughtNotice,
  buildBoughtNotice,
  isEmptyProductsListMessage,
  runWithProductsContext,
  isProductsTopicUpdate,
  findClearCallbackData,
  runWithAnsweredCallbackContext,
  shouldSuppressAnsweredCallbackQuery,
  runWithExistingClearAction,
};

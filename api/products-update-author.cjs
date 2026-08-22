const { AsyncLocalStorage } = require('node:async_hooks');

const productsUpdateAuthorContext = new AsyncLocalStorage();

function formatTelegramMutationUser(user = {}) {
  const profileName = [user.first_name, user.last_name]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
    .join(' ');
  if (profileName) return profileName;
  if (typeof user.username === 'string' && user.username.trim()) return `@${user.username.trim().replace(/^@/, '')}`;
  return 'Пользователь Telegram';
}

function extractTelegramMutationUser(req) {
  return req?.body?.callback_query?.from || req?.body?.message?.from || null;
}

function runWithProductsUpdateAuthorName(name, task, options = {}) {
  const normalized = String(name || '').trim();
  if (!normalized) return task();
  return productsUpdateAuthorContext.run({ name: normalized, now: options.now || null }, task);
}

function runWithProductsUpdateAuthor(req, task, options = {}) {
  const user = extractTelegramMutationUser(req);
  if (!user) return task();
  return runWithProductsUpdateAuthorName(formatTelegramMutationUser(user), task, options);
}

function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return '';
    return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || '';
  } catch { return ''; }
}

function formatMoscowTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

function parseReplyMarkup(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function hasProductsKeyboard(replyMarkup) {
  const rows = replyMarkup?.inline_keyboard;
  if (!Array.isArray(rows)) return false;
  return rows.flat().some((button) =>
    /очистить|добавить|куплено/i.test(String(button?.text || ''))
    || String(button?.callback_data || '') === 'rudi:products:bought');
}

function looksLikeProductsList(text, replyMarkup) {
  if (/^\s*обновл(?:е|ё)?н(?:о|а|ы)?\s*:/imu.test(String(text || ''))) return true;
  if (/список\s+(?:покупок|продуктов)/iu.test(String(text || ''))) return true;
  return hasProductsKeyboard(replyMarkup);
}

function withLatestProductsUpdateAuthor(text, name, now = new Date(), replyMarkup = null) {
  if (typeof text !== 'string' || !name) return text;
  if (!looksLikeProductsList(text, replyMarkup)) return text;
  const line = `Обновлено: ${name} · ${formatMoscowTime(now)}`;
  const lines = text.split('\n');
  let changed = false;
  const updated = lines.map((current) => {
    if (!/^\s*обновл(?:е|ё)?н(?:о|а|ы)?\s*:/iu.test(current)) return current;
    changed = true;
    return line;
  });
  if (changed) return updated.join('\n');
  return `${text.trimEnd()}\n\n${line}`;
}

function rewriteBody(init, mutate) {
  if (typeof init.body === 'string') {
    let payload;
    try { payload = JSON.parse(init.body); } catch { return init; }
    const next = mutate(payload);
    return next === payload ? init : { ...init, body: JSON.stringify(next) };
  }
  if (init.body instanceof URLSearchParams) {
    const payload = Object.fromEntries(init.body.entries());
    const next = mutate(payload);
    if (next === payload) return init;
    const body = new URLSearchParams(init.body);
    for (const [key, value] of Object.entries(next)) {
      if (value !== undefined && value !== null) body.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    return { ...init, body };
  }
  return init;
}

function addProductsUpdateAuthorToTelegramRequest(input, init = {}) {
  const context = productsUpdateAuthorContext.getStore();
  const name = context?.name;
  if (!name) return init;
  if (!['sendMessage', 'editMessageText', 'editMessageCaption'].includes(telegramMethod(input))) return init;
  return rewriteBody(init, (payload) => {
    const field = typeof payload?.text === 'string' ? 'text' : (typeof payload?.caption === 'string' ? 'caption' : null);
    if (!field) return payload;
    const replyMarkup = parseReplyMarkup(payload.reply_markup);
    const value = withLatestProductsUpdateAuthor(payload[field], name, context.now || new Date(), replyMarkup);
    if (value === payload[field]) return payload;
    return { ...payload, [field]: value };
  });
}

module.exports = {
  formatTelegramMutationUser,
  extractTelegramMutationUser,
  runWithProductsUpdateAuthor,
  runWithProductsUpdateAuthorName,
  formatMoscowTime,
  looksLikeProductsList,
  withLatestProductsUpdateAuthor,
  addProductsUpdateAuthorToTelegramRequest,
};

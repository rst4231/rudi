const { AsyncLocalStorage } = require('node:async_hooks');

const productsUpdateAuthorContext = new AsyncLocalStorage();

function formatTelegramMutationUser(user = {}) {
  const profileName = [user.first_name, user.last_name]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
    .join(' ');
  if (profileName) return profileName;
  if (typeof user.username === 'string' && user.username.trim()) {
    return `@${user.username.trim().replace(/^@/, '')}`;
  }
  return 'Пользователь Telegram';
}

function extractTelegramMutationUser(req) {
  return req?.body?.callback_query?.from || req?.body?.message?.from || null;
}

function runWithProductsUpdateAuthor(req, task) {
  const user = extractTelegramMutationUser(req);
  if (!user) return task();
  return productsUpdateAuthorContext.run({ name: formatTelegramMutationUser(user) }, task);
}

function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return '';
    return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || '';
  } catch {
    return '';
  }
}

function withLatestProductsUpdateAuthor(text, name) {
  if (typeof text !== 'string' || !name) return text;
  const lines = text.split('\n');
  let changed = false;
  const updated = lines.map((line) => {
    if (!/^\s*обновл(?:е|ё)?н(?:о|а|ы)?\s*:/iu.test(line)) return line;
    if (!/\d{1,2}:\d{2}/u.test(line)) return line;
    changed = true;
    const withoutOldAuthor = line.replace(/\s+·\s+[^·\n]+$/u, '');
    return `${withoutOldAuthor} · ${name}`;
  });
  return changed ? updated.join('\n') : text;
}

function addProductsUpdateAuthorToTelegramRequest(input, init = {}) {
  const name = productsUpdateAuthorContext.getStore()?.name;
  if (!name) return init;
  if (!['sendMessage', 'editMessageText', 'editMessageCaption'].includes(telegramMethod(input))) return init;

  if (typeof init.body === 'string') {
    let payload;
    try { payload = JSON.parse(init.body); } catch { return init; }
    const field = typeof payload?.text === 'string' ? 'text' : (typeof payload?.caption === 'string' ? 'caption' : null);
    if (!field) return init;
    const value = withLatestProductsUpdateAuthor(payload[field], name);
    if (value === payload[field]) return init;
    return { ...init, body: JSON.stringify({ ...payload, [field]: value }) };
  }

  if (init.body instanceof URLSearchParams) {
    const field = init.body.has('text') ? 'text' : (init.body.has('caption') ? 'caption' : null);
    if (!field) return init;
    const current = init.body.get(field);
    const value = withLatestProductsUpdateAuthor(current, name);
    if (value === current) return init;
    const body = new URLSearchParams(init.body);
    body.set(field, value);
    return { ...init, body };
  }

  return init;
}

module.exports = {
  formatTelegramMutationUser,
  extractTelegramMutationUser,
  runWithProductsUpdateAuthor,
  withLatestProductsUpdateAuthor,
  addProductsUpdateAuthorToTelegramRequest,
};

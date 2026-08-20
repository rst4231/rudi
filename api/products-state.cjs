const PRODUCTS_TOPIC_ID = 263;
const PRODUCTS_HISTORY_KEY = 'products:history';
const PRODUCTS_MIGRATION_KEY = 'products:migration:2026-08-20';
const PRODUCTS_HISTORY_TTL_SECONDS = 60 * 60 * 24 * 3650;
const PRODUCTS_CACHE_NAMESPACE = 'rudi-products-state-v2';
const SHARED_PRODUCTS_ACTOR_ID = 263000001;
const WORD_JOINER = '\u2060';
const LEGACY_VISIBLE_PRODUCTS = ['фарш куриный'];

let hydratedHistoryFingerprint = null;
let mutationQueue = Promise.resolve();

function getProductsCache() {
  const { getCache } = require('@vercel/functions');
  return getCache({ namespace: PRODUCTS_CACHE_NAMESPACE });
}

function normalizeCompoundProducts(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/(?<![А-Яа-яЁё])греческ(?:ий|ого|ому|им|ом)?\s+йогурт(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?![А-Яа-яЁё])/giu, `греческий${WORD_JOINER}йогурт`)
    .replace(/(?<![А-Яа-яЁё])(?:фарш\s+курин(?:ый|ого|ому|ым|ом)|курин(?:ый|ого|ому|ым|ом)\s+фарш)(?![А-Яа-яЁё])/giu, `фарш${WORD_JOINER}куриный`);
}

function restoreCompoundProducts(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(new RegExp(`греческий${WORD_JOINER}йогурт`, 'giu'), 'греческий йогурт')
    .replace(new RegExp(`фарш${WORD_JOINER}куриный`, 'giu'), 'фарш куриный');
}

function sanitizeProductPayload(value) {
  if (typeof value === 'string') return restoreCompoundProducts(value);
  if (Array.isArray(value)) return value.map(sanitizeProductPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeProductPayload(item)]));
  }
  return value;
}

function sanitizeProductTelegramRequest(init = {}) {
  if (typeof init.body === 'string') {
    let payload;
    try { payload = JSON.parse(init.body); } catch { return init; }
    const sanitized = sanitizeProductPayload(payload);
    return { ...init, body: JSON.stringify(sanitized) };
  }
  if (init.body instanceof URLSearchParams) {
    const body = new URLSearchParams(init.body);
    let changed = false;
    for (const [key, value] of body.entries()) {
      const restored = restoreCompoundProducts(value);
      if (restored !== value) {
        body.set(key, restored);
        changed = true;
      }
    }
    return changed ? { ...init, body } : init;
  }
  return init;
}

function stripRudiPrefix(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.replace(/^руди[,.:;\s-]*/iu, '').trim();
}

function cleanProductUtterance(value) {
  if (typeof value !== 'string') return '';
  let text = stripRudiPrefix(value);
  if (!text) return '';
  text = text.replace(/^(?:(?:добавь|добавить|запиши|записать|внеси|внести|купи|купить)\s+)(?:мне\s+)?(?:в\s+)?(?:список(?:\s+продуктов)?\s*)?/iu, '');
  return restoreCompoundProducts(text.trim());
}

function getAliceInput(req) {
  const request = req?.body?.request || {};
  const command = typeof request.command === 'string' ? request.command.trim() : '';
  const utterance = typeof request.original_utterance === 'string' ? request.original_utterance.trim() : '';
  return command || utterance;
}

function isEmptyAliceShoppingRequest(req) {
  const request = req?.body?.request || {};
  if (request.type !== 'SimpleUtterance') return false;
  return getAliceInput(req) === '';
}

function getRemovalVerbTarget(value) {
  const text = stripRudiPrefix(value).replace(/[.!?]+$/u, '').trim();
  const match = text.match(/^(?:удали|удалить|удалите|убери|убрать|уберите)(?:\s+(.+))?$/iu);
  if (!match) return null;
  return (match[1] || '').trim();
}

function normalizeRemovalTarget(value) {
  return restoreCompoundProducts(String(value || ''))
    .replace(/^из\s+списка(?:\s+продуктов)?(?:\s+|$)/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function isWholeListRemovalTarget(value) {
  const target = normalizeRemovalTarget(value).toLocaleLowerCase('ru-RU');
  if (!target) return true;
  if (/^(?:все|всё)(?:\s|$)/iu.test(target)) return true;
  if (/^весь\s+список(?:\s|$)/iu.test(target)) return true;
  if (/^список(?:\s|$)/iu.test(target)) return true;
  return /^(?:продукты|покупки)(?:\s+из\s+списка)?$/iu.test(target);
}

function getProductRemovalTarget(value) {
  const verbTarget = getRemovalVerbTarget(value);
  if (verbTarget === null) return '';
  const target = normalizeRemovalTarget(verbTarget);
  return isWholeListRemovalTarget(target) ? '' : target;
}

function isClearIntentText(value) {
  const text = stripRudiPrefix(value);
  if (!text) return false;
  if (/^куплено[.!?]*$/iu.test(text)) return true;
  if (/^(?:все|всё)\s+куплено[.!?]*$/iu.test(text)) return true;

  const removalTarget = getRemovalVerbTarget(text);
  if (removalTarget !== null) return isWholeListRemovalTarget(removalTarget);

  if (/(?:^|\s)(?:очист(?:и|ить|ите)|сброс(?:ь|ить|ьте)|обнул(?:и|ить|ите))(?:\s|$|[.!?])/iu.test(text)) return true;
  if (/(?:^|\s)(?:начн(?:и|ите)|начать)\s+(?:сначала|заново)(?:\s|$|[.!?])/iu.test(text)) return true;
  return /(?:^|\s)(?:созда(?:й|йте|ть)\s+)?нов(?:ый|ого)\s+спис(?:ок|ка)(?:\s|$|[.!?])/iu.test(text);
}

function isAliceClearIntent(req) {
  return isClearIntentText(getAliceInput(req));
}

function buildAliceClearDeniedResponse(req) {
  const text = 'Очистить список можно только кнопкой «Очистить» или «Куплено» в Telegram.';
  return {
    response: { text, tts: text, end_session: false },
    version: req?.body?.version || '1.0',
  };
}

function hasBotCommand(message = {}) {
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (text.startsWith('/')) return true;
  const entities = Array.isArray(message.entities) ? message.entities : [];
  return entities.some((entity) => entity?.type === 'bot_command');
}

function isTelegramProductAddition(req) {
  const message = req?.body?.message;
  if (!message || Number(message.message_thread_id) !== PRODUCTS_TOPIC_ID) return false;
  if (message.from?.is_bot === true) return false;
  if (typeof message.text !== 'string' || !message.text.trim()) return false;
  if (hasBotCommand(message)) return false;
  if (isClearIntentText(message.text)) return false;
  return true;
}

function isTelegramClearIntent(req) {
  const message = req?.body?.message;
  return Boolean(message && Number(message.message_thread_id) === PRODUCTS_TOPIC_ID && isClearIntentText(message.text));
}

function shouldIgnorePassiveTelegramMessage(req) {
  const update = req?.body || {};
  if (update.callback_query) return false;
  if (update.edited_message || update.edited_channel_post) return true;
  const message = update.message;
  if (!message || message.from?.is_bot === true) return false;
  if (Number(message.message_thread_id) === PRODUCTS_TOPIC_ID) return false;
  if (hasBotCommand(message)) return false;
  if (message.reply_to_message?.from?.is_bot === true) return false;
  return typeof message.text === 'string' && Boolean(message.text.trim());
}

function findCallbackButton(message = {}, callbackData) {
  const rows = message?.reply_markup?.inline_keyboard;
  if (!Array.isArray(rows)) return null;
  return rows.flat().find((button) => button?.callback_data === callbackData) || null;
}

function isProductsClearCallback(req) {
  const callback = req?.body?.callback_query;
  if (!callback || Number(callback?.message?.message_thread_id) !== PRODUCTS_TOPIC_ID) return false;
  const button = findCallbackButton(callback.message, callback.data);
  return Boolean(button && typeof button.text === 'string' && /очистить/i.test(button.text));
}

function isProductsAddCallback(req) {
  const callback = req?.body?.callback_query;
  if (!callback || Number(callback?.message?.message_thread_id) !== PRODUCTS_TOPIC_ID) return false;
  const button = findCallbackButton(callback.message, callback.data);
  return Boolean(button && typeof button.text === 'string' && /добавить/i.test(button.text));
}

function normalizeProductsActor(req) {
  const body = req?.body || {};
  if (body.message?.from && typeof body.message.from === 'object') body.message.from.id = SHARED_PRODUCTS_ACTOR_ID;
  if (body.callback_query?.from && typeof body.callback_query.from === 'object') body.callback_query.from.id = SHARED_PRODUCTS_ACTOR_ID;
  if (body.session && typeof body.session === 'object') {
    body.session.new = false;
    body.session.session_id = String(SHARED_PRODUCTS_ACTOR_ID);
    body.session.user = { ...(body.session.user || {}), user_id: String(SHARED_PRODUCTS_ACTOR_ID) };
    body.session.application = { ...(body.session.application || {}), application_id: String(SHARED_PRODUCTS_ACTOR_ID) };
  }
  return req;
}

function getRawProductInput(req) {
  const message = req?.body?.message;
  if (message && Number(message.message_thread_id) === PRODUCTS_TOPIC_ID && typeof message.text === 'string') {
    return message.text.trim();
  }
  return getAliceInput(req);
}

function getProductInput(req) {
  if (isTelegramProductAddition(req)) return cleanProductUtterance(req.body.message.text);
  return cleanProductUtterance(getAliceInput(req));
}

function setProductInput(req, text) {
  const body = req?.body || {};
  if (body.message && Number(body.message.message_thread_id) === PRODUCTS_TOPIC_ID) {
    body.message.text = normalizeCompoundProducts(text);
    return;
  }
  if (body.request && typeof body.request === 'object') {
    const normalized = normalizeCompoundProducts(text);
    body.request.command = normalized;
    body.request.original_utterance = normalized;
  }
}

function dedupeHistory(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const restored = restoreCompoundProducts(trimmed);
    const key = restored.toLocaleLowerCase('ru-RU');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(restored);
  }
  return result;
}

function normalizeProductMatchText(value) {
  return restoreCompoundProducts(String(value || ''))
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function productMatchesRemovalTarget(product, target) {
  const productTokens = new Set(normalizeProductMatchText(product).split(' ').filter(Boolean));
  const targetTokens = normalizeProductMatchText(target).split(' ').filter(Boolean);
  return targetTokens.length > 0 && targetTokens.every((token) => productTokens.has(token));
}

function removeProductsFromHistory(history, target) {
  return dedupeHistory(history).filter((product) => !productMatchesRemovalTarget(product, target));
}

function buildHydratedProductInput(history, current) {
  return normalizeCompoundProducts(dedupeHistory([...(Array.isArray(history) ? history : []), current]).join(', '));
}

function historyFingerprint(history) {
  return JSON.stringify(dedupeHistory(Array.isArray(history) ? history : []));
}

async function cacheSet(cache, key, value) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await cache.set(key, value, { ttl: PRODUCTS_HISTORY_TTL_SECONDS, tags: ['rudi-products-state'] });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Could not persist ${key}`);
}

async function readProductsHistory(cache = getProductsCache()) {
  const stored = await cache.get(PRODUCTS_HISTORY_KEY);
  if (Array.isArray(stored)) return dedupeHistory(stored);

  const migrated = await cache.get(PRODUCTS_MIGRATION_KEY);
  if (migrated) return [];

  const seed = dedupeHistory(LEGACY_VISIBLE_PRODUCTS);
  await cacheSet(cache, PRODUCTS_HISTORY_KEY, seed);
  await cacheSet(cache, PRODUCTS_MIGRATION_KEY, true);
  return seed;
}

async function writeProductsHistory(history, cache = getProductsCache()) {
  const normalized = dedupeHistory(history);
  await cacheSet(cache, PRODUCTS_HISTORY_KEY, normalized);
  await cacheSet(cache, PRODUCTS_MIGRATION_KEY, true);
  return normalized;
}

function enqueueMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

function cloneJson(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

async function runProductsAddition(req, task, options = {}) {
  return enqueueMutation(async () => {
    const cache = options.cache || getProductsCache();
    const originalBody = req?.body;
    req.body = cloneJson(originalBody || {});
    try {
      const rawInput = getRawProductInput(req);
      const removalTarget = getProductRemovalTarget(rawInput);
      if (removalTarget) {
        await readProductsHistory(cache);
        normalizeProductsActor(req);
        setProductInput(req, rawInput);

        const result = await task();

        const latest = await readProductsHistory(cache);
        await writeProductsHistory(removeProductsFromHistory(latest, removalTarget), cache);
        hydratedHistoryFingerprint = null;
        return result;
      }

      const current = getProductInput(req);
      if (!current) return task();

      const history = await readProductsHistory(cache);
      const historyBeforeFingerprint = historyFingerprint(history);
      normalizeProductsActor(req);
      setProductInput(
        req,
        hydratedHistoryFingerprint === historyBeforeFingerprint
          ? current
          : buildHydratedProductInput(history, current),
      );

      const result = await task();

      const latest = await readProductsHistory(cache);
      const updated = await writeProductsHistory([...latest, current], cache);
      hydratedHistoryFingerprint = historyFingerprint(updated);
      return result;
    } catch (error) {
      hydratedHistoryFingerprint = null;
      throw error;
    } finally {
      req.body = originalBody;
    }
  });
}

async function runAuthorizedProductsClear(task, options = {}) {
  return enqueueMutation(async () => {
    const cache = options.cache || getProductsCache();
    try {
      const result = await task();
      const updated = await writeProductsHistory([], cache);
      hydratedHistoryFingerprint = historyFingerprint(updated);
      return result;
    } catch (error) {
      hydratedHistoryFingerprint = null;
      throw error;
    }
  });
}

function markProductsRuntimeStale() {
  hydratedHistoryFingerprint = null;
}

function resetProductsProcessStateForTests() {
  hydratedHistoryFingerprint = null;
  mutationQueue = Promise.resolve();
}

module.exports = {
  PRODUCTS_TOPIC_ID,
  PRODUCTS_HISTORY_KEY,
  PRODUCTS_MIGRATION_KEY,
  SHARED_PRODUCTS_ACTOR_ID,
  WORD_JOINER,
  normalizeCompoundProducts,
  restoreCompoundProducts,
  sanitizeProductPayload,
  sanitizeProductTelegramRequest,
  cleanProductUtterance,
  getProductRemovalTarget,
  removeProductsFromHistory,
  isEmptyAliceShoppingRequest,
  isTelegramProductAddition,
  isTelegramClearIntent,
  shouldIgnorePassiveTelegramMessage,
  isProductsClearCallback,
  isProductsAddCallback,
  isAliceClearIntent,
  buildAliceClearDeniedResponse,
  normalizeProductsActor,
  buildHydratedProductInput,
  readProductsHistory,
  writeProductsHistory,
  runProductsAddition,
  runAuthorizedProductsClear,
  markProductsRuntimeStale,
  resetProductsProcessStateForTests,
};

const { createHash, timingSafeEqual } = require('node:crypto');
const {
  PRODUCTS_TOPIC_ID,
  resolveProductsForumChatId,
  telegramJsonCall,
} = require('./products-chat.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { getProductsCache, clearProducts, markInitialized } = require('./products-durable-state.cjs');
const { PRODUCTS_HISTORY_KEY, PRODUCTS_MIGRATION_KEY } = require('./products-state-base.cjs');
const { getRecoveryCache } = require('./stateful-cache.cjs');

const RETIRE_DATE = '2026-08-23';
const RETIRE_KEY = 'products-chat-retirement-20260823';
const EXPECTED_KEY_HASH = 'b8afc3319bed89e5df91603ff647d51d9c834664b95eaec92015d85734104b81';
const RECOVERY_TTL_SECONDS = 3 * 24 * 60 * 60;
const PRODUCTS_TTL_SECONDS = 60 * 60 * 24 * 3650;

function moscowDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function securelyMatchesRetireKey(value) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(EXPECTED_KEY_HASH, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function retireLegacyProductsState(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = options.chatId ?? await resolveProductsForumChatId();
  if (chatId === null || chatId === undefined || chatId === '') {
    throw new Error('Telegram forum chat id is unavailable');
  }

  await telegramJsonCall(token, 'unpinAllForumTopicMessages', {
    chat_id: chatId,
    message_thread_id: PRODUCTS_TOPIC_ID,
  }, fetchImpl);

  const cache = options.productsCache || getProductsCache();
  await clearProducts({ cache });
  await markInitialized(cache);
  await Promise.all([
    cache.set(PRODUCTS_HISTORY_KEY, [], {
      ttl: PRODUCTS_TTL_SECONDS,
      tags: ['rudi-products-state'],
      name: PRODUCTS_HISTORY_KEY,
    }),
    cache.set(PRODUCTS_MIGRATION_KEY, true, {
      ttl: PRODUCTS_TTL_SECONDS,
      tags: ['rudi-products-state'],
      name: PRODUCTS_MIGRATION_KEY,
    }),
  ]);

  return { unpinned: true, cleared: true, topicId: PRODUCTS_TOPIC_ID };
}

async function handler(req, res) {
  if (moscowDateKey() !== RETIRE_DATE) {
    return res.status(410).json({ ok: false, error: 'products-retirement-expired' });
  }
  if (!securelyMatchesRetireKey(req.query?.key)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-products-retirement' });
  }

  const recoveryCache = getRecoveryCache();
  const completed = await recoveryCache.get(RETIRE_KEY);
  if (completed?.completed === true) {
    return res.status(200).json({ ok: true, alreadyCompleted: true, ...completed });
  }

  const retirement = await retireLegacyProductsState();
  const result = {
    completed: true,
    completedAt: new Date().toISOString(),
    ...retirement,
  };
  await recoveryCache.set(RETIRE_KEY, result, {
    ttl: RECOVERY_TTL_SECONDS,
    tags: ['one-time-recovery'],
    name: RETIRE_KEY,
  });

  return res.status(200).json({ ok: true, ...result });
}

module.exports = handler;
module.exports.moscowDateKey = moscowDateKey;
module.exports.securelyMatchesRetireKey = securelyMatchesRetireKey;
module.exports.retireLegacyProductsState = retireLegacyProductsState;

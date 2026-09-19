const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-partner-message-v1';
const MESSAGE_KEY = 'partner-message';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

function getPartnerMessageCache(options = {}) {
  return createStrictRuntimeCache({ namespace: NAMESPACE, ...options });
}

function normalizeStoredMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const text = String(value.text || '').trim();
  const authorName = String(value.authorName || '').trim();
  const updatedAt = String(value.updatedAt || '').trim();
  if (!text || !authorName || !updatedAt) return null;
  return { text, authorName, updatedAt };
}

async function readPartnerMessage(options = {}) {
  const cache = options.cache || getPartnerMessageCache(options.cacheOptions || {});
  return normalizeStoredMessage(await cache.get(MESSAGE_KEY));
}

async function writePartnerMessage(message, options = {}) {
  const cache = options.cache || getPartnerMessageCache(options.cacheOptions || {});
  const value = normalizeStoredMessage(message);
  if (!value) throw new Error('Invalid partner message');
  await cache.set(MESSAGE_KEY, value, {
    ttl: TTL_SECONDS,
    tags: ['rudi-partner-message'],
    name: MESSAGE_KEY,
  });
  return value;
}

module.exports = {
  NAMESPACE,
  MESSAGE_KEY,
  TTL_SECONDS,
  getPartnerMessageCache,
  normalizeStoredMessage,
  readPartnerMessage,
  writePartnerMessage,
};

const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-partner-message-v1';
const MESSAGE_KEY = 'partner-message';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

function getPartnerMessageCache(options = {}) {
  return createStrictRuntimeCache({ namespace: NAMESPACE, ...options });
}

function legacyMessageId(text, authorName) {
  return 'legacy-' + crypto
    .createHash('sha256')
    .update(String(text || '') + '\0' + String(authorName || ''))
    .digest('hex')
    .slice(0, 24);
}

function normalizeMessageId(value, text, authorName) {
  const id = String(value || '').trim();
  if (id && id.length <= 96 && /^[A-Za-z0-9:_\-.]+$/.test(id)) return id;
  return legacyMessageId(text, authorName);
}

function normalizeStoredMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const text = String(value.text || '').trim();
  const authorName = String(value.authorName || '').trim();
  const updatedAt = String(value.updatedAt || '').trim();
  if (!text || !authorName || !updatedAt) return null;
  const id = normalizeMessageId(value.id, text, authorName);
  return { id, text, authorName, updatedAt };
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
  legacyMessageId,
  normalizeMessageId,
  normalizeStoredMessage,
  readPartnerMessage,
  writePartnerMessage,
};

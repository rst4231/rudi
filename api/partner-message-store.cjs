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

function cleanActor(value) {
  return value === 'Диана' ? 'Диана' : value === 'Рустам' ? 'Рустам' : '';
}

function normalizeLikes(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanActor).filter(Boolean))];
}

function normalizeStoredMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const text = String(value.text || '').trim();
  const authorName = String(value.authorName || '').trim();
  const updatedAt = String(value.updatedAt || '').trim();
  if (!text || !authorName || !updatedAt) return null;
  const id = normalizeMessageId(value.id, text, authorName);
  const likes = normalizeLikes(value.likes);
  const likesInitialized = value.likesInitialized === true
    || Object.prototype.hasOwnProperty.call(value, 'likes');
  return { id, text, authorName, updatedAt, likes, likesInitialized };
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

let mutationQueue = Promise.resolve();

function enqueue(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function togglePartnerMessageLike(actor, options = {}) {
  return enqueue(async () => {
    const who = cleanActor(actor);
    if (!who) throw new Error('partner-message-like-actor-invalid');
    const current = await readPartnerMessage(options);
    if (!current) throw new Error('partner-message-not-found');
    const likes = new Set(current.likes || []);
    if (likes.has(who)) likes.delete(who);
    else likes.add(who);
    return writePartnerMessage({ ...current, likes:[...likes] }, options);
  });
}

module.exports = {
  NAMESPACE,
  MESSAGE_KEY,
  TTL_SECONDS,
  getPartnerMessageCache,
  legacyMessageId,
  normalizeMessageId,
  normalizeLikes,
  normalizeStoredMessage,
  readPartnerMessage,
  writePartnerMessage,
  togglePartnerMessageLike,
};

const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { isAllowedUserId } = require('./rudi-access.cjs');

const NAMESPACE = 'rudi-partner-notifications-v1';
const KEY = 'recipients';
const ACTOR_KEY_PREFIX = 'recipient:';
const MESSAGE_NOTICE_PREFIX = 'message-notice:';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const FALLBACK_RECIPIENTS = Object.freeze({ 'Рустам': 901637773, 'Диана': 941263519 });
const EXPECTED_SETUP_SHA256S = new Set([
  '85b08b8db9a03bd590ea69f49510dd81060cc0dc6bbeb643a6f52a3300acc1ea',
  'b1b631082076821d4c79a4527ed02a5632b1e7e4f40515116525f505e1589201',
]);

function cacheOf(options = {}) {
  return options.notificationCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function decodeSetupKey(value) {
  const key = String(value || '').trim();
  if (!key) throw new Error('partner-notification-setup-key-required');
  let raw;
  try { raw = Buffer.from(key, 'base64url').toString('utf8'); }
  catch { throw new Error('partner-notification-setup-key-invalid'); }
  if (!EXPECTED_SETUP_SHA256S.has(sha256(raw))) throw new Error('partner-notification-setup-key-invalid');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('partner-notification-setup-key-invalid'); }
  const rustam = Number(data?.['Рустам']);
  const diana = Number(data?.['Диана']);
  if (!isAllowedUserId(rustam) || !isAllowedUserId(diana) || rustam === diana) {
    throw new Error('partner-notification-setup-key-invalid');
  }
  return { 'Рустам': rustam, 'Диана': diana };
}

function normalizeRecipients(recipients) {
  const rustam = Number(recipients?.['Рустам']);
  const diana = Number(recipients?.['Диана']);
  const result = {
    'Рустам': isAllowedUserId(rustam) ? rustam : null,
    'Диана': isAllowedUserId(diana) ? diana : null,
  };
  if (result['Рустам'] && result['Диана'] && result['Рустам'] === result['Диана']) {
    result['Диана'] = null;
  }
  return result;
}

async function saveRecipient(actor, userId, options = {}) {
  if (!['Рустам', 'Диана'].includes(actor)) throw new Error('partner-notification-actor-invalid');
  const id = Number(userId);
  if (!isAllowedUserId(id)) throw new Error('partner-notification-recipients-invalid');
  await cacheOf(options).set(ACTOR_KEY_PREFIX + actor, id, {
    ttl: TTL_SECONDS,
    tags: ['rudi-partner-notifications'],
  });
  return id;
}

async function saveRecipients(recipients, options = {}) {
  const normalized = normalizeRecipients(recipients);
  if (!normalized['Рустам'] || !normalized['Диана'] || normalized['Рустам'] === normalized['Диана']) {
    throw new Error('partner-notification-recipients-invalid');
  }
  const cache = cacheOf(options);
  await Promise.all([
    cache.set(KEY, normalized, { ttl: TTL_SECONDS, tags: ['rudi-partner-notifications'] }),
    cache.set(ACTOR_KEY_PREFIX + 'Рустам', normalized['Рустам'], { ttl: TTL_SECONDS, tags: ['rudi-partner-notifications'] }),
    cache.set(ACTOR_KEY_PREFIX + 'Диана', normalized['Диана'], { ttl: TTL_SECONDS, tags: ['rudi-partner-notifications'] }),
  ]);
  return true;
}

async function readRecipients(options = {}) {
  const cache = cacheOf(options);
  const [rustamDirect, dianaDirect, legacy] = await Promise.all([
    cache.get(ACTOR_KEY_PREFIX + 'Рустам').catch(() => null),
    cache.get(ACTOR_KEY_PREFIX + 'Диана').catch(() => null),
    cache.get(KEY).catch(() => null),
  ]);
  const normalized = normalizeRecipients({
    'Рустам': rustamDirect || legacy?.['Рустам'] || FALLBACK_RECIPIENTS['Рустам'],
    'Диана': dianaDirect || legacy?.['Диана'] || FALLBACK_RECIPIENTS['Диана'],
  });
  if (!normalized['Рустам'] && !normalized['Диана']) return null;
  return normalized;
}

function recipientFor(actor, recipients) {
  if (actor === 'Рустам') return recipients?.['Диана'] || null;
  if (actor === 'Диана') return recipients?.['Рустам'] || null;
  return null;
}

async function readMessageNotice(actor, options = {}) {
  if (!['Рустам', 'Диана'].includes(actor)) return null;
  const value = await cacheOf(options).get(MESSAGE_NOTICE_PREFIX + actor).catch(() => null);
  const messageId = Number(value?.messageId || value);
  const chatId = Number(value?.chatId || 0);
  if (!Number.isInteger(messageId) || messageId <= 0) return null;
  return { messageId, chatId: Number.isInteger(chatId) && chatId ? chatId : null };
}

async function saveMessageNotice(actor, value, options = {}) {
  if (!['Рустам', 'Диана'].includes(actor)) throw new Error('partner-notification-actor-invalid');
  const messageId = Number(value?.messageId || value);
  const chatId = Number(value?.chatId || 0);
  if (!Number.isInteger(messageId) || messageId <= 0) throw new Error('partner-notification-message-invalid');
  await cacheOf(options).set(MESSAGE_NOTICE_PREFIX + actor, {
    messageId,
    chatId: Number.isInteger(chatId) && chatId ? chatId : null,
  }, {
    ttl: TTL_SECONDS,
    tags: ['rudi-partner-notifications'],
  });
  return true;
}

module.exports = {
  FALLBACK_RECIPIENTS,
  decodeSetupKey,
  normalizeRecipients,
  saveRecipient,
  saveRecipients,
  readRecipients,
  recipientFor,
  readMessageNotice,
  saveMessageNotice,
};

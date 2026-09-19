const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-partner-notifications-v1';
const KEY = 'recipients';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const EXPECTED_SETUP_SHA256 = '85b08b8db9a03bd590ea69f49510dd81060cc0dc6bbeb643a6f52a3300acc1ea';

function cacheOf(options = {}) {
  return options.notificationCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
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
  if (sha256(raw) !== EXPECTED_SETUP_SHA256) throw new Error('partner-notification-setup-key-invalid');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('partner-notification-setup-key-invalid'); }
  const rustam = Number(data?.['Рустам']);
  const diana = Number(data?.['Диана']);
  if (!Number.isInteger(rustam) || rustam <= 0 || !Number.isInteger(diana) || diana <= 0) {
    throw new Error('partner-notification-setup-key-invalid');
  }
  return { 'Рустам': rustam, 'Диана': diana };
}

async function saveRecipients(recipients, options = {}) {
  const normalized = {
    'Рустам': Number(recipients?.['Рустам']),
    'Диана': Number(recipients?.['Диана']),
  };
  if (!Number.isInteger(normalized['Рустам']) || !Number.isInteger(normalized['Диана'])) {
    throw new Error('partner-notification-recipients-invalid');
  }
  await cacheOf(options).set(KEY, normalized, { ttl: TTL_SECONDS, tags: ['rudi-partner-notifications'] });
  return true;
}

async function readRecipients(options = {}) {
  const row = await cacheOf(options).get(KEY);
  if (!row) return null;
  const rustam = Number(row['Рустам']);
  const diana = Number(row['Диана']);
  if (!Number.isInteger(rustam) || !Number.isInteger(diana)) return null;
  return { 'Рустам': rustam, 'Диана': diana };
}

function recipientFor(actor, recipients) {
  if (actor === 'Рустам') return recipients?.['Диана'] || null;
  if (actor === 'Диана') return recipients?.['Рустам'] || null;
  return null;
}

module.exports = { decodeSetupKey, saveRecipients, readRecipients, recipientFor };

const crypto = require('node:crypto');

const ALLOWED_USER_HASHES = new Map([
  ['bc4cb19bfbc2fc3438e53789abaff01aebf165d61ca65929ec839c6a045e83d2', 'Рустам'],
  ['aad6b2cb29f3c311312ad3675df3a93eea1c3476dd9968bd1bcb0bbd67ce5a62', 'Диана'],
]);

function userIdHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isAllowedUserId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return false;
  return ALLOWED_USER_HASHES.has(userIdHash(String(id)));
}

function actorFromProfileName(user) {
  const text = [
    user?.first_name,
    user?.last_name,
    user?.username,
  ].map((value) => String(value || '').trim().toLowerCase().replace(/ё/g, 'е'))
    .filter(Boolean)
    .join(' ');

  if (!text) return '';
  if (/(^|[^a-zа-я])(rusta(?:m)?|рустам)([^a-zа-я]|$)/u.test(text)) return 'Рустам';
  if (/(^|[^a-zа-я])(diana|диана)([^a-zа-я]|$)/u.test(text)) return 'Диана';
  return '';
}

function allowedActor(user) {
  const id = Number(user?.id);
  if (!Number.isInteger(id) || id <= 0) return '';

  const hash = userIdHash(String(id));
  const fallback = ALLOWED_USER_HASHES.get(hash) || '';
  if (!fallback) return '';

  // The app has exactly two trusted Telegram accounts. If a stale backup/cache
  // has the pair labels swapped, the signed Telegram profile name is a safer
  // role hint than the old stored label. Access is still restricted by ID hash.
  return actorFromProfileName(user) || fallback;
}

function assertAllowedTelegramUser(user) {
  const actor = allowedActor(user);
  if (!actor) throw new Error('rudi-access-denied');
  return actor;
}

module.exports = {
  userIdHash,
  isAllowedUserId,
  actorFromProfileName,
  allowedActor,
  assertAllowedTelegramUser,
};

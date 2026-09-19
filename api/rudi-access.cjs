const crypto = require('node:crypto');

const ALLOWED_USER_HASHES = new Map([
  ['bc4cb19bfbc2fc3438e53789abaff01aebf165d61ca65929ec839c6a045e83d2', 'Диана'],
  ['aad6b2cb29f3c311312ad3675df3a93eea1c3476dd9968bd1bcb0bbd67ce5a62', 'Рустам'],
]);

function userIdHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function allowedActor(user) {
  const id = user?.id;
  if (!Number.isFinite(Number(id))) return '';
  return ALLOWED_USER_HASHES.get(userIdHash(String(id))) || '';
}

function assertAllowedTelegramUser(user) {
  const actor = allowedActor(user);
  if (!actor) throw new Error('rudi-access-denied');
  return actor;
}

module.exports = { userIdHash, allowedActor, assertAllowedTelegramUser };

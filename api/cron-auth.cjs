const { createHash, timingSafeEqual } = require('node:crypto');

function bearerToken(req) {
  const headers = req?.headers || {};
  const raw = typeof headers.get === 'function'
    ? headers.get('authorization')
    : (headers.authorization ?? headers.Authorization);
  const match = String(raw || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function safeEqualText(left, right) {
  const a = createHash('sha256').update(String(left || '')).digest();
  const b = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(a, b);
}

function isCronRequestAuthorized(req, secret = process.env.CRON_SECRET) {
  const expected = String(secret || '').trim();
  if (!expected) return true;
  const actual = bearerToken(req);
  return Boolean(actual) && safeEqualText(actual, expected);
}

module.exports = { bearerToken, safeEqualText, isCronRequestAuthorized };

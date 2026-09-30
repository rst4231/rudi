const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { assertAllowedTelegramUser } = require('./rudi-access.cjs');
const { authorizeWithSession } = require('./rudi-session.cjs');

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;

function validateTelegramInitData(rawInitData, botToken, now = Date.now()) {
  const raw = String(rawInitData || '').trim();
  const token = String(botToken || '').trim();
  if (!raw || !token) throw new Error('telegram-auth-required');

  const params = new URLSearchParams(raw);
  const receivedHash = String(params.get('hash') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedHash)) throw new Error('telegram-auth-invalid');

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const actual = Buffer.from(receivedHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('telegram-auth-invalid');
  }

  const authDate = Number(params.get('auth_date'));
  const nowSeconds = Math.floor(Number(now) / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0) throw new Error('telegram-auth-invalid');
  if (authDate > nowSeconds + MAX_FUTURE_SKEW_SECONDS) throw new Error('telegram-auth-invalid');
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) throw new Error('telegram-auth-expired');

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); }
  catch { throw new Error('telegram-user-invalid'); }
  if (!user || typeof user !== 'object' || !Number.isFinite(Number(user.id))) {
    throw new Error('telegram-user-invalid');
  }

  const authorName = String(user.first_name || '').trim()
    || String(user.last_name || '').trim()
    || String(user.username || '').trim()
    || 'Telegram';

  return { user, authorName };
}

function statusForError(error) {
  const code = String(error?.message || error || '');
  if (code === 'telegram-auth-required' || code === 'telegram-auth-invalid' || code === 'telegram-auth-expired' || code === 'telegram-user-invalid') return 401;
  if (code === 'rudi-access-denied') return 403;
  if (code === 'rudi-session-required' || code === 'rudi-session-invalid' || code === 'rudi-session-expired' || code === 'rudi-pin-invalid') return 401;
  if (code === 'rudi-pin-rate-limited') return 429;
  if (code === 'rudi-pin-not-configured') return 409;
  if (code === 'rudi-pin-format') return 400;
  if (code === 'rudi-auth-db-unavailable') return 503;
  if (code === 'rudi-passkey-not-configured') return 409;
  if (code === 'rudi-passkey-challenge-invalid' || code === 'rudi-passkey-origin-mismatch' || code === 'rudi-passkey-credential-not-found' || code === 'rudi-passkey-registration-failed' || code === 'rudi-passkey-registration-invalid' || code === 'rudi-passkey-authentication-failed') return 400;
  if (code === 'rudi-passkey-host-invalid' || code === 'rudi-passkey-origin-invalid') return 400;
  if (code === 'message-empty' || code === 'message-too-long') return 400;
  return 500;
}

function authorizeInitData(rawInitData, options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  const auth = validateTelegramInitData(rawInitData, token, options.now || Date.now());
  const actor = assertAllowedTelegramUser(auth.user);
  return { ...auth, actor };
}

function authorizeRequest(req, rawInitData, options = {}) {
  const botToken = options.botToken || resolveTelegramBotToken(options.env || process.env);
  return authorizeWithSession(
    req,
    rawInitData,
    (value) => authorizeInitData(value, { ...options, botToken }),
    { botToken, now: options.now || Date.now() }
  );
}

module.exports = {
  validateTelegramInitData,
  statusForError,
  authorizeInitData,
  authorizeRequest,
};

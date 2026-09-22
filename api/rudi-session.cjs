const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const scryptAsync = promisify(crypto.scrypt);
const COOKIE_NAME = 'rudi_session';
const SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const PIN_RECORD_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const RATE_WINDOW_SECONDS = 15 * 60;
const RATE_MAX_ATTEMPTS = 5;
const ACTORS = new Set(['Рустам', 'Диана']);

function normalizeActor(value) {
  const actor = String(value || '').trim();
  return ACTORS.has(actor) ? actor : '';
}

function normalizePin(value) {
  const pin = String(value || '').trim();
  if (!/^\d{6}$/.test(pin)) throw new Error('rudi-pin-format');
  return pin;
}

function sessionSigningKey(botToken) {
  const token = String(botToken || '').trim();
  if (!token) throw new Error('telegram-auth-required');
  return crypto.createHmac('sha256', token).update('rudi-browser-session-v1').digest();
}

function encodeSession(actor, botToken, now = Date.now(), maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const issuedAt = Math.floor(Number(now) / 1000);
  const expiresAt = issuedAt + Math.max(60, Number(maxAgeSeconds) || SESSION_MAX_AGE_SECONDS);
  const payload = Buffer.from(JSON.stringify({ v: 1, actor: safeActor, iat: issuedAt, exp: expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSigningKey(botToken)).update(payload).digest('base64url');
  return 'v1.' + payload + '.' + signature;
}

function verifySession(value, botToken, now = Date.now()) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('rudi-session-invalid');
  const payload = String(parts[1] || '');
  const signature = String(parts[2] || '');
  const expected = crypto.createHmac('sha256', sessionSigningKey(botToken)).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { throw new Error('rudi-session-invalid'); }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('rudi-session-invalid');
  }

  let decoded;
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw new Error('rudi-session-invalid'); }

  const actor = normalizeActor(decoded?.actor);
  const nowSeconds = Math.floor(Number(now) / 1000);
  if (!actor || Number(decoded?.v) !== 1 || !Number.isFinite(Number(decoded?.exp)) || Number(decoded.exp) <= nowSeconds) {
    throw new Error('rudi-session-expired');
  }
  if (!Number.isFinite(Number(decoded?.iat)) || Number(decoded.iat) > nowSeconds + 300) {
    throw new Error('rudi-session-invalid');
  }
  return { actor, issuedAt: Number(decoded.iat), expiresAt: Number(decoded.exp) };
}

function parseCookies(req) {
  const raw = String(req?.headers?.cookie || req?.headers?.Cookie || '');
  const result = {};
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); }
    catch { result[key] = value; }
  }
  return result;
}

function sessionFromRequest(req, botToken, now = Date.now()) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) throw new Error('rudi-session-required');
  return verifySession(token, botToken, now);
}

function appendSetCookie(res, value) {
  const existing = typeof res?.getHeader === 'function' ? res.getHeader('Set-Cookie') : undefined;
  const next = existing
    ? (Array.isArray(existing) ? [...existing, value] : [existing, value])
    : value;
  res?.setHeader?.('Set-Cookie', next);
}

function setSessionCookie(res, actor, botToken, options = {}) {
  const maxAge = Math.max(60, Number(options.maxAgeSeconds) || SESSION_MAX_AGE_SECONDS);
  const token = encodeSession(actor, botToken, options.now || Date.now(), maxAge);
  appendSetCookie(res, [
    COOKIE_NAME + '=' + encodeURIComponent(token),
    'Path=/',
    'Max-Age=' + Math.floor(maxAge),
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; '));
  return token;
}

function clearSessionCookie(res) {
  appendSetCookie(res, [
    COOKIE_NAME + '=',
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; '));
}

function resolveCache(options = {}) {
  if (options.cache) return options.cache;
  return createStrictRuntimeCache({
    namespace: 'rudi-browser-auth-v1',
    confirmWrites: false,
    ...(options.cacheOptions || {}),
  });
}

function pinKey(actor) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  return 'pin:' + safeActor;
}

async function derivePinHash(pin, salt) {
  const value = await scryptAsync(normalizePin(pin), Buffer.from(String(salt || ''), 'base64url'), 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return Buffer.from(value).toString('base64url');
}

function normalizePinRecord(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const salt = String(source.salt || '').trim();
  const hash = String(source.hash || '').trim();
  if (!salt || !hash) return null;
  return {
    version: 1,
    salt,
    hash,
    updatedAt: String(source.updatedAt || ''),
  };
}

async function readPinRecord(actor, options = {}) {
  const cache = resolveCache(options);
  return normalizePinRecord(await cache.get(pinKey(actor)));
}

async function restorePinRecord(actor, value, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const incoming = normalizePinRecord(value);
  if (!incoming) return readPinRecord(safeActor, options);
  const current = await readPinRecord(safeActor, options).catch(() => null);
  const currentTime = Date.parse(String(current?.updatedAt || '')) || 0;
  const incomingTime = Date.parse(String(incoming.updatedAt || '')) || 0;
  if (current && currentTime > incomingTime) return current;
  const cache = resolveCache(options);
  await cache.set(pinKey(safeActor), incoming, {
    ttl: PIN_RECORD_TTL_SECONDS,
    tags: ['rudi-browser-auth'],
    name: pinKey(safeActor),
  });
  return incoming;
}

async function hasPin(actor, options = {}) {
  return Boolean(await readPinRecord(actor, options));
}

async function savePin(actor, pin, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const safePin = normalizePin(pin);
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = await derivePinHash(safePin, salt);
  const record = {
    version: 1,
    salt,
    hash,
    updatedAt: new Date(options.now || Date.now()).toISOString(),
  };
  const cache = resolveCache(options);
  await cache.set(pinKey(safeActor), record, {
    ttl: PIN_RECORD_TTL_SECONDS,
    tags: ['rudi-browser-auth'],
    name: pinKey(safeActor),
  });
  return { actor: safeActor, configured: true, updatedAt: record.updatedAt };
}

function requestFingerprint(req, actor) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || 'unknown');
  const ua = String(req?.headers?.['user-agent'] || '').slice(0, 160);
  return crypto.createHash('sha256').update(normalizeActor(actor) + '\0' + ip + '\0' + ua).digest('hex').slice(0, 32);
}

async function readRateRecord(req, actor, options = {}) {
  const cache = resolveCache(options);
  const key = 'rate:' + requestFingerprint(req, actor);
  const record = await cache.get(key).catch(() => null);
  return { cache, key, record: record && typeof record === 'object' ? record : null };
}

async function assertLoginAllowed(req, actor, options = {}) {
  const { record } = await readRateRecord(req, actor, options);
  if (Number(record?.attempts || 0) >= RATE_MAX_ATTEMPTS && Number(record?.resetAt || 0) > Date.now()) {
    throw new Error('rudi-pin-rate-limited');
  }
}

async function recordFailedLogin(req, actor, options = {}) {
  const { cache, key, record } = await readRateRecord(req, actor, options);
  const now = Number(options.now || Date.now());
  const resetAt = Number(record?.resetAt || 0) > now ? Number(record.resetAt) : now + RATE_WINDOW_SECONDS * 1000;
  const attempts = Number(record?.resetAt || 0) > now ? Number(record?.attempts || 0) + 1 : 1;
  await cache.set(key, { attempts, resetAt }, {
    ttl: RATE_WINDOW_SECONDS,
    tags: ['rudi-browser-auth-rate'],
    name: key,
  }).catch(() => null);
  return attempts;
}

async function clearFailedLogins(req, actor, options = {}) {
  const { cache, key } = await readRateRecord(req, actor, options);
  await cache.delete(key).catch(() => null);
}

async function verifyPin(req, actor, pin, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const safePin = normalizePin(pin);
  await assertLoginAllowed(req, safeActor, options);

  const record = await readPinRecord(safeActor, options);
  if (!record?.salt || !record?.hash) throw new Error('rudi-pin-not-configured');

  const actual = Buffer.from(await derivePinHash(safePin, record.salt), 'base64url');
  let expected;
  try { expected = Buffer.from(String(record.hash || ''), 'base64url'); }
  catch { expected = Buffer.alloc(0); }
  const ok = actual.length === expected.length && actual.length > 0 && crypto.timingSafeEqual(actual, expected);
  if (!ok) {
    await recordFailedLogin(req, safeActor, options);
    throw new Error('rudi-pin-invalid');
  }
  await clearFailedLogins(req, safeActor, options);
  return { actor: safeActor };
}

function authorizeWithSession(req, rawInitData, telegramAuthorize, options = {}) {
  const initData = String(rawInitData || '').trim();
  if (initData) {
    const telegram = telegramAuthorize(initData);
    return { ...telegram, source: 'telegram' };
  }
  const botToken = String(options.botToken || '').trim();
  const session = sessionFromRequest(req, botToken, options.now || Date.now());
  return {
    actor: session.actor,
    user: null,
    authorName: session.actor,
    source: 'session',
    session,
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  normalizeActor,
  normalizePin,
  encodeSession,
  verifySession,
  parseCookies,
  sessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  normalizePinRecord,
  readPinRecord,
  restorePinRecord,
  hasPin,
  savePin,
  verifyPin,
  authorizeWithSession,
};

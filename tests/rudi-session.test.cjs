const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COOKIE_NAME,
  encodeSession,
  verifySession,
  setSessionCookie,
  clearSessionCookie,
  savePin,
  hasPin,
  verifyPin,
  authorizeWithSession,
} = require('../api/rudi-session.cjs');

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async set(key, value) { map.set(key, structuredClone(value)); return true; },
    async delete(key) { map.delete(key); return true; },
  };
}

function responseStub() {
  const headers = new Map();
  return {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    headers,
  };
}

test('RUDI session is signed, expires, and cannot be changed to another actor', () => {
  const botToken = '123456:secret';
  const now = Date.UTC(2026, 8, 22, 12, 0, 0);
  const token = encodeSession('Рустам', botToken, now, 3600);
  assert.equal(verifySession(token, botToken, now + 1000).actor, 'Рустам');

  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  payload.actor = 'Диана';
  const tampered = parts[0] + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + parts[2];
  assert.throws(() => verifySession(tampered, botToken, now + 1000), /rudi-session-invalid/);
  assert.throws(() => verifySession(token, botToken, now + 3601 * 1000), /rudi-session-expired/);
});

test('session cookie is HttpOnly Secure SameSite=Lax and can be cleared', () => {
  const res = responseStub();
  setSessionCookie(res, 'Диана', '123456:secret', { now: Date.UTC(2026, 8, 22) });
  const value = String(res.getHeader('Set-Cookie'));
  assert.match(value, new RegExp(COOKIE_NAME + '='));
  assert.match(value, /HttpOnly/);
  assert.match(value, /Secure/);
  assert.match(value, /SameSite=Lax/);

  clearSessionCookie(res);
  const cookies = res.getHeader('Set-Cookie');
  assert.ok(Array.isArray(cookies));
  assert.match(String(cookies.at(-1)), /Max-Age=0/);
});

test('PIN is stored as a salted hash and verifies without storing plaintext', async () => {
  const cache = memoryCache();
  await savePin('Рустам', '482913', { cache, now: Date.UTC(2026, 8, 22) });
  assert.equal(await hasPin('Рустам', { cache }), true);

  const stored = await cache.get('pin:Рустам');
  assert.ok(stored.salt);
  assert.ok(stored.hash);
  assert.doesNotMatch(JSON.stringify(stored), /482913/);

  const req = { headers: { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'test' } };
  assert.equal((await verifyPin(req, 'Рустам', '482913', { cache })).actor, 'Рустам');
  await assert.rejects(() => verifyPin(req, 'Рустам', '111111', { cache }), /rudi-pin-invalid/);
});

test('authorization prefers signed Telegram initData and falls back to browser cookie only when initData is absent', () => {
  const botToken = '123456:secret';
  const now = Date.UTC(2026, 8, 22, 12, 0, 0);
  const cookie = encodeSession('Диана', botToken, now, 3600);
  const req = { headers: { cookie: COOKIE_NAME + '=' + encodeURIComponent(cookie) } };

  const telegram = authorizeWithSession(req, 'signed-data', () => ({ actor: 'Рустам', user: { id: 1 }, authorName: 'Рустам' }), { botToken, now });
  assert.equal(telegram.actor, 'Рустам');
  assert.equal(telegram.source, 'telegram');

  const browser = authorizeWithSession(req, '', () => { throw new Error('should-not-run'); }, { botToken, now });
  assert.equal(browser.actor, 'Диана');
  assert.equal(browser.source, 'session');
  assert.equal(browser.user, null);
});


test('browser auth cache does not fail successful writes on immediate cache visibility', () => {
  const sessionSource=fs.readFileSync('api/rudi-session.cjs','utf8');
  const passkeySource=fs.readFileSync('api/rudi-passkeys.cjs','utf8');
  assert.match(sessionSource,/namespace: 'rudi-browser-auth-v1',[\s\S]*?confirmWrites: false/);
  assert.match(passkeySource,/namespace: 'rudi-passkeys-v1',[\s\S]*?confirmWrites: false/);
});

test('PIN remains verifiable from encrypted backup record after runtime cache is gone', async () => {
  const firstCache = memoryCache();
  const saved = await savePin('Рустам', '482913', { cache:firstCache, now:Date.UTC(2026,8,22,12,0,0) });
  assert.ok(saved.record?.salt);
  assert.ok(saved.record?.hash);
  assert.doesNotMatch(JSON.stringify(saved.record), /482913/);

  const emptyCache = memoryCache();
  assert.equal(await hasPin('Рустам', { cache:emptyCache }), false);

  const req = { headers:{ 'x-forwarded-for':'127.0.0.1', 'user-agent':'backup-test' } };
  const verified = await verifyPin(req, 'Рустам', '482913', { cache:emptyCache, pinRecord:saved.record });
  assert.equal(verified.actor, 'Рустам');
  await assert.rejects(
    () => verifyPin(req, 'Рустам', '111111', { cache:emptyCache, pinRecord:saved.record }),
    /rudi-pin-invalid/
  );
});

const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-ticktick-oauth-v1';
const TOKEN_KEY = 'oauth-token';
const STATE_TTL_SECONDS = 10 * 60;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 3650;

function getTickTickCache(options = {}) {
  return createStrictRuntimeCache({ namespace: NAMESPACE, ...options });
}

async function saveOAuthState(state, options = {}) {
  const cache = options.cache || getTickTickCache(options.cacheOptions || {});
  await cache.set('state:' + state, { createdAt: Date.now() }, {
    ttl: STATE_TTL_SECONDS,
    tags: ['rudi-ticktick-oauth'],
    name: 'ticktick-oauth-state',
  });
}

async function consumeOAuthState(state, options = {}) {
  const cache = options.cache || getTickTickCache(options.cacheOptions || {});
  const key = 'state:' + state;
  const value = await cache.get(key);
  if (value) {
    try { await cache.delete(key); } catch {}
  }
  return Boolean(value);
}

async function saveToken(token, options = {}) {
  const cache = options.cache || getTickTickCache(options.cacheOptions || {});
  const savedAt = new Date().toISOString();
  const expiresIn = Number(token?.expires_in ?? token?.expiresIn ?? 0) || 0;
  const refreshExpiresIn = Number(token?.refresh_expires_in ?? token?.refreshExpiresIn ?? 0) || 0;
  const value = {
    accessToken: String(token?.access_token || token?.accessToken || '').trim(),
    refreshToken: String(token?.refresh_token || token?.refreshToken || '').trim(),
    tokenType: String(token?.token_type || token?.tokenType || 'Bearer').trim() || 'Bearer',
    scope: String(token?.scope || '').trim(),
    expiresIn,
    refreshExpiresIn,
    savedAt: String(token?.savedAt || savedAt),
    expiresAt: String(token?.expiresAt || (expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : '')),
  };
  if (!value.accessToken) throw new Error('ticktick-access-token-missing');
  await cache.set(TOKEN_KEY, value, {
    ttl: TOKEN_TTL_SECONDS,
    tags: ['rudi-ticktick-oauth'],
    name: TOKEN_KEY,
  });
  return value;
}

async function readToken(options = {}) {
  const cache = options.cache || getTickTickCache(options.cacheOptions || {});
  const value = await cache.get(TOKEN_KEY);
  if (!value || typeof value !== 'object' || !String(value.accessToken || '').trim()) return null;
  return value;
}

async function clearToken(options = {}) {
  const cache = options.cache || getTickTickCache(options.cacheOptions || {});
  try { await cache.delete(TOKEN_KEY); } catch {}
}

module.exports = {
  NAMESPACE,
  TOKEN_KEY,
  STATE_TTL_SECONDS,
  TOKEN_TTL_SECONDS,
  getTickTickCache,
  saveOAuthState,
  consumeOAuthState,
  saveToken,
  readToken,
  clearToken,
};

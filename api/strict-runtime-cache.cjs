const { createRudiStateClient } = require('./rudi-state-client.cjs');

const CACHE_STATE_HEADER = 'x-rudi-d1-state';

function hashRuntimeCacheKey(key) {
  let hash = 5381;
  const text = String(key);
  for (let index = 0; index < text.length; index += 1) hash = (hash * 33) ^ text.charCodeAt(index);
  return (hash >>> 0).toString(16);
}

function transformRuntimeCacheKey(key, namespace = '', separator = '$') {
  const hashed = hashRuntimeCacheKey(key);
  return namespace ? `${namespace}${separator}${hashed}` : hashed;
}

function createStrictRuntimeCache(options = {}) {
  if (options.runtimeCache) return options.runtimeCache;
  const namespace = String(options.namespace || '').trim();
  if (!namespace) throw new Error('RUDI D1 namespace is required');

  const client = options.stateClient || createRudiStateClient({
    env: options.env || process.env,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    d1Client: options.d1Client,
    vercelClient: options.vercelClient,
    pool: options.pool,
    connectionString: options.connectionString,
    d1BaseUrl: options.d1BaseUrl,
    d1Secret: options.d1Secret,
    timeoutMs: options.timeoutMs,
  });

  return {
    async get(key) {
      const row = await client.getRecord(namespace, String(key));
      if (!row) return null;
      if (row.expires_at) {
        const expiresAt = Date.parse(row.expires_at);
        if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null;
      }
      return row.value ?? null;
    },

    async set(key, value, cacheOptions = {}) {
      await client.set(namespace, String(key), value, cacheOptions);
      return true;
    },

    async setIfAbsent(key, value, cacheOptions = {}) {
      return client.setIfAbsent(namespace, String(key), value, cacheOptions);
    },

    async delete(key) {
      return client.remove(namespace, String(key));
    },

    async list() {
      const rows = await client.list(namespace);
      return (Array.isArray(rows) ? rows : []).filter((row) => {
        if (!row?.expires_at) return true;
        const expiresAt = Date.parse(row.expires_at);
        return !Number.isFinite(expiresAt) || expiresAt > Date.now();
      });
    },

    async expireTag(tag) {
      await client.expireTag(namespace, String(tag || ''));
      return true;
    },
  };
}

module.exports = {
  CACHE_STATE_HEADER,
  hashRuntimeCacheKey,
  transformRuntimeCacheKey,
  createStrictRuntimeCache,
};

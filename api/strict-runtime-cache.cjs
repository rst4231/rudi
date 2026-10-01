const { isDeepStrictEqual } = require('node:util');
const CACHE_STATE_HEADER = 'x-vercel-cache-state';
const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 80;

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

function sleep(ms) { return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve(); }

function parseHeaders(raw) {
  if (!raw) throw new Error('RUNTIME_CACHE_HEADERS is not configured');
  if (typeof raw === 'object') return { ...raw };
  let parsed;
  try { parsed = JSON.parse(String(raw)); } catch { throw new Error('RUNTIME_CACHE_HEADERS is invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('RUNTIME_CACHE_HEADERS must be an object');
  return parsed;
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

function createOfficialRuntimeCache(options, namespace, attempts, retryDelayMs) {
  const confirmWrites = options.confirmWrites === true;
  const confirmAttempts = Math.max(attempts, Number(options.confirmAttempts || 8));
  const confirmDelayMs = retryDelayMs === 0 ? 0 : Math.max(125, retryDelayMs);
  let cache = options.runtimeCache;
  if (!cache) {
    const getCacheImpl = options.getCacheImpl || require('@vercel/functions').getCache;
    if (typeof getCacheImpl !== 'function') throw new Error('Vercel Runtime Cache is unavailable');
    cache = getCacheImpl({ namespace });
  }
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') {
    throw new Error('Vercel Runtime Cache is unavailable');
  }

  async function retry(operation, name) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try { return await operation(); }
      catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await sleep(retryDelayMs * (attempt + 1));
      }
    }
    throw lastError || new Error(`Runtime Cache ${name} failed after ${attempts} attempts`);
  }

  return {
    async get(key) {
      let value = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        value = await retry(() => cache.get(key), 'GET');
        if (value !== null && value !== undefined) return value;
        if (attempt + 1 < attempts) await sleep(retryDelayMs * (attempt + 1));
      }
      return null;
    },
    async set(key, value, cacheOptions = {}) {
      let lastError = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          await cache.set(key, value, cacheOptions);
          if (!confirmWrites) return true;
          for (let confirm = 0; confirm < confirmAttempts; confirm += 1) {
            try {
              const stored = await cache.get(key);
              if (stored !== null && stored !== undefined && isDeepStrictEqual(stored, value)) return true;
            } catch (error) {
              lastError = error;
            }
            if (confirm + 1 < confirmAttempts) {
              await sleep(Math.min(500, confirmDelayMs * (confirm + 1)));
            }
          }
          console.warn('RUDI_RUNTIME_CACHE_CONFIRM_WARN', `Runtime Cache write not yet visible for ${key}`);
          return true;
        } catch (error) {
          lastError = error;
        }
        if (attempt + 1 < attempts) await sleep(retryDelayMs * (attempt + 1));
      }
      throw lastError || new Error(`Runtime Cache POST failed after ${attempts} attempts`);
    },
    delete(key) {
      if (typeof cache.delete !== 'function') throw new Error('Vercel Runtime Cache delete is unavailable');
      return retry(() => cache.delete(key), 'DELETE');
    },
    expireTag(tag) {
      if (typeof cache.expireTag !== 'function') throw new Error('Vercel Runtime Cache expireTag is unavailable');
      return retry(() => cache.expireTag(tag), 'expireTag');
    },
  };
}

function createDirectRuntimeCache(options, endpoint, headers, namespace, timeoutMs, attempts, retryDelayMs) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');

  async function request(method, key, value, cacheOptions = {}) {
    const transformed = transformRuntimeCacheKey(key, namespace);
    let lastError = null;
    let onlyNotFound = true;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const timeout = createTimeoutSignal(timeoutMs);
      try {
        const optionalHeaders = {};
        if (method === 'POST') {
          if (cacheOptions.ttl) optionalHeaders['x-vercel-revalidate'] = String(cacheOptions.ttl);
          if (Array.isArray(cacheOptions.tags) && cacheOptions.tags.length) optionalHeaders['x-vercel-cache-tags'] = cacheOptions.tags.join(',');
          optionalHeaders['x-vercel-cache-item-name'] = cacheOptions.name || key;
        }
        const response = await fetchImpl(`${endpoint}${transformed}`, {
          method,
          headers: { ...headers, ...optionalHeaders },
          body: method === 'POST' ? JSON.stringify(value) : undefined,
          signal: timeout.signal,
        });
        timeout.done();
        if (method === 'GET' && response.status === 404) {
          lastError = null;
          if (attempt + 1 < attempts) await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        onlyNotFound = false;
        if (response.status !== 200) throw new Error(`Runtime Cache ${method} failed: HTTP ${response.status}`);
        if (method !== 'GET') return true;
        const state = String(response.headers?.get?.(CACHE_STATE_HEADER) || '').toLowerCase();
        if (state !== 'fresh') {
          lastError = new Error(`Runtime Cache read is ${state || 'unknown'}`);
          if (attempt + 1 < attempts) await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        return await response.json();
      } catch (error) {
        timeout.done();
        onlyNotFound = false;
        lastError = error?.name === 'AbortError'
          ? new Error(`Runtime Cache request timed out after ${timeoutMs}ms`)
          : error;
        if (attempt + 1 < attempts) await sleep(retryDelayMs * (attempt + 1));
      }
    }
    if (method === 'GET' && onlyNotFound) return null;
    throw lastError || new Error(`Runtime Cache ${method} failed after ${attempts} attempts`);
  }

  return {
    get(key) { return request('GET', key); },
    set(key, value, cacheOptions = {}) { return request('POST', key, value, cacheOptions); },
    delete(key) { return request('DELETE', key); },
  };
}


const DURABLE_DATA_API_URL = 'https://ep-square-dream-b5uavt85.apirest.c-7.us-east-2.aws.neon.tech/rudi_auth/rest/v1';
const DURABLE_TABLE = 'rudi_durable_state';
const DURABLE_LONG_TTL_SECONDS = 60 * 60 * 24 * 3650;
const DURABLE_NAMESPACES = new Set([
  'rudi-score-v1',
  'rudi-reactions-v1',
  'rudi-messenger-reactions-v1',
  'rudi-activity-journal-v1',
  'rudi-smart-saves-v1',
  'rudi-partner-notifications-v1',
  'rudi-morning-summary-v1',
  'rudi-ui-preferences-v1',
  'rudi-fasting-v1',
  'rudi-daily-question-v1',
  'rudi-daily-question-history-v1',
  'rudi-supplements-v1',
  'rudi-mood-feedback-v1',
  'rudi-mood-analysis-v4',
  'rudi-for-di-feed-v1',
  'rudi-for-di-private-v1',
  'rudi-labor-code-v1',
]);

const DURABLE_TARGETED_NAMESPACES = new Set([
  'rudi-ticktick-oauth-v1',
  'rudi-work-calendar-v1',
  'rudi-private-cycle-v1',
  'rudi-partner-message-v1',
  'rudi-wishlist-v1',
  'rudi-product-list-v1',
  'rudi-feed-v1',
  'rudi-cinema-premieres-v1',
  'rudi-lulu-v1',
  'rudi-shared-album-v1',
  'rudi-saved-items-v1',
  'rudi-holiday-highlights-v1',
  'rudi-ticktick-checklist-audit',
]);

const DURABLE_TARGETED_KEY_TTLS = new Map([
  ['rudi-ticktick-oauth-v1\0oauth-token', DURABLE_LONG_TTL_SECONDS],
  ['rudi-work-calendar-v1\0calendar-url', DURABLE_LONG_TTL_SECONDS],
  ['rudi-private-cycle-v1\0diana-cycle', DURABLE_LONG_TTL_SECONDS],
  ['rudi-partner-message-v1\0partner-message', DURABLE_LONG_TTL_SECONDS],
  ['rudi-wishlist-v1\0wishlist', DURABLE_LONG_TTL_SECONDS],
  ['rudi-product-list-v1\0products', DURABLE_LONG_TTL_SECONDS],
  ['rudi-feed-v1\0current', 60 * 60 * 24 * 365],
  ['rudi-lulu-v1\0lulu', DURABLE_LONG_TTL_SECONDS],
  ['rudi-shared-album-v1\0album-config', DURABLE_LONG_TTL_SECONDS],
  ['rudi-saved-items-v1\0shared-saves', DURABLE_LONG_TTL_SECONDS],
  ['rudi-ticktick-checklist-audit\0state', DURABLE_LONG_TTL_SECONDS],
]);

function targetedDurableTtlSeconds(namespace, key) {
  const exact = DURABLE_TARGETED_KEY_TTLS.get(namespace + '\0' + String(key || ''));
  if (exact) return exact;
  if (namespace === 'rudi-feed-v1' && String(key || '').startsWith('notice:')) {
    return 60 * 60 * 24 * 14;
  }
  if (namespace === 'rudi-cinema-premieres-v1') {
    return 60 * 60 * 24 * 365 * 5;
  }
  if (namespace === 'rudi-holiday-highlights-v1' && String(key || '').startsWith('day:')) {
    return 60 * 60 * 48;
  }
  return 0;
}
const DURABLE_CONTROL_PLANE_TAGS = new Set([
  'rudi-daily-cron-state',
  'rudi-settings',
  'rudi-publication-journal',
  'rudi-daily-runs',
]);

function isDurableKey(namespace, key) {
  if (DURABLE_NAMESPACES.has(namespace)) return true;
  if (targetedDurableTtlSeconds(namespace, key) > 0) return true;
  if (namespace !== 'rudi-control-plane-v1') return false;
  const text = String(key || '');
  return text === 'daily-cron:last-attempt'
    || text === 'settings:overrides'
    || text.startsWith('journal:')
    || text.startsWith('daily-run:');
}

function migrationTtlSeconds(namespace, key) {
  if (DURABLE_NAMESPACES.has(namespace)) return DURABLE_LONG_TTL_SECONDS;
  const targetedTtl = targetedDurableTtlSeconds(namespace, key);
  if (targetedTtl > 0) return targetedTtl;
  if (namespace === 'rudi-control-plane-v1' && String(key || '') === 'daily-cron:last-attempt') {
    return 60 * 60 * 24 * 35;
  }
  return 0;
}

function isDurableTag(namespace, tag) {
  if (DURABLE_NAMESPACES.has(namespace) || DURABLE_TARGETED_NAMESPACES.has(namespace)) return true;
  return namespace === 'rudi-control-plane-v1' && DURABLE_CONTROL_PLANE_TAGS.has(String(tag || ''));
}

function durableWarn(event, error) {
  try { console.warn(event, String(error?.message || error)); } catch {}
}

function durableTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || '').trim())
    .filter(Boolean))].slice(0, 32);
}

function durableExpiresAt(cacheOptions = {}) {
  const ttl = Number(cacheOptions.ttl || 0);
  if (!Number.isFinite(ttl) || ttl <= 0) return null;
  return new Date(Date.now() + ttl * 1000).toISOString();
}

function durableBaseUrl(options = {}) {
  return String(
    options.durableDataApiUrl
    || options.env?.RUDI_DATA_API_URL
    || process.env.RUDI_DATA_API_URL
    || DURABLE_DATA_API_URL
  ).replace(/\/+$/, '');
}

async function durableRequest(options, method, query = '', body, prefer = '') {
  const fetchImpl = options.durableFetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('RUDI durable Data API fetch is unavailable');
  const { signDataApiJwt } = require('./rudi-data-api-auth.cjs');
  const token = signDataApiJwt({
    env: options.env || process.env,
    botToken: options.botToken,
  });
  const response = await fetchImpl(
    durableBaseUrl(options) + '/' + DURABLE_TABLE + (query ? '?' + query : ''),
    {
      method,
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(prefer ? { prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error('RUDI durable Data API ' + method + ' failed: HTTP ' + response.status + (text ? ' ' + text.slice(0, 180) : ''));
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function durableExactQuery(namespace, key, extra = {}) {
  return new URLSearchParams({
    namespace: 'eq.' + namespace,
    key: 'eq.' + String(key),
    ...extra,
  }).toString();
}

async function durableGet(options, namespace, key) {
  const rows = await durableRequest(
    options,
    'GET',
    durableExactQuery(namespace, key, { select: 'value,expires_at', limit: '1' })
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  if (row.expires_at) {
    const expiresAt = Date.parse(row.expires_at);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null;
  }
  return row.value ?? null;
}

async function durableSet(options, namespace, key, value, cacheOptions = {}) {
  const query = new URLSearchParams({ on_conflict: 'namespace,key' }).toString();
  await durableRequest(options, 'POST', query, [{
    namespace,
    key: String(key),
    value,
    tags: durableTags(cacheOptions.tags),
    expires_at: durableExpiresAt(cacheOptions),
    updated_at: new Date().toISOString(),
  }], 'resolution=merge-duplicates,return=minimal');
  return true;
}

async function durableSetIfAbsent(options, namespace, key, value, cacheOptions = {}) {
  const nowIso = new Date().toISOString();
  const expiredQuery = new URLSearchParams({
    namespace: 'eq.' + namespace,
    key: 'eq.' + String(key),
    expires_at: 'lt.' + nowIso,
  }).toString();
  await durableRequest(options, 'DELETE', expiredQuery).catch(() => null);
  const query = new URLSearchParams({ on_conflict: 'namespace,key' }).toString();
  const rows = await durableRequest(options, 'POST', query, [{
    namespace,
    key: String(key),
    value,
    tags: durableTags(cacheOptions.tags),
    expires_at: durableExpiresAt(cacheOptions),
    updated_at: new Date().toISOString(),
  }], 'resolution=ignore-duplicates,return=representation');
  return Array.isArray(rows) && rows.length > 0;
}

async function durableDelete(options, namespace, key) {
  await durableRequest(options, 'DELETE', durableExactQuery(namespace, key));
  return true;
}

async function durableExpireTag(options, namespace, tag) {
  const query = new URLSearchParams({
    namespace: 'eq.' + namespace,
    tags: 'cs.{' + String(tag) + '}',
  }).toString();
  await durableRequest(options, 'DELETE', query);
  return true;
}

function createDurableStateMirror(runtime, options, namespace) {
  return {
    async get(key) {
      if (!isDurableKey(namespace, key)) return runtime.get(key);
      try {
        const durable = await durableGet(options, namespace, key);
        if (durable !== null && durable !== undefined) return durable;
      } catch (error) {
        durableWarn('RUDI_DURABLE_DB_READ_ERROR', error);
      }

      const fallback = await runtime.get(key);
      if (fallback !== null && fallback !== undefined) {
        const ttl = migrationTtlSeconds(namespace, key);
        durableSet(options, namespace, key, fallback, {
          ...(ttl ? { ttl } : {}),
          tags: ['rudi-migrated-from-runtime-cache'],
        }).catch((error) => durableWarn('RUDI_DURABLE_DB_MIGRATION_ERROR', error));
      }
      return fallback;
    },

    async set(key, value, cacheOptions = {}) {
      if (!isDurableKey(namespace, key)) return runtime.set(key, value, cacheOptions);
      const [database, cache] = await Promise.allSettled([
        durableSet(options, namespace, key, value, cacheOptions),
        runtime.set(key, value, cacheOptions),
      ]);
      if (database.status === 'fulfilled') {
        if (cache.status === 'rejected') durableWarn('RUDI_DURABLE_RUNTIME_WRITE_ERROR', cache.reason);
        return true;
      }
      durableWarn('RUDI_DURABLE_DB_WRITE_ERROR', database.reason);
      if (cache.status === 'fulfilled') return true;
      throw database.reason || cache.reason || new Error('RUDI durable state write failed');
    },

    async setIfAbsent(key, value, cacheOptions = {}) {
      if (!isDurableKey(namespace, key)) {
        throw new Error('Atomic setIfAbsent is only available for durable state');
      }
      const inserted = await durableSetIfAbsent(options, namespace, key, value, cacheOptions);
      if (!inserted) return false;
      runtime.set(key, value, cacheOptions).catch((error) => durableWarn('RUDI_DURABLE_RUNTIME_WRITE_ERROR', error));
      return true;
    },

    async delete(key) {
      if (!isDurableKey(namespace, key)) return runtime.delete(key);
      const [database, cache] = await Promise.allSettled([
        durableDelete(options, namespace, key),
        runtime.delete(key),
      ]);
      if (database.status === 'fulfilled') {
        if (cache.status === 'rejected') durableWarn('RUDI_DURABLE_RUNTIME_DELETE_ERROR', cache.reason);
        return true;
      }
      durableWarn('RUDI_DURABLE_DB_DELETE_ERROR', database.reason);
      if (cache.status === 'fulfilled') return true;
      throw database.reason || cache.reason || new Error('RUDI durable state delete failed');
    },

    async expireTag(tag) {
      if (!isDurableTag(namespace, tag)) {
        if (typeof runtime.expireTag !== 'function') throw new Error('Vercel Runtime Cache expireTag is unavailable');
        return runtime.expireTag(tag);
      }
      const databasePromise = durableExpireTag(options, namespace, tag);
      const cachePromise = typeof runtime.expireTag === 'function'
        ? runtime.expireTag(tag)
        : Promise.reject(new Error('Vercel Runtime Cache expireTag is unavailable'));
      const [database, cache] = await Promise.allSettled([databasePromise, cachePromise]);
      if (database.status === 'fulfilled') {
        if (cache.status === 'rejected') durableWarn('RUDI_DURABLE_RUNTIME_EXPIRE_TAG_ERROR', cache.reason);
        return true;
      }
      durableWarn('RUDI_DURABLE_DB_EXPIRE_TAG_ERROR', database.reason);
      if (cache.status === 'fulfilled') return true;
      throw database.reason || cache.reason || new Error('RUDI durable state expireTag failed');
    },
  };
}

function createStrictRuntimeCache(options = {}) {
  const env = options.env || process.env;
  const endpoint = String(options.endpoint || env.RUNTIME_CACHE_ENDPOINT || '').trim();
  const rawHeaders = options.headers || env.RUNTIME_CACHE_HEADERS;
  const namespace = String(options.namespace || '');
  const attempts = Math.max(1, Number(options.attempts || DEFAULT_ATTEMPTS));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));

  const explicitDirect = options.endpoint !== undefined || options.headers !== undefined;
  let runtime;
  if (!explicitDirect && (!endpoint || !rawHeaders)) {
    runtime = createOfficialRuntimeCache(options, namespace, attempts, retryDelayMs);
  } else {
    if (!endpoint) throw new Error('RUNTIME_CACHE_ENDPOINT is not configured');
    const headers = parseHeaders(rawHeaders);
    const timeoutMs = Math.max(250, Number(options.timeoutMs || env.PRODUCTS_CACHE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
    runtime = createDirectRuntimeCache(options, endpoint, headers, namespace, timeoutMs, attempts, retryDelayMs);
  }
  return createDurableStateMirror(runtime, options, namespace);
}

module.exports = {
  CACHE_STATE_HEADER,
  hashRuntimeCacheKey,
  transformRuntimeCacheKey,
  createStrictRuntimeCache,
};

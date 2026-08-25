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
  const confirmWrites = options.confirmWrites !== false;
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
          for (let confirm = 0; confirm < attempts; confirm += 1) {
            const stored = await cache.get(key);
            if (stored !== null && stored !== undefined && isDeepStrictEqual(stored, value)) return true;
            if (confirm + 1 < attempts) await sleep(retryDelayMs * (confirm + 1));
          }
          lastError = new Error(`Runtime Cache write did not persist for ${key}`);
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

function createStrictRuntimeCache(options = {}) {
  const env = options.env || process.env;
  const endpoint = String(options.endpoint || env.RUNTIME_CACHE_ENDPOINT || '').trim();
  const rawHeaders = options.headers || env.RUNTIME_CACHE_HEADERS;
  const namespace = String(options.namespace || '');
  const attempts = Math.max(1, Number(options.attempts || DEFAULT_ATTEMPTS));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));

  const explicitDirect = options.endpoint !== undefined || options.headers !== undefined;
  if (!explicitDirect && (!endpoint || !rawHeaders)) {
    return createOfficialRuntimeCache(options, namespace, attempts, retryDelayMs);
  }
  if (!endpoint) throw new Error('RUNTIME_CACHE_ENDPOINT is not configured');
  const headers = parseHeaders(rawHeaders);
  const timeoutMs = Math.max(250, Number(options.timeoutMs || env.PRODUCTS_CACHE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  return createDirectRuntimeCache(options, endpoint, headers, namespace, timeoutMs, attempts, retryDelayMs);
}

module.exports = {
  CACHE_STATE_HEADER,
  hashRuntimeCacheKey,
  transformRuntimeCacheKey,
  createStrictRuntimeCache,
};

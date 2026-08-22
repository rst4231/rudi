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

function createStrictRuntimeCache(options = {}) {
  const env = options.env || process.env;
  const endpoint = String(options.endpoint || env.RUNTIME_CACHE_ENDPOINT || '').trim();
  if (!endpoint) throw new Error('RUNTIME_CACHE_ENDPOINT is not configured');
  const headers = parseHeaders(options.headers || env.RUNTIME_CACHE_HEADERS);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');
  const namespace = String(options.namespace || '');
  const timeoutMs = Math.max(250, Number(options.timeoutMs || env.PRODUCTS_CACHE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  const attempts = Math.max(1, Number(options.attempts || DEFAULT_ATTEMPTS));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));

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
          lastError = new Error(`Runtime Cache read is ${state}`);
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

module.exports = {
  CACHE_STATE_HEADER,
  hashRuntimeCacheKey,
  transformRuntimeCacheKey,
  createStrictRuntimeCache,
};

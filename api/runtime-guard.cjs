const { AsyncLocalStorage } = require('node:async_hooks');

const cronSecretContext = new AsyncLocalStorage();
const ENV_PROXY_MARKER = Symbol.for('rudi.cron-secret-env-proxy');
const FETCH_GUARD_MARKER = Symbol.for('rudi.telegram-fetch-guard');

function cronSecretHidden() {
  return cronSecretContext.getStore()?.hideCronSecret === true;
}

function installContextualEnvProxy() {
  if (globalThis[ENV_PROXY_MARKER]) return globalThis[ENV_PROXY_MARKER];

  const originalEnv = process.env;
  const proxy = new Proxy(originalEnv, {
    get(target, property, receiver) {
      if (property === 'CRON_SECRET' && cronSecretHidden()) return undefined;
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (property === 'CRON_SECRET' && cronSecretHidden()) return false;
      return Reflect.has(target, property);
    },
    ownKeys(target) {
      const keys = Reflect.ownKeys(target);
      if (!cronSecretHidden()) return keys;
      return keys.filter((key) => key !== 'CRON_SECRET');
    },
    getOwnPropertyDescriptor(target, property) {
      if (property === 'CRON_SECRET' && cronSecretHidden()) return undefined;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });

  process.env = proxy;
  globalThis[ENV_PROXY_MARKER] = { originalEnv, proxy };
  return globalThis[ENV_PROXY_MARKER];
}

function runWithCronSecretHidden(task) {
  installContextualEnvProxy();
  return cronSecretContext.run({ hideCronSecret: true }, task);
}

function isTelegramApiUrl(input) {
  const value = typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'api.telegram.org'
      && /^\/bot[^/]+\/[A-Za-z0-9_]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function telegramRetryDelay(response, fallbackMs = 1000) {
  if (response.status !== 429) return null;
  try {
    const payload = await response.clone().json();
    const seconds = Number(payload?.parameters?.retry_after);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  } catch {
    // Fall through to a conservative retry delay.
  }
  return fallbackMs;
}

function installTelegramFetchGuard(baseFetch = globalThis.fetch, options = {}) {
  if (typeof baseFetch !== 'function') throw new TypeError('fetch is not available');

  const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 2;
  const retryPaddingMs = Number.isFinite(options.retryPaddingMs) ? options.retryPaddingMs : 150;
  const fallbackRetryMs = Number.isFinite(options.fallbackRetryMs) ? options.fallbackRetryMs : 1000;
  let queue = Promise.resolve();
  let blockedUntil = 0;

  async function execute(input, init) {
    let attempt = 0;
    while (true) {
      const waitMs = blockedUntil - Date.now();
      if (waitMs > 0) await sleep(waitMs);

      const response = await baseFetch(input, init);
      const delayMs = await telegramRetryDelay(response, fallbackRetryMs);
      if (delayMs === null || attempt >= maxRetries) return response;

      attempt += 1;
      blockedUntil = Math.max(blockedUntil, Date.now() + delayMs + retryPaddingMs);
    }
  }

  return function guardedFetch(input, init) {
    if (!isTelegramApiUrl(input)) return baseFetch(input, init);

    const run = queue.then(
      () => execute(input, init),
      () => execute(input, init),
    );
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
}

function installGlobalTelegramFetchGuard(options = {}) {
  if (globalThis[FETCH_GUARD_MARKER]) return globalThis[FETCH_GUARD_MARKER];
  const originalFetch = globalThis.fetch;
  const guardedFetch = installTelegramFetchGuard(originalFetch, options);
  globalThis.fetch = guardedFetch;
  globalThis[FETCH_GUARD_MARKER] = { originalFetch, guardedFetch };
  return globalThis[FETCH_GUARD_MARKER];
}

module.exports = {
  installContextualEnvProxy,
  runWithCronSecretHidden,
  isTelegramApiUrl,
  installTelegramFetchGuard,
  installGlobalTelegramFetchGuard,
};

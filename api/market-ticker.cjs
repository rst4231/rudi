const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const CACHE_TTL_SECONDS = 300;
const STALE_CACHE_TTL_SECONDS = 6 * 60 * 60;
const PROVIDER_BACKOFF_SECONDS = 10 * 60;
const CBR_URL = 'https://www.cbr.ru/scripts/XML_daily.asp';
const KRAKEN_URL = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD';

let refreshPromise = null;

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, Number(timeoutMs) || 4000));
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseCbrUsd(xml) {
  const text = String(xml || '');
  const blocks = text.match(/<Valute\b[\s\S]*?<\/Valute>/gi) || [];
  const block = blocks.find((row) => /<CharCode>\s*USD\s*<\/CharCode>/i.test(row));
  if (!block) throw new Error('market-cbr-usd-missing');
  const nominalMatch = block.match(/<Nominal>\s*([\d.,]+)\s*<\/Nominal>/i);
  const valueMatch = block.match(/<Value>\s*([\d.,]+)\s*<\/Value>/i);
  const nominal = finiteNumber(String(nominalMatch?.[1] || '1').replace(',', '.')) || 1;
  const value = finiteNumber(String(valueMatch?.[1] || '').replace(',', '.'));
  if (!value || nominal <= 0) throw new Error('market-cbr-usd-invalid');
  return value / nominal;
}

async function fetchUsdRub(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('market-fetch-unavailable');
  const response = await fetchWithTimeout(fetchImpl, CBR_URL, {
    headers: {
      accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5',
      'user-agent': 'RUDI/2.127',
    },
    cache: 'no-store',
  }, options.timeoutMs);
  if (!response.ok) throw new Error('market-cbr-http-' + response.status);
  const value = parseCbrUsd(await response.text());
  return {
    id: 'usd-rub',
    label: 'USD/RUB',
    value,
    change24h: null,
    source: 'ЦБ РФ',
  };
}

function krakenRow(result, token) {
  const entries = Object.entries(result && typeof result === 'object' ? result : {});
  return entries.find(([key]) => String(key).toUpperCase().includes(token))?.[1] || null;
}

function parseKrakenCrypto(payload) {
  const errors = Array.isArray(payload?.error) ? payload.error.filter(Boolean) : [];
  if (errors.length) throw new Error('market-kraken-response:' + errors.join(','));
  const result = payload?.result && typeof payload.result === 'object' ? payload.result : {};
  const rows = [
    ['XBT', 'btcusdt', 'BTC'],
    ['ETH', 'ethusdt', 'ETH'],
  ];
  const items = rows.map(([token, id, label]) => {
    const row = krakenRow(result, token);
    const value = finiteNumber(Array.isArray(row?.c) ? row.c[0] : null);
    const open = finiteNumber(row?.o);
    if (!value || value <= 0) return null;
    const change24h = open && open > 0 ? ((value / open) - 1) * 100 : null;
    return {
      id,
      label,
      value,
      change24h,
      source: 'Kraken',
    };
  }).filter(Boolean);
  if (items.length !== 2) throw new Error('market-kraken-price-invalid');
  return items;
}

async function fetchKrakenCrypto(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('market-fetch-unavailable');
  const response = await fetchWithTimeout(fetchImpl, KRAKEN_URL, {
    headers: {
      accept: 'application/json',
      'user-agent': 'RUDI/2.127',
    },
    cache: 'no-store',
  }, options.timeoutMs);
  if (!response.ok) throw new Error('market-kraken-http-' + response.status);
  return parseKrakenCrypto(await response.json());
}

function completeItems(items) {
  const ids = new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id || '')));
  return ['usd-rub','btcusdt','ethusdt'].every((id) => ids.has(id));
}

function cacheOf(options = {}) {
  if (options.marketTickerCache) return options.marketTickerCache;
  return createStrictRuntimeCache({
    namespace: 'rudi-market-ticker-v2',
    confirmWrites: false,
    ...(options.cacheOptions || {}),
  });
}

function validCached(value, { requireComplete = false } = {}) {
  const items = Array.isArray(value?.items) ? value.items : [];
  if (!items.length) return false;
  if (requireComplete && !completeItems(items)) return false;
  return items.every((item) =>
    item &&
    typeof item.label === 'string' &&
    Number.isFinite(Number(item.value)) &&
    Number(item.value) > 0
  );
}

async function safeCacheGet(cache, key) {
  try {
    return await cache.get(key);
  } catch (error) {
    console.warn('RUDI_MARKET_CACHE_READ_WARN', String(error?.message || error));
    return null;
  }
}

async function safeCacheSet(cache, key, value, ttl, name) {
  try {
    await cache.set(key, value, {
      ttl,
      tags: ['rudi-market-ticker'],
      name,
    });
    return true;
  } catch (error) {
    console.warn('RUDI_MARKET_CACHE_WRITE_WARN', String(error?.message || error));
    return false;
  }
}

async function refreshMarketTicker(cache, options = {}) {
  const stale = await safeCacheGet(cache, 'stale');
  const backoff = await safeCacheGet(cache, 'crypto-backoff');
  const skipKraken = Boolean(backoff && Number(backoff.until || 0) > Number(options.now || Date.now()));

  const primary = await Promise.allSettled([
    fetchUsdRub(options),
    skipKraken
      ? Promise.reject(new Error('market-kraken-backoff'))
      : fetchKrakenCrypto(options),
  ]);

  const byId = new Map();
  if (primary[0].status === 'fulfilled') byId.set(primary[0].value.id, primary[0].value);

  let cryptoFresh = false;
  if (primary[1].status === 'fulfilled') {
    primary[1].value.forEach((item) => byId.set(item.id, item));
    cryptoFresh = true;
    if (typeof cache.delete === 'function') {
      cache.delete('crypto-backoff').catch(() => {});
    }
  } else {
    if (!skipKraken) {
      const reason = String(primary[1].reason?.message || primary[1].reason || 'market-kraken-unavailable');
      console.warn('RUDI_MARKET_KRAKEN_BACKOFF', reason);
      const until = Number(options.now || Date.now()) + PROVIDER_BACKOFF_SECONDS * 1000;
      await safeCacheSet(
        cache,
        'crypto-backoff',
        { until, reason },
        PROVIDER_BACKOFF_SECONDS,
        'market-ticker-crypto-backoff-v1'
      );
    }
    if (validCached(stale, { requireComplete: true })) {
      stale.items
        .filter((item) => item?.id === 'btcusdt' || item?.id === 'ethusdt')
        .forEach((item) => byId.set(item.id, { ...item, stale: true }));
    }
  }

  if (!byId.has('usd-rub') && validCached(stale, { requireComplete: true })) {
    const usd = stale.items.find((item) => item?.id === 'usd-rub');
    if (usd) byId.set('usd-rub', { ...usd, stale: true });
  }

  const items = ['usd-rub','btcusdt','ethusdt'].map((id) => byId.get(id)).filter(Boolean);
  if (!items.length) {
    const reasons = primary
      .filter((row) => row.status === 'rejected')
      .map((row) => String(row.reason?.message || row.reason))
      .filter(Boolean);
    throw new Error('market-ticker-unavailable:' + reasons.join(','));
  }

  const full = completeItems(items);
  const staleUsed = items.some((item) => item?.stale === true);
  const payload = {
    items,
    updatedAt: new Date(options.now || Date.now()).toISOString(),
    partial: !full,
    cached: false,
    stale: staleUsed,
  };

  await safeCacheSet(cache, 'latest', payload, CACHE_TTL_SECONDS, 'market-ticker-latest-v3');
  if (full && cryptoFresh && !staleUsed) {
    await safeCacheSet(cache, 'stale', payload, STALE_CACHE_TTL_SECONDS, 'market-ticker-stale-v1');
  }
  return payload;
}

async function readMarketTicker(options = {}) {
  const cache = cacheOf(options);
  const cached = await safeCacheGet(cache, 'latest');
  if (validCached(cached)) return { ...cached, cached: true };

  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshMarketTicker(cache, options);
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

module.exports = {
  CACHE_TTL_SECONDS,
  STALE_CACHE_TTL_SECONDS,
  PROVIDER_BACKOFF_SECONDS,
  CBR_URL,
  KRAKEN_URL,
  parseCbrUsd,
  parseKrakenCrypto,
  fetchUsdRub,
  fetchKrakenCrypto,
  readMarketTicker,
};

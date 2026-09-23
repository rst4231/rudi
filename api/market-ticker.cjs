const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const CACHE_TTL_SECONDS = 300;
const CBR_URL = 'https://www.cbr.ru/scripts/XML_daily.asp';
const BYBIT_URL = 'https://api.bybit.com/v5/market/tickers';

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
    headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' },
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

async function fetchBybit(symbol, label, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('market-fetch-unavailable');
  const url = BYBIT_URL + '?category=spot&symbol=' + encodeURIComponent(symbol);
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: { accept: 'application/json' },
  }, options.timeoutMs);
  if (!response.ok) throw new Error('market-bybit-http-' + response.status);
  const payload = await response.json();
  if (Number(payload?.retCode || 0) !== 0) throw new Error('market-bybit-response');
  const row = Array.isArray(payload?.result?.list) ? payload.result.list[0] : null;
  const value = finiteNumber(row?.lastPrice);
  const fraction = finiteNumber(row?.price24hPcnt);
  if (!value) throw new Error('market-bybit-price-invalid');
  return {
    id: symbol.toLowerCase(),
    label,
    value,
    change24h: fraction == null ? null : fraction * 100,
    source: 'Bybit',
  };
}

function cacheOf(options = {}) {
  if (options.marketTickerCache) return options.marketTickerCache;
  return createStrictRuntimeCache({
    namespace: 'rudi-market-ticker-v1',
    confirmWrites: false,
    ...(options.cacheOptions || {}),
  });
}

function validCached(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(value.items) &&
    value.items.length &&
    value.items.every((item) => item && typeof item.label === 'string' && Number.isFinite(Number(item.value)))
  );
}

async function readMarketTicker(options = {}) {
  const cache = cacheOf(options);
  try {
    const cached = await cache.get('latest');
    if (validCached(cached)) return { ...cached, cached: true };
  } catch (error) {
    console.warn('RUDI_MARKET_CACHE_READ_WARN', String(error?.message || error));
  }

  const tasks = [
    fetchUsdRub(options),
    fetchBybit('BTCUSDT', 'BTC', options),
    fetchBybit('ETHUSDT', 'ETH', options),
  ];
  const settled = await Promise.allSettled(tasks);
  const items = settled.filter((row) => row.status === 'fulfilled').map((row) => row.value);

  if (!items.length) {
    const reasons = settled.map((row) => row.status === 'rejected' ? String(row.reason?.message || row.reason) : '').filter(Boolean);
    throw new Error('market-ticker-unavailable:' + reasons.join(','));
  }

  const payload = {
    items,
    updatedAt: new Date(options.now || Date.now()).toISOString(),
    partial: items.length < tasks.length,
    cached: false,
  };

  try {
    await cache.set('latest', payload, {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-market-ticker'],
      name: 'market-ticker-latest',
    });
  } catch (error) {
    console.warn('RUDI_MARKET_CACHE_WRITE_WARN', String(error?.message || error));
  }
  return payload;
}

module.exports = {
  CACHE_TTL_SECONDS,
  CBR_URL,
  BYBIT_URL,
  parseCbrUsd,
  fetchUsdRub,
  fetchBybit,
  readMarketTicker,
};

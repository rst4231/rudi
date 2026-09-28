'use strict';

const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json';
const PRICES_URL = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const AIRLINES_URL = 'https://api.travelpayouts.com/data/ru/airlines.json';
const SNAPSHOT_TTL_SECONDS = 365 * 24 * 60 * 60;
const AIRLINES_TTL_SECONDS = 30 * 24 * 60 * 60;

const DEFAULT_DESTINATIONS = [
  { id: 'turkey-antalya', countryId: 'turkey', country: 'Турция', city: 'Анталия', iata: 'AYT' },
  { id: 'egypt-sharm', countryId: 'egypt', country: 'Египет', city: 'Шарм-эль-Шейх', iata: 'SSH' },
  { id: 'thailand-phuket', countryId: 'thailand', country: 'Таиланд', city: 'Пхукет', iata: 'HKT' },
  { id: 'bali-denpasar', countryId: 'bali', country: 'Бали', city: 'Денпасар', iata: 'DPS' },
  { id: 'china-beijing', countryId: 'china', country: 'Китай', city: 'Пекин', iata: 'BJS' },
  { id: 'china-shanghai', countryId: 'china', country: 'Китай', city: 'Шанхай', iata: 'SHA' },
];

const DEFAULT_CONFIG = {
  enabled: true,
  visibleTo: ['Рустам'],
  origin: { city: 'Санкт-Петербург', iata: 'LED' },
  currency: 'rub',
  market: 'ru',
  departureWindowDays: { from: 30, to: 60 },
  maxTransfers: 1,
  directPriority: true,
  refreshTime: '06:00',
  destinations: DEFAULT_DESTINATIONS,
};

let configMemo = null;
let refreshPromise = null;

function moscowDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return map.year + '-' + map.month + '-' + map.day;
}

function shiftDateKey(dateKey, days) {
  const parts = String(dateKey || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) throw new Error('cheap-flights-date-invalid');
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function monthKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

function shiftMonth(month, amount) {
  const parts = String(month || '').split('-').map(Number);
  if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value))) throw new Error('cheap-flights-month-invalid');
  const date = new Date(Date.UTC(parts[0], parts[1] - 1 + Number(amount || 0), 1));
  return date.toISOString().slice(0, 7);
}

function monthsBetween(fromDateKey, toDateKey) {
  const result = [];
  let cursor = monthKey(fromDateKey);
  const end = monthKey(toDateKey);
  for (let guard = 0; guard < 6; guard += 1) {
    result.push(cursor);
    if (cursor === end) return result;
    cursor = shiftMonth(cursor, 1);
  }
  return result;
}

function searchWindow(now = new Date(), config = DEFAULT_CONFIG) {
  const today = moscowDateKey(now);
  const fromDays = Math.max(1, Number(config?.departureWindowDays?.from || 30));
  const toDays = Math.max(fromDays, Number(config?.departureWindowDays?.to || 60));
  return {
    from: shiftDateKey(today, fromDays),
    to: shiftDateKey(today, toDays),
  };
}

function safeDestination(value) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const iata = String(row.iata || '').trim().toUpperCase();
  const countryId = String(row.countryId || '').trim();
  const country = String(row.country || '').trim();
  const city = String(row.city || '').trim();
  if (!/^[A-Z]{3}$/.test(iata) || !countryId || !country || !city) return null;
  return {
    id: String(row.id || (countryId + '-' + iata.toLowerCase())).trim(),
    countryId,
    country,
    city,
    iata,
  };
}

function normalizeCheapFlightsConfig(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const originSource = source.origin && typeof source.origin === 'object' ? source.origin : {};
  const originIata = /^[A-Z]{3}$/.test(String(originSource.iata || '').trim().toUpperCase())
    ? String(originSource.iata).trim().toUpperCase()
    : DEFAULT_CONFIG.origin.iata;
  const destinations = (Array.isArray(source.destinations) ? source.destinations : DEFAULT_DESTINATIONS)
    .map(safeDestination)
    .filter(Boolean);
  const visibleTo = (Array.isArray(source.visibleTo) ? source.visibleTo : DEFAULT_CONFIG.visibleTo)
    .map((value) => String(value || '').trim())
    .filter((value) => value === 'Рустам' || value === 'Диана');
  const fromDays = Math.max(1, Number(source?.departureWindowDays?.from || DEFAULT_CONFIG.departureWindowDays.from));
  const toDays = Math.max(fromDays, Number(source?.departureWindowDays?.to || DEFAULT_CONFIG.departureWindowDays.to));
  return {
    enabled: source.enabled !== false,
    visibleTo: visibleTo.length ? [...new Set(visibleTo)] : [...DEFAULT_CONFIG.visibleTo],
    origin: {
      city: String(originSource.city || DEFAULT_CONFIG.origin.city).trim() || DEFAULT_CONFIG.origin.city,
      iata: originIata,
    },
    currency: String(source.currency || DEFAULT_CONFIG.currency).trim().toLowerCase() || 'rub',
    market: String(source.market || DEFAULT_CONFIG.market).trim().toLowerCase() || 'ru',
    departureWindowDays: { from: fromDays, to: toDays },
    maxTransfers: Math.min(1, Math.max(0, Number(source.maxTransfers ?? DEFAULT_CONFIG.maxTransfers))),
    directPriority: source.directPriority !== false,
    refreshTime: String(source.refreshTime || DEFAULT_CONFIG.refreshTime).trim() || '06:00',
    destinations: destinations.length ? destinations : DEFAULT_DESTINATIONS.map((row) => ({ ...row })),
  };
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('cheap-flights-fetch-unavailable');
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 9000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: options.headers || { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error('cheap-flights-http-' + Number(response?.status || 0));
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadCheapFlightsConfig(options = {}) {
  if (options.config) return normalizeCheapFlightsConfig(options.config.cheapFlights || options.config);
  if (configMemo && Date.now() - configMemo.loadedAt < 5 * 60 * 1000) return configMemo.value;
  let value = normalizeCheapFlightsConfig(DEFAULT_CONFIG);
  try {
    const remote = await fetchJson(options.configUrl || CONFIG_URL, {
      fetchImpl: options.fetchImpl,
      timeoutMs: 3000,
      headers: { Accept: 'application/json', 'User-Agent': 'RUDI-Cheap-Flights/1.0' },
    });
    value = normalizeCheapFlightsConfig(remote?.cheapFlights || DEFAULT_CONFIG);
  } catch (error) {
    if (!options.silentConfigErrors) {
      console.warn('RUDI_CHEAP_FLIGHTS_CONFIG_WARN', String(error?.message || error));
    }
  }
  configMemo = { loadedAt: Date.now(), value };
  return value;
}

function resolveTravelpayoutsToken(env = process.env) {
  return String(
    env?.TRAVELPAYOUTS_TOKEN
    || env?.AVIASALES_API_TOKEN
    || env?.AVIASALES_TOKEN
    || ''
  ).trim();
}

function resolveCache(options = {}) {
  if (options.cache) return options.cache;
  return createStrictRuntimeCache({
    namespace: 'rudi-cheap-flights-v1',
    confirmWrites: false,
    ...(options.cacheOptions || {}),
  });
}

function datePart(value) {
  const text = String(value || '');
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function validAviasalesLink(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https:\/\/(?:www\.)?aviasales\.ru\//i.test(text)) return text;
  if (text.startsWith('/')) return 'https://www.aviasales.ru' + text;
  return '';
}

function normalizeTicket(raw, destination, airlineNames, window, config, now = new Date()) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const departureDate = datePart(source.departure_at);
  const returnDate = datePart(source.return_at);
  const price = Math.round(Number(source.price || 0));
  const transfers = Number(source.transfers);
  const returnTransfers = Number(source.return_transfers);
  const maxTransfers = Math.max(transfers, returnTransfers);
  const link = validAviasalesLink(source.link);
  const airline = String(source.airline || '').trim().toUpperCase();
  const expiresAt = Date.parse(String(source.expires_at || ''));
  if (!departureDate || !returnDate || !price || price < 1) return null;
  if (departureDate < window.from || departureDate > window.to) return null;
  if (returnDate <= departureDate) return null;
  if (!Number.isInteger(transfers) || transfers < 0 || !Number.isInteger(returnTransfers) || returnTransfers < 0) return null;
  if (maxTransfers > config.maxTransfers) return null;
  if (!link) return null;
  if (Number.isFinite(expiresAt) && expiresAt <= Number(now)) return null;
  return {
    id: [
      destination.iata,
      departureDate,
      returnDate,
      airline,
      String(price),
      String(transfers),
      String(returnTransfers),
    ].join(':'),
    countryId: destination.countryId,
    country: destination.country,
    city: destination.city,
    destination: destination.iata,
    origin: config.origin.iata,
    price,
    currency: config.currency,
    departureAt: String(source.departure_at || ''),
    returnAt: String(source.return_at || ''),
    departureDate,
    returnDate,
    airline,
    airlineName: String(airlineNames?.[airline] || airline || 'Авиакомпания'),
    transfers,
    returnTransfers,
    maxTransfers,
    direct: transfers === 0 && returnTransfers === 0,
    link,
  };
}

function compareTickets(left, right, config = DEFAULT_CONFIG) {
  if (config.directPriority !== false && left.maxTransfers !== right.maxTransfers) {
    return left.maxTransfers - right.maxTransfers;
  }
  if (left.price !== right.price) return left.price - right.price;
  if (left.departureDate !== right.departureDate) return left.departureDate.localeCompare(right.departureDate);
  return left.returnDate.localeCompare(right.returnDate);
}

function uniqueTickets(rows) {
  const result = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(row);
  }
  return result;
}

function bestPriceMap(rows, keyField, config) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = String(row?.[keyField] || '');
    if (!key) continue;
    const current = groups.get(key);
    if (!current || compareTickets(row, current, config) < 0) groups.set(key, row);
  }
  return Object.fromEntries([...groups.entries()].map(([key, row]) => [key, { price: row.price, destination: row.destination }]));
}

function withDelta(row, previousPrice) {
  const previous = Number(previousPrice);
  return {
    ...row,
    delta: Number.isFinite(previous) && previous > 0 ? row.price - previous : null,
  };
}

function buildSnapshot(rows, config, previousSnapshot = null, now = new Date()) {
  const sorted = uniqueTickets(rows).sort((a, b) => compareTickets(a, b, config));
  const routePrices = bestPriceMap(sorted, 'destination', config);
  const countryPrices = bestPriceMap(sorted, 'countryId', config);
  const previousRoutes = previousSnapshot?.routePrices || {};
  const previousCountries = previousSnapshot?.countryPrices || {};
  const top = sorted.slice(0, 3).map((row) => withDelta(row, previousRoutes?.[row.destination]?.price));
  const countries = [];
  const order = [];
  for (const destination of config.destinations) {
    if (!order.includes(destination.countryId)) order.push(destination.countryId);
  }
  for (const countryId of order) {
    const row = sorted.find((ticket) => ticket.countryId === countryId);
    if (!row) continue;
    countries.push(withDelta(row, previousCountries?.[countryId]?.price));
  }
  const window = searchWindow(now, config);
  return {
    version: 1,
    dateKey: moscowDateKey(now),
    updatedAt: new Date(now).toISOString(),
    origin: { ...config.origin },
    currency: config.currency,
    refreshTime: config.refreshTime,
    window,
    top,
    countries,
    routePrices,
    countryPrices,
  };
}

async function loadAirlineNames(options = {}) {
  const cache = resolveCache(options);
  const cached = await cache.get('airlines:ru').catch(() => null);
  if (cached && typeof cached === 'object' && !Array.isArray(cached)) return cached;
  try {
    const data = await fetchJson(options.airlinesUrl || AIRLINES_URL, {
      fetchImpl: options.fetchImpl,
      timeoutMs: 5000,
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'User-Agent': 'RUDI-Cheap-Flights/1.0' },
    });
    const rows = Array.isArray(data) ? data : [];
    const names = {};
    for (const row of rows) {
      const code = String(row?.code || '').trim().toUpperCase();
      if (!code) continue;
      names[code] = String(row?.name_translations?.ru || row?.name || row?.name_translations?.en || code).trim() || code;
    }
    if (Object.keys(names).length) {
      await cache.set('airlines:ru', names, {
        ttl: AIRLINES_TTL_SECONDS,
        tags: ['rudi-cheap-flights-airlines'],
        name: 'airlines:ru',
      }).catch(() => null);
    }
    return names;
  } catch (error) {
    console.warn('RUDI_CHEAP_FLIGHTS_AIRLINES_WARN', String(error?.message || error));
    return {};
  }
}

function buildPriceRequests(config, window) {
  const requests = [];
  for (const destination of config.destinations) {
    for (const departureMonth of monthsBetween(window.from, window.to)) {
      for (const returnMonth of [departureMonth, shiftMonth(departureMonth, 1)]) {
        requests.push({ destination, departureMonth, returnMonth });
      }
    }
  }
  return requests;
}

function pricesUrl(config, request) {
  const params = new URLSearchParams({
    origin: config.origin.iata,
    destination: request.destination.iata,
    departure_at: request.departureMonth,
    return_at: request.returnMonth,
    one_way: 'false',
    direct: 'false',
    market: config.market,
    currency: config.currency,
    sorting: 'price',
    unique: 'false',
    limit: '100',
    page: '1',
  });
  return PRICES_URL + '?' + params.toString();
}

async function mapPool(values, limit, worker) {
  const rows = Array.from(values || []);
  const result = new Array(rows.length);
  let cursor = 0;
  async function runner() {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await worker(rows[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Number(limit || 1)), rows.length || 1) }, () => runner()));
  return result;
}

async function fetchTickets(config, token, options = {}) {
  const window = searchWindow(options.now || new Date(), config);
  const airlines = await loadAirlineNames(options);
  const requests = buildPriceRequests(config, window);
  const batches = await mapPool(requests, 6, async (request) => {
    try {
      const payload = await fetchJson(pricesUrl(config, request), {
        fetchImpl: options.fetchImpl,
        timeoutMs: 4500,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'X-Access-Token': token,
          'User-Agent': 'RUDI-Cheap-Flights/1.0',
        },
      });
      if (payload?.success === false) throw new Error(String(payload?.error || 'cheap-flights-source-error'));
      return (Array.isArray(payload?.data) ? payload.data : [])
        .map((row) => normalizeTicket(row, request.destination, airlines, window, config, options.now || new Date()))
        .filter(Boolean);
    } catch (error) {
      console.warn(
        'RUDI_CHEAP_FLIGHTS_SOURCE_WARN',
        request.destination.iata,
        request.departureMonth,
        request.returnMonth,
        String(error?.message || error)
      );
      return [];
    }
  });
  return uniqueTickets(batches.flat());
}

async function refreshCheapFlightsSnapshot(options = {}) {
  if (refreshPromise && options.force !== true) return refreshPromise;
  const task = (async () => {
    const config = await loadCheapFlightsConfig(options);
    const cache = resolveCache(options);
    const today = moscowDateKey(options.now || new Date());
    const current = await cache.get('snapshot:current').catch(() => null);
    if (!config.enabled) return { configured: true, enabled: false, snapshot: current || null, skipped: 'disabled' };
    if (options.force !== true && current?.dateKey === today) {
      return { configured: true, enabled: true, snapshot: current, skipped: 'fresh' };
    }
    const token = resolveTravelpayoutsToken(options.env || process.env);
    if (!token) {
      return { configured: false, enabled: true, snapshot: current || null, skipped: 'token-missing' };
    }
    const yesterdayKey = shiftDateKey(today, -1);
    const previous = await cache.get('snapshot:' + yesterdayKey).catch(() => null)
      || (current?.dateKey && current.dateKey !== today ? current : null);
    const tickets = await fetchTickets(config, token, options);
    if (!tickets.length) {
      return { configured: true, enabled: true, snapshot: current || null, stale: Boolean(current), error: 'no-ticket-data' };
    }
    const snapshot = buildSnapshot(tickets, config, previous, options.now || new Date());
    await Promise.all([
      cache.set('snapshot:current', snapshot, {
        ttl: SNAPSHOT_TTL_SECONDS,
        tags: ['rudi-cheap-flights'],
        name: 'snapshot:current',
      }),
      cache.set('snapshot:' + today, snapshot, {
        ttl: SNAPSHOT_TTL_SECONDS,
        tags: ['rudi-cheap-flights'],
        name: 'snapshot:' + today,
      }),
    ]);
    return { configured: true, enabled: true, snapshot, refreshed: true };
  })();
  if (options.force !== true) refreshPromise = task;
  try {
    return await task;
  } finally {
    if (refreshPromise === task) refreshPromise = null;
  }
}

async function readCheapFlightsSnapshot(options = {}) {
  const config = await loadCheapFlightsConfig(options);
  const cache = resolveCache(options);
  const current = await cache.get('snapshot:current').catch(() => null);
  const today = moscowDateKey(options.now || new Date());
  const token = resolveTravelpayoutsToken(options.env || process.env);
  if (!config.enabled) return { configured: Boolean(token), enabled: false, config, snapshot: current || null };
  if (current?.dateKey === today || options.refreshIfNeeded === false) {
    return { configured: Boolean(token), enabled: true, config, snapshot: current || null, stale: current?.dateKey !== today };
  }
  const refreshed = await refreshCheapFlightsSnapshot({ ...options, config });
  return { ...refreshed, config };
}

function isCheapFlightsActorAllowed(actor, config = DEFAULT_CONFIG) {
  return config.enabled !== false && Array.isArray(config.visibleTo) && config.visibleTo.includes(String(actor || ''));
}

module.exports = {
  CONFIG_URL,
  PRICES_URL,
  AIRLINES_URL,
  DEFAULT_CONFIG,
  DEFAULT_DESTINATIONS,
  moscowDateKey,
  shiftDateKey,
  shiftMonth,
  monthsBetween,
  searchWindow,
  normalizeCheapFlightsConfig,
  resolveTravelpayoutsToken,
  validAviasalesLink,
  normalizeTicket,
  compareTickets,
  buildPriceRequests,
  buildSnapshot,
  loadCheapFlightsConfig,
  refreshCheapFlightsSnapshot,
  readCheapFlightsSnapshot,
  isCheapFlightsActorAllowed,
};

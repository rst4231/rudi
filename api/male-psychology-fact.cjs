const { createHash } = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json';
const CACHE_NAMESPACE = 'rudi-male-psychology-v1';
const CATALOG_TTL_SECONDS = 5 * 60;
const DATE_TTL_SECONDS = 3 * 24 * 60 * 60;
const HISTORY_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const MAX_USED_IDS = 2000;

function moscowDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function cleanText(value, limit = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeFact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 120);
  const title = cleanText(value.title, 180);
  const text = cleanText(value.text, 900);
  const sourceLabel = cleanText(value.sourceLabel || 'PubMed', 160);
  const sourceUrl = cleanText(value.sourceUrl, 500);
  if (!id || !title || !text || !/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?$/i.test(sourceUrl)) return null;
  return { id, title, text, sourceLabel, sourceUrl };
}

function normalizeCatalog(value) {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const section = root.malePsychology && typeof root.malePsychology === 'object' && !Array.isArray(root.malePsychology)
    ? root.malePsychology
    : {};
  const seen = new Set();
  const facts = [];
  for (const row of Array.isArray(section.facts) ? section.facts : []) {
    const fact = normalizeFact(row);
    if (!fact || seen.has(fact.id)) continue;
    seen.add(fact.id);
    facts.push(fact);
  }
  return {
    enabled: section.enabled !== false,
    disclaimer: cleanText(
      section.disclaimer || 'Это данные о средних групповых закономерностях. Они не описывают каждого мужчину.',
      320
    ),
    facts,
  };
}

function buildCache(options = {}) {
  if (options.cache && typeof options.cache.get === 'function' && typeof options.cache.set === 'function') return options.cache;
  return createStrictRuntimeCache({
    namespace: CACHE_NAMESPACE,
    confirmWrites: false,
    ...(options.cacheOptions || {}),
  });
}

async function fetchCatalog(options = {}, cache = null) {
  if (options.catalog) return normalizeCatalog({ malePsychology: options.catalog });
  if (cache) {
    try {
      const cached = await cache.get('catalog');
      if (cached && typeof cached === 'object' && Array.isArray(cached.facts)) return cached;
    } catch (_) {}
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('male-psychology-fetch-unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Number(options.timeoutMs || 2500)));
  try {
    const response = await fetchImpl(String(options.configUrl || CONFIG_URL) + '?t=' + Date.now(), {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('male-psychology-config-http-' + response.status);
    const parsed = await response.json();
    const catalog = normalizeCatalog(parsed);
    if (cache) {
      await cache.set('catalog', catalog, {
        ttl: CATALOG_TTL_SECONDS,
        tags: ['rudi-male-psychology-catalog'],
        name: 'male-psychology-catalog',
      }).catch(() => null);
    }
    return catalog;
  } finally {
    clearTimeout(timeout);
  }
}

function rankForDate(dateKey, id) {
  return createHash('sha256').update(String(dateKey) + ':' + String(id)).digest('hex');
}

function chooseUnseenFact(facts, usedIds, dateKey) {
  const used = usedIds instanceof Set ? usedIds : new Set(Array.isArray(usedIds) ? usedIds : []);
  return (Array.isArray(facts) ? facts : [])
    .filter((fact) => fact?.id && !used.has(fact.id))
    .map((fact) => ({ fact, rank: rankForDate(dateKey, fact.id) }))
    .sort((a, b) => a.rank.localeCompare(b.rank))[0]?.fact || null;
}

function fallbackFact(facts, dateKey) {
  const rows = (Array.isArray(facts) ? facts : [])
    .map((fact) => ({ fact, rank: rankForDate('stable-order', fact.id) }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
    .map((row) => row.fact);
  if (!rows.length) return null;
  const dayNumber = Math.floor(Date.parse(dateKey + 'T00:00:00.000Z') / 86400000);
  return rows[Math.abs(dayNumber) % rows.length] || rows[0];
}

async function readDailyMalePsychologyFact(options = {}) {
  const dateKey = moscowDateKey(options.now || Date.now());
  let cache = null;
  try { cache = buildCache(options); } catch (_) {}

  let catalog;
  try {
    catalog = await fetchCatalog(options, cache);
  } catch (error) {
    if (options.catalog) throw error;
    console.warn('RUDI_MALE_PSYCHOLOGY_CONFIG_WARN', String(error?.message || error));
    return null;
  }
  if (!catalog.enabled || !catalog.facts.length) return null;

  if (!cache) {
    console.warn('RUDI_MALE_PSYCHOLOGY_CACHE_UNAVAILABLE');
    return null;
  }

  try {
    const existing = await cache.get('date:' + dateKey);
    if (existing?.id && existing?.text) return existing;

    const rawUsed = await cache.get('used-ids');
    const used = new Set((Array.isArray(rawUsed) ? rawUsed : []).map((id) => String(id || '').trim()).filter(Boolean));
    const fact = chooseUnseenFact(catalog.facts, used, dateKey);
    if (!fact) {
      console.warn('RUDI_MALE_PSYCHOLOGY_BANK_EXHAUSTED', 'used=' + used.size, 'catalog=' + catalog.facts.length);
      return null;
    }

    const record = { ...fact, dateKey, disclaimer: catalog.disclaimer };
    await cache.set('date:' + dateKey, record, {
      ttl: DATE_TTL_SECONDS,
      tags: ['rudi-male-psychology-date'],
      name: 'male-psychology-' + dateKey,
    });
    used.add(fact.id);
    const nextUsed = [...used].slice(-MAX_USED_IDS);
    await cache.set('used-ids', nextUsed, {
      ttl: HISTORY_TTL_SECONDS,
      tags: ['rudi-male-psychology-history'],
      name: 'male-psychology-used-ids',
    });
    const remaining = catalog.facts.length - nextUsed.filter((id) => catalog.facts.some((row) => row.id === id)).length;
    if (remaining <= 10) console.warn('RUDI_MALE_PSYCHOLOGY_BANK_LOW', 'remaining=' + Math.max(0, remaining));
    return record;
  } catch (error) {
    console.warn('RUDI_MALE_PSYCHOLOGY_CACHE_WARN', String(error?.message || error));
    return null;
  }
}

module.exports = {
  CONFIG_URL,
  CACHE_NAMESPACE,
  moscowDateKey,
  normalizeFact,
  normalizeCatalog,
  chooseUnseenFact,
  fallbackFact,
  readDailyMalePsychologyFact,
};

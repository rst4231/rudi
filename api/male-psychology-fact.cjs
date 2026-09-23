const CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json';

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

function normalizeFact(value, fallbackSequence = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 120);
  const title = cleanText(value.title, 180);
  const text = cleanText(value.text, 900);
  const sourceLabel = cleanText(value.sourceLabel || 'PubMed', 160);
  const sourceUrl = cleanText(value.sourceUrl, 500);
  const sequence = Math.max(1, Math.trunc(Number(value.sequence || fallbackSequence || 0)));
  if (!id || !title || !text || !sequence || !/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?$/i.test(sourceUrl)) return null;
  return { id, sequence, title, text, sourceLabel, sourceUrl };
}

function normalizeCatalog(value) {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const section = root.malePsychology && typeof root.malePsychology === 'object' && !Array.isArray(root.malePsychology)
    ? root.malePsychology
    : {};
  const seenIds = new Set();
  const seenSequences = new Set();
  const facts = [];
  (Array.isArray(section.facts) ? section.facts : []).forEach((row,index) => {
    const fact = normalizeFact(row,index+1);
    if (!fact || seenIds.has(fact.id) || seenSequences.has(fact.sequence)) return;
    seenIds.add(fact.id);
    seenSequences.add(fact.sequence);
    facts.push(fact);
  });
  facts.sort((a,b)=>a.sequence-b.sequence);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(section.startDate||''))
    ? String(section.startDate)
    : '2026-09-23';
  return {
    enabled: section.enabled !== false,
    startDate,
    disclaimer: cleanText(
      section.disclaimer || 'Это данные о средних групповых закономерностях. Они не описывают каждого мужчину.',
      320
    ),
    facts,
  };
}

function dayOffset(startDate, dateKey) {
  const start = Date.parse(String(startDate) + 'T00:00:00.000Z');
  const current = Date.parse(String(dateKey) + 'T00:00:00.000Z');
  if (!Number.isFinite(start) || !Number.isFinite(current)) return -1;
  return Math.floor((current-start)/86400000);
}

function factForDate(catalog, dateKey) {
  const normalized = catalog?.facts ? catalog : normalizeCatalog({ malePsychology: catalog });
  if (!normalized?.enabled || !normalized.facts?.length) return null;
  const offset = dayOffset(normalized.startDate,dateKey);
  if (offset < 0) return null;
  const sequence = offset + 1;
  const fact = normalized.facts.find((row)=>row.sequence===sequence) || null;
  if (!fact) return null;
  return { ...fact, dateKey, disclaimer: normalized.disclaimer };
}

async function fetchCatalog(options = {}) {
  if (options.catalog) return normalizeCatalog({ malePsychology: options.catalog });
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
    return normalizeCatalog(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

async function readDailyMalePsychologyFact(options = {}) {
  const dateKey = moscowDateKey(options.now || Date.now());
  let catalog;
  try {
    catalog = await fetchCatalog(options);
  } catch (error) {
    if (options.catalog) throw error;
    console.warn('RUDI_MALE_PSYCHOLOGY_CONFIG_WARN', String(error?.message || error));
    return null;
  }
  const fact = factForDate(catalog,dateKey);
  if (!fact) {
    const offset = dayOffset(catalog.startDate,dateKey);
    if (offset >= catalog.facts.length) {
      console.warn('RUDI_MALE_PSYCHOLOGY_BANK_EXHAUSTED','offset='+offset,'catalog='+catalog.facts.length);
    }
    return null;
  }
  const remaining = catalog.facts.filter((row)=>row.sequence>fact.sequence).length;
  if (remaining <= 10) console.warn('RUDI_MALE_PSYCHOLOGY_BANK_LOW','remaining='+remaining);
  return fact;
}

module.exports = {
  CONFIG_URL,
  moscowDateKey,
  normalizeFact,
  normalizeCatalog,
  dayOffset,
  factForDate,
  readDailyMalePsychologyFact,
};

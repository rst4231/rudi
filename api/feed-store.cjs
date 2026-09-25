const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-feed-v1';
const STATE_KEY = 'current';
const TTL_SECONDS = 60 * 60 * 24 * 365;
const NOTICE_TTL_SECONDS = 60 * 60 * 24 * 14;
const SECTION_TTL_MS = {
  events: 25 * 60 * 60 * 1000,
  cinema: null,
};

function cacheOf(options = {}) {
  return options.feedCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    confirmWrites: false,
    ...(options.cacheOptions || {}),
  });
}

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

function cleanParts(parts) {
  return (Array.isArray(parts) ? parts : [parts])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => value.slice(0, 20000))
    .slice(0, 12);
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .slice(0, 12)
    .map((item) => ({
      title: String(item.title || '').trim().slice(0, 240),
      posterUrl: String(item.posterUrl || '').trim().slice(0, 2000),
      releaseDate: String(item.releaseDate || '').trim().slice(0, 20),
      sources: (Array.isArray(item.sources) ? item.sources : [])
        .map((value) => String(value || '').trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 4),
      sourceUrls: (Array.isArray(item.sourceUrls) ? item.sourceUrls : [])
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          name: String(row.name || '').trim().slice(0, 160),
          url: String(row.url || '').trim().slice(0, 2000),
        }))
        .filter((row) => row.url)
        .slice(0, 4),
      kinopoiskUrl: String(item.kinopoiskUrl || '').trim().slice(0, 2000),
    }))
    .filter((item) => item.title);
}

function normalizeSection(name, input, now = new Date()) {
  if (!input) return null;
  const parts = cleanParts(input.parts);
  const items = cleanItems(input.items);
  if (!parts.length && !items.length) return null;
  const updatedAt = String(input.updatedAt || now.toISOString());
  const updatedMs = new Date(updatedAt).getTime();
  const persistent = name === 'cinema';
  const ttlMs = Number(input.ttlMs || SECTION_TTL_MS[name] || SECTION_TTL_MS.events);
  const expiresAt = persistent
    ? ''
    : String(input.expiresAt || new Date((Number.isFinite(updatedMs) ? updatedMs : now.getTime()) + ttlMs).toISOString());
  return {
    name,
    parts,
    items,
    updatedAt,
    expiresAt,
    source: String(input.source || 'daily').slice(0, 80),
  };
}

function sectionSignature(section) {
  return JSON.stringify({
    parts: section?.parts || [],
    items: section?.items || [],
  });
}

function normalizeSnapshot(value, now = new Date()) {
  const source = value && typeof value === 'object' ? value : {};
  const sections = {};
  for (const name of ['events', 'cinema']) {
    const section = normalizeSection(name, source.sections?.[name], now);
    if (!section) continue;
    const expires = new Date(section.expiresAt).getTime();
    if (Number.isFinite(expires) && expires <= now.getTime()) continue;
    sections[name] = section;
  }
  return {
    version: String(source.version || ''),
    updatedAt: String(source.updatedAt || ''),
    date: String(source.date || ''),
    changedSections: Array.isArray(source.changedSections)
      ? source.changedSections.filter((name) => ['events', 'cinema'].includes(name))
      : [],
    sections,
  };
}

async function readFeedSnapshot(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const cache = cacheOf(options);
  const raw = await cache.get(STATE_KEY);
  const normalized = normalizeSnapshot(raw, now);
  if (!Object.keys(normalized.sections).length) {
    if (raw) await cache.delete(STATE_KEY).catch(() => false);
    return normalized;
  }
  const before = Object.keys(raw?.sections || {}).length;
  if (before !== Object.keys(normalized.sections).length) {
    await cache.set(STATE_KEY, normalized, {
      ttl: TTL_SECONDS,
      tags: ['rudi-feed'],
      name: 'rudi-feed-current',
    });
  }
  return normalized;
}

async function updateFeedSections(input = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const cache = cacheOf(options);
  const current = await readFeedSnapshot({ ...options, now });
  const sections = { ...current.sections };
  const changedSections = [];

  for (const name of ['events', 'cinema']) {
    if (!(name in input)) continue;
    const next = normalizeSection(name, input[name], now);
    if (!next) {
      if (sections[name]) {
        delete sections[name];
        changedSections.push(name);
      }
      continue;
    }
    if (sectionSignature(sections[name]) !== sectionSignature(next)) changedSections.push(name);
    sections[name] = next;
  }

  const date = String(options.date || moscowDateKey(now));
  const pendingChangedSections = changedSections.length
    ? changedSections
    : (current.date === date ? current.changedSections : []);
  const snapshot = {
    version: changedSections.length ? `${now.getTime()}-${changedSections.join('-')}` : (current.version || String(now.getTime())),
    updatedAt: now.toISOString(),
    date,
    changedSections: pendingChangedSections,
    sections,
  };

  if (!Object.keys(sections).length) {
    await cache.delete(STATE_KEY).catch(() => false);
    return snapshot;
  }
  await cache.set(STATE_KEY, snapshot, {
    ttl: TTL_SECONDS,
    tags: ['rudi-feed'],
    name: 'rudi-feed-current',
  });
  return snapshot;
}

function noticeKey(date, version, actor = 'all') {
  return `notice:${String(date || '')}:${String(version || '')}:${String(actor || 'all')}`;
}

async function wasFeedNoticeSent(date, version, actor, options = {}) {
  if (!date || !version) return false;
  return Boolean(await cacheOf(options).get(noticeKey(date, version, actor)));
}

async function markFeedNoticeSent(date, version, actor, options = {}) {
  if (!date || !version) return false;
  await cacheOf(options).set(noticeKey(date, version, actor), true, {
    ttl: NOTICE_TTL_SECONDS,
    tags: ['rudi-feed-notices'],
    name: `rudi-feed-notice-${date}`,
  });
  return true;
}

module.exports = {
  NAMESPACE,
  TTL_SECONDS,
  SECTION_TTL_MS,
  moscowDateKey,
  normalizeSnapshot,
  readFeedSnapshot,
  updateFeedSections,
  wasFeedNoticeSent,
  markFeedNoticeSent,
};

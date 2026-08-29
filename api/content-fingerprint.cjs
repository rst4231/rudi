const crypto = require('node:crypto');
const { getControlPlaneCache } = require('./stateful-cache.cjs');

const TRACKING_PARAMS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^yclid$/i, /^mc_/i];

function normalizeIdentityText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIdentityUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) url.searchParams.delete(key);
    }
    url.hash = '';
    const params = [...url.searchParams.entries()].sort(([a],[b]) => a.localeCompare(b));
    url.search = '';
    for (const [key, val] of params) url.searchParams.append(key, val);
    return url.toString().replace(/\/$/, url.pathname === '/' ? '' : '/');
  } catch { return normalizeIdentityText(value); }
}

function canonical(kind, item = {}) {
  if (kind === 'recipes') return { id: String(item.id || ''), title: normalizeIdentityText(item.title), ingredients: normalizeIdentityText(Array.isArray(item.ingredients) ? item.ingredients.join(' ') : item.ingredients) };
  if (kind === 'clients') return { id: String(item.id || ''), title: normalizeIdentityText(item.title), body: normalizeIdentityText(item.body), action: normalizeIdentityText(item.action) };
  if (kind === 'events') {
    const sourceId = String(item.id || item.sourceId || '').trim();
    return sourceId ? { source: normalizeIdentityText(item.source), sourceId } : { date: String(item.date || ''), title: normalizeIdentityText(item.title), venue: normalizeIdentityText(item.venue), time: normalizeIdentityText(item.time) };
  }
  if (kind === 'cinema') return { title: normalizeIdentityText(item.title), source: normalizeIdentityText(item.source), releaseDate: String(item.releaseDate || item.date || '') };
  if (kind === 'weekend') return { members: [...(item.memberFingerprints || item.members || [])].map(String).sort() };
  throw new Error(`Unsupported fingerprint kind: ${kind}`);
}

function fingerprintContent(kind, item) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(kind, item))).digest('hex');
}

function resolveCache(options = {}) { return options.cache || getControlPlaneCache(options.cacheOptions || {}); }
function historyKey(kind) { return `dedupe:${kind}:history`; }

async function getRecentFingerprints(kind, options = {}) {
  const cache = resolveCache(options);
  const rows = Array.isArray(await cache.get(historyKey(kind))) ? await cache.get(historyKey(kind)) : [];
  const now = Number(options.now instanceof Date ? options.now.getTime() : options.now || Date.now());
  const days = Math.max(1, Number(options.days || 30));
  const cutoff = now - days * 86400000;
  return new Set(rows.filter((row) => Number(new Date(row.publishedAt)) >= cutoff).map((row) => String(row.fingerprint)));
}

async function rememberFingerprints(kind, fingerprints, days, options = {}) {
  const cache = resolveCache(options);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const existing = Array.isArray(await cache.get(historyKey(kind))) ? await cache.get(historyKey(kind)) : [];
  const cutoff = now.getTime() - Math.max(1, Number(days || 30)) * 86400000;
  const map = new Map(existing.filter((row) => Number(new Date(row.publishedAt)) >= cutoff).map((row) => [row.fingerprint, row]));
  for (const fingerprint of fingerprints || []) map.set(String(fingerprint), { fingerprint: String(fingerprint), publishedAt: now.toISOString() });
  await cache.set(historyKey(kind), [...map.values()], { tags: ['rudi-dedupe'], name: historyKey(kind) });
}

async function filterUnseen(kind, items, days, options = {}) {
  const seen = options.seenFingerprints || await getRecentFingerprints(kind, { ...options, days });
  const output = []; let suppressed = 0;
  for (const item of items || []) {
    const fingerprint = fingerprintContent(kind, item);
    if (seen.has(fingerprint)) { suppressed += 1; continue; }
    output.push({ ...item, fingerprint });
  }
  return { items: output, suppressed };
}

module.exports = { normalizeIdentityText, normalizeIdentityUrl, fingerprintContent, getRecentFingerprints, rememberFingerprints, filterUnseen };

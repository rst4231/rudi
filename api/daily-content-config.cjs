const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/daily-content.json';
const DEFAULT_CACHE_MS = 5 * 60 * 1000;
const localConfigPath = path.join(__dirname, '..', 'config', 'daily-content.json');

let memo = null;

function assertHttpUrl(value, label) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error(`${label} must be a valid URL`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} must use http or https`);
}

function validateEntry(entry, expectedType) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Invalid ${expectedType} content entry`);
  if (String(entry.type || '') !== expectedType) throw new Error(`Content entry ${entry.id || '<unknown>'} must have type ${expectedType}`);
  if (!String(entry.id || '').trim()) throw new Error('Content entry is missing id');
  if (!String(entry.body || '').trim()) throw new Error(`Content entry ${entry.id} is missing body`);
  if (expectedType === 'facts' && !String(entry.category || '').trim()) throw new Error(`Fact ${entry.id} is missing category`);
  if (expectedType === 'lulu' && !String(entry.title || '').trim()) throw new Error(`Lulu entry ${entry.id} is missing title`);
  assertHttpUrl(entry.sourceUrl, `sourceUrl for ${entry.id}`);
  return entry;
}

function validatePublishedIds(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new Error('publishedIds must be an array');
  const ids = input.map((value) => String(value || '').trim());
  if (ids.some((id) => !id)) throw new Error('publishedIds cannot contain empty values');
  if (new Set(ids).size !== ids.length) throw new Error('publishedIds cannot contain duplicates');
  return ids;
}

function validateCatalog(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Daily content catalog is invalid');
  const facts = Array.isArray(input.facts) ? input.facts.map((entry) => validateEntry(entry, 'facts')) : [];
  const lulu = Array.isArray(input.lulu) ? input.lulu.map((entry) => validateEntry(entry, 'lulu')) : [];
  const publishedIds = validatePublishedIds(input.publishedIds);
  const seen = new Set();
  for (const entry of [...facts, ...lulu]) {
    const id = String(entry.id).trim();
    if (seen.has(id)) throw new Error(`Duplicate content id: ${id}`);
    seen.add(id);
  }
  if (!facts.length) throw new Error('Daily content catalog has no facts');
  if (!lulu.length) throw new Error('Daily content catalog has no Lulu entries');
  return { version: Number(input.version || 1), publishedIds, facts, lulu };
}

function readBundledConfig() {
  return JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
}

async function loadDailyContentCatalog(options = {}) {
  const configUrl = String(options.configUrl || process.env.DAILY_CONTENT_CONFIG_URL || DEFAULT_CONFIG_URL).trim();
  const cacheMs = Number.isFinite(Number(options.cacheMs)) ? Math.max(0, Number(options.cacheMs)) : DEFAULT_CACHE_MS;
  const now = Number(options.now || Date.now());
  if (memo && cacheMs > 0 && memo.url === configUrl && now - memo.loadedAt < cacheMs) return memo.catalog;

  const localConfig = options.localConfig || readBundledConfig();
  const fallback = validateCatalog(localConfig);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (configUrl && typeof fetchImpl === 'function') {
    try {
      const response = await fetchImpl(configUrl, {
        headers: { 'user-agent': 'RUDI-Daily-Content/1.0' },
        cache: 'no-store',
      });
      if (response?.ok) {
        const remote = validateCatalog(await response.json());
        memo = { url: configUrl, loadedAt: now, catalog: remote };
        return remote;
      }
    } catch (error) {
      console.warn('RUDI_DAILY_CONTENT_CONFIG_ERROR', String(error?.message || error));
    }
  }

  memo = { url: configUrl, loadedAt: now, catalog: fallback };
  return fallback;
}

function resetDailyContentConfigMemo() {
  memo = null;
}

module.exports = {
  DEFAULT_CONFIG_URL,
  validateCatalog,
  loadDailyContentCatalog,
  resetDailyContentConfigMemo,
};

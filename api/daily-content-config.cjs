const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/daily-content.json';
const DEFAULT_SEQUENCE_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/daily-content-sequence.json';
const DEFAULT_CACHE_MS = 5 * 60 * 1000;
const localConfigPath = path.join(__dirname, '..', 'config', 'daily-content.json');
const localSequencePath = path.join(__dirname, '..', 'config', 'daily-content-sequence.json');

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

function validDateKey(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function validateSequence(input, facts, lulu) {
  if (input === undefined || input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('sequence must be an object');
  const startDate = String(input.startDate || '').trim();
  const factsStartId = String(input.factsStartId || '').trim();
  const luluStartId = String(input.luluStartId || '').trim();
  if (!validDateKey(startDate)) throw new Error('sequence.startDate must be YYYY-MM-DD');
  if (!factsStartId || !facts.some((entry) => String(entry.id) === factsStartId)) throw new Error('sequence.factsStartId must reference a facts entry');
  if (!luluStartId || !lulu.some((entry) => String(entry.id) === luluStartId)) throw new Error('sequence.luluStartId must reference a Lulu entry');
  return { startDate, factsStartId, luluStartId };
}

function applySequenceState(baseConfig, state) {
  if (state === undefined || state === null) return baseConfig;
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Daily content sequence state is invalid');
  const retiredIds = validatePublishedIds(state.retiredIds);
  const existingPublished = validatePublishedIds(baseConfig?.publishedIds);
  const publishedIds = [...new Set([...existingPublished, ...retiredIds])];
  const enabled = state.enabled !== false;
  const sequence = enabled ? {
    startDate: String(state.startDate || '').trim(),
    factsStartId: String(state.factsStartId || '').trim(),
    luluStartId: String(state.luluStartId || '').trim(),
  } : null;
  return { ...baseConfig, publishedIds, sequence };
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
  const sequence = validateSequence(input.sequence, facts, lulu);
  return { version: Number(input.version || 1), publishedIds, sequence, facts, lulu };
}

function readBundledConfig() { return JSON.parse(fs.readFileSync(localConfigPath, 'utf8')); }
function readBundledSequenceState() { return JSON.parse(fs.readFileSync(localSequencePath, 'utf8')); }

async function fetchJson(url, fetchImpl, userAgent) {
  if (!url || typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(url, { headers: { 'user-agent': userAgent }, cache: 'no-store' });
    if (response?.ok) return await response.json();
  } catch (error) {
    console.warn('RUDI_DAILY_CONTENT_CONFIG_ERROR', String(error?.message || error));
  }
  return null;
}

async function loadDailyContentCatalog(options = {}) {
  const configUrl = String(options.configUrl || options.settings?.sources?.dailyContentConfigUrl || process.env.DAILY_CONTENT_CONFIG_URL || DEFAULT_CONFIG_URL).trim();
  const sequenceDisabledForTest = options.localSequenceState === null && options.sequenceConfigUrl === undefined && options.settings?.sources?.dailyContentSequenceUrl === undefined;
  const sequenceUrl = sequenceDisabledForTest ? '' : String(options.sequenceConfigUrl || options.settings?.sources?.dailyContentSequenceUrl || process.env.DAILY_CONTENT_SEQUENCE_URL || DEFAULT_SEQUENCE_URL).trim();
  const cacheMs = Number.isFinite(Number(options.cacheMs)) ? Math.max(0, Number(options.cacheMs)) : DEFAULT_CACHE_MS;
  const now = Number(options.now || Date.now());
  if (memo && cacheMs > 0 && memo.configUrl === configUrl && memo.sequenceUrl === sequenceUrl && now - memo.loadedAt < cacheMs) return memo.catalog;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const localConfig = options.localConfig || readBundledConfig();
  const remoteConfig = await fetchJson(configUrl, fetchImpl, 'RUDI-Daily-Content/1.0');
  const baseConfig = remoteConfig || localConfig;
  let sequenceState = options.localSequenceState;
  if (sequenceState === undefined) sequenceState = readBundledSequenceState();
  if (sequenceUrl) {
    const remoteSequence = await fetchJson(sequenceUrl, fetchImpl, 'RUDI-Daily-Content-Sequence/1.0');
    if (remoteSequence) sequenceState = remoteSequence;
  }
  const catalog = validateCatalog(applySequenceState(baseConfig, sequenceState));
  memo = { configUrl, sequenceUrl, loadedAt: now, catalog };
  return catalog;
}

function resetDailyContentConfigMemo() { memo = null; }

module.exports = { DEFAULT_CONFIG_URL, DEFAULT_SEQUENCE_URL, validateCatalog, validateSequence, applySequenceState, loadDailyContentCatalog, resetDailyContentConfigMemo };

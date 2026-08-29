const localDefault = require('../config/rudi-settings.json');
const { getControlPlaneCache } = require('./stateful-cache.cjs');

const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/rudi-settings.json';
const OVERRIDES_KEY = 'settings:overrides';
const TOP_LEVEL_KEYS = new Set(['version', 'timezone', 'sections', 'sources', 'copy', 'publishing', 'dedupe', 'alerts']);
const SECTION_NAMES = ['events', 'holidays', 'facts', 'lulu', 'recipes', 'clients', 'cinema', 'labor', 'weekend'];
const TOPIC_SECTIONS = new Set(['events', 'holidays', 'facts', 'lulu', 'recipes', 'clients']);
const SOURCE_KEYS = ['dailyContentConfigUrl', 'dailyContentSequenceUrl', 'eventsConfigUrl', 'clientsAdviceConfigUrl'];
const DEDUPE_KEYS = ['eventsDays', 'cinemaDays', 'recipesDays', 'clientsDays', 'weekendDays'];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownKeys(object, allowed, label) {
  for (const key of Object.keys(object || {})) {
    if (!allowed.has(key)) throw new Error(`Unknown ${label} key: ${key}`);
  }
}

function assertHttpUrl(value, label) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw new Error(`${label} must be a valid URL`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} must use http or https`);
  return url.toString();
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

function validateRudiSettings(input) {
  if (!isPlainObject(input)) throw new Error('RUDI settings must be an object');
  assertKnownKeys(input, TOP_LEVEL_KEYS, 'top-level');

  const version = positiveInteger(input.version, 'version');
  const timezone = String(input.timezone || '').trim();
  if (timezone !== 'Europe/Moscow') throw new Error('timezone must be Europe/Moscow');

  if (!isPlainObject(input.sections)) throw new Error('sections must be an object');
  assertKnownKeys(input.sections, new Set(SECTION_NAMES), 'sections');
  const sections = {};
  for (const section of SECTION_NAMES) {
    const row = input.sections[section];
    if (!isPlainObject(row)) throw new Error(`sections.${section} must be an object`);
    assertKnownKeys(row, new Set(TOPIC_SECTIONS.has(section) ? ['enabled', 'topicId'] : ['enabled']), `sections.${section}`);
    if (typeof row.enabled !== 'boolean') throw new Error(`sections.${section}.enabled must be boolean`);
    sections[section] = { enabled: row.enabled };
    if (TOPIC_SECTIONS.has(section)) sections[section].topicId = positiveInteger(row.topicId, `sections.${section}.topicId`);
  }

  if (!isPlainObject(input.sources)) throw new Error('sources must be an object');
  assertKnownKeys(input.sources, new Set(SOURCE_KEYS), 'sources');
  const sources = {};
  for (const key of SOURCE_KEYS) sources[key] = assertHttpUrl(input.sources[key], key);

  if (!isPlainObject(input.copy) || !isPlainObject(input.copy.footers)) throw new Error('copy.footers must be an object');
  assertKnownKeys(input.copy, new Set(['footers']), 'copy');
  assertKnownKeys(input.copy.footers, new Set(SECTION_NAMES), 'copy.footers');
  const footers = {};
  for (const section of SECTION_NAMES) {
    const footer = String(input.copy.footers[section] ?? '').trim();
    if (footer.length > 800) throw new Error(`copy.footers.${section} exceeds 800 characters`);
    footers[section] = footer;
  }

  if (!isPlainObject(input.publishing)) throw new Error('publishing must be an object');
  assertKnownKeys(input.publishing, new Set(['dailyCronDescription', 'weekendDays', 'allowAutomaticRetry']), 'publishing');
  const dailyCronDescription = String(input.publishing.dailyCronDescription || '').trim();
  if (!dailyCronDescription) throw new Error('publishing.dailyCronDescription is required');
  if (!Array.isArray(input.publishing.weekendDays) || !input.publishing.weekendDays.length) {
    throw new Error('publishing.weekendDays must be a non-empty array');
  }
  const weekendDays = [...new Set(input.publishing.weekendDays.map(Number))];
  if (weekendDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('publishing.weekendDays values must be integers from 0 to 6');
  }
  if (typeof input.publishing.allowAutomaticRetry !== 'boolean') {
    throw new Error('publishing.allowAutomaticRetry must be boolean');
  }

  if (!isPlainObject(input.dedupe)) throw new Error('dedupe must be an object');
  assertKnownKeys(input.dedupe, new Set(DEDUPE_KEYS), 'dedupe');
  const dedupe = {};
  for (const key of DEDUPE_KEYS) dedupe[key] = positiveInteger(input.dedupe[key], `dedupe.${key}`);

  if (!isPlainObject(input.alerts)) throw new Error('alerts must be an object');
  assertKnownKeys(input.alerts, new Set(['enabled', 'dedupeMinutes']), 'alerts');
  if (typeof input.alerts.enabled !== 'boolean') throw new Error('alerts.enabled must be boolean');
  const dedupeMinutes = positiveInteger(input.alerts.dedupeMinutes, 'alerts.dedupeMinutes');

  return {
    version,
    timezone,
    sections,
    sources,
    copy: { footers },
    publishing: {
      dailyCronDescription,
      weekendDays,
      allowAutomaticRetry: input.publishing.allowAutomaticRetry,
    },
    dedupe,
    alerts: { enabled: input.alerts.enabled, dedupeMinutes },
  };
}

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return clone(base);
  const result = clone(base);
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(result?.[key])) result[key] = deepMerge(result[key], value);
    else result[key] = clone(value);
  }
  return result;
}

function pruneEmptyObjects(value) {
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    const pruned = pruneEmptyObjects(child);
    if (isPlainObject(pruned) && Object.keys(pruned).length === 0) continue;
    result[key] = pruned;
  }
  return result;
}

function deletePath(object, pathText) {
  const path = String(pathText || '').split('.').map((part) => part.trim()).filter(Boolean);
  if (!path.length) return {};
  const result = clone(object || {});
  let cursor = result;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!isPlainObject(cursor[path[index]])) return pruneEmptyObjects(result);
    cursor = cursor[path[index]];
  }
  delete cursor[path[path.length - 1]];
  return pruneEmptyObjects(result);
}

async function loadRemoteSettings(options, fallback) {
  const fetchImpl = options.fetchImpl === undefined ? globalThis.fetch : options.fetchImpl;
  if (typeof fetchImpl !== 'function') return { value: fallback, source: 'bundled' };
  const url = String(options.configUrl || process.env.RUDI_SETTINGS_CONFIG_URL || DEFAULT_CONFIG_URL).trim();
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'RUDI-Settings/1.0', accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response?.ok) return { value: fallback, source: 'bundled' };
    return { value: validateRudiSettings(await response.json()), source: 'remote' };
  } catch {
    return { value: fallback, source: 'bundled' };
  }
}

function resolveCache(options = {}) {
  return options.cache || getControlPlaneCache(options.cacheOptions || {});
}

async function loadRudiSettings(options = {}) {
  const localConfig = validateRudiSettings(options.localConfig || localDefault);
  const remote = await loadRemoteSettings(options, localConfig);
  const cache = resolveCache(options);
  const rawOverrides = await cache.get(OVERRIDES_KEY);
  const overrides = isPlainObject(rawOverrides) ? clone(rawOverrides) : {};
  const settings = validateRudiSettings(deepMerge(remote.value, overrides));
  return { settings, source: remote.source, overrides };
}

async function setRudiSettingsOverride(patch, options = {}) {
  if (!isPlainObject(patch)) throw new Error('Settings override patch must be an object');
  const cache = resolveCache(options);
  const current = await cache.get(OVERRIDES_KEY);
  const next = deepMerge(isPlainObject(current) ? current : {}, patch);
  const base = validateRudiSettings(options.localConfig || localDefault);
  validateRudiSettings(deepMerge(base, next));
  await cache.set(OVERRIDES_KEY, next, { tags: ['rudi-settings'], name: OVERRIDES_KEY });
  return clone(next);
}

async function resetRudiSettingsOverride(pathText, options = {}) {
  const cache = resolveCache(options);
  const current = await cache.get(OVERRIDES_KEY);
  const next = deletePath(isPlainObject(current) ? current : {}, pathText);
  if (Object.keys(next).length) await cache.set(OVERRIDES_KEY, next, { tags: ['rudi-settings'], name: OVERRIDES_KEY });
  else await cache.delete(OVERRIDES_KEY);
  return clone(next);
}

module.exports = {
  DEFAULT_CONFIG_URL,
  OVERRIDES_KEY,
  SECTION_NAMES,
  validateRudiSettings,
  loadRudiSettings,
  setRudiSettingsOverride,
  resetRudiSettingsOverride,
  deepMerge,
  deletePath,
};

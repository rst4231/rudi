const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/forum-topics.json';
const DEFAULT_CACHE_MS = 5 * 60 * 1000;
const localConfigPath = path.join(__dirname, '..', 'config', 'forum-topics.json');

let memo = null;

function validTopicId(value, label) {
  const topicId = Number(value);
  if (!Number.isInteger(topicId) || topicId <= 0) throw new Error(`${label} must be a positive integer`);
  return topicId;
}

function validTopicName(value, label) {
  if (value === undefined || value === null) return null;
  const name = String(value).trim();
  if (!name || name.length > 128) throw new Error(`${label} is invalid`);
  return name;
}

function validateForumTopicsConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Forum topics config is invalid');
  const clients = validTopicId(input.clients, 'clients topic');
  const labor = validTopicId(input.labor, 'labor topic');
  if (labor === clients) throw new Error('Labor topic must differ from Clients topic');

  const names = {};
  const clientsName = validTopicName(input.names?.clients, 'clients topic name');
  const laborName = validTopicName(input.names?.labor, 'labor topic name');
  if (clientsName) names.clients = clientsName;
  if (laborName) names.labor = laborName;

  return {
    version: Number(input.version || 1),
    clients,
    labor,
    ...(Object.keys(names).length ? { names } : {}),
  };
}

function readBundledConfig() {
  return JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
}

async function loadForumTopicsConfig(options = {}) {
  const configUrl = String(options.configUrl || process.env.FORUM_TOPICS_CONFIG_URL || DEFAULT_CONFIG_URL).trim();
  const cacheMs = Number.isFinite(Number(options.cacheMs)) ? Math.max(0, Number(options.cacheMs)) : DEFAULT_CACHE_MS;
  const now = Number(options.now || Date.now());
  if (memo && cacheMs > 0 && memo.url === configUrl && now - memo.loadedAt < cacheMs) return memo.config;

  const fallback = validateForumTopicsConfig(options.localConfig || readBundledConfig());
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (configUrl && typeof fetchImpl === 'function') {
    try {
      const response = await fetchImpl(configUrl, {
        headers: { 'user-agent': 'RUDI-Forum-Topics/1.0' },
        cache: 'no-store',
      });
      if (response?.ok) {
        const remote = validateForumTopicsConfig(await response.json());
        memo = { url: configUrl, loadedAt: now, config: remote };
        return remote;
      }
    } catch (error) {
      console.warn('RUDI_FORUM_TOPICS_CONFIG_ERROR', String(error?.message || error));
    }
  }

  memo = { url: configUrl, loadedAt: now, config: fallback };
  return fallback;
}

function resetForumTopicsConfigMemo() {
  memo = null;
}

module.exports = {
  DEFAULT_CONFIG_URL,
  validateForumTopicsConfig,
  loadForumTopicsConfig,
  resetForumTopicsConfigMemo,
};

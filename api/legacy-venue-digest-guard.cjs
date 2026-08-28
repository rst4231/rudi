const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/events.json';
const DEFAULT_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_TITLE_TOKENS = ['севкабель порт + брусницын', 'севкабель порт', 'брусницын'];
const localConfigPath = path.join(__dirname, '..', 'config', 'events.json');

let memo = null;

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/ё/giu, 'е')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function firstMeaningfulLine(text) {
  return String(text || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => normalizeText(line))
    .find(Boolean) || '';
}

function looksLikeLegacyVenueDigestHeading(heading) {
  const value = normalizeText(heading);
  return /севкабель|sevkabel|sevcable|брусницын|brusnitsyn/u.test(value);
}

function normalizeLegacyVenueDigest(input = {}) {
  const legacy = input?.legacyVenueDigest || {};
  const rawTokens = Array.isArray(legacy.titleTokens) && legacy.titleTokens.length
    ? legacy.titleTokens
    : DEFAULT_TITLE_TOKENS;
  return {
    enabled: legacy.enabled !== false,
    titleTokens: [...new Set(rawTokens.map(normalizeText).filter(Boolean))],
  };
}

function readBundledConfig() {
  try { return JSON.parse(fs.readFileSync(localConfigPath, 'utf8')); }
  catch { return {}; }
}

async function loadLegacyVenueDigestConfig(options = {}) {
  const configUrl = String(options.configUrl ?? process.env.EVENTS_CONFIG_URL ?? DEFAULT_CONFIG_URL).trim();
  const cacheMs = Number.isFinite(Number(options.cacheMs)) ? Math.max(0, Number(options.cacheMs)) : DEFAULT_CACHE_MS;
  const now = Number(options.now || Date.now());
  if (memo && cacheMs > 0 && memo.url === configUrl && now - memo.loadedAt < cacheMs) return memo.config;

  const fallback = normalizeLegacyVenueDigest(options.localConfig || readBundledConfig());
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (configUrl && typeof fetchImpl === 'function') {
    try {
      const response = await fetchImpl(configUrl, {
        headers: { 'user-agent': 'RUDI-Legacy-Venue-Config/1.0' },
        cache: 'no-store',
      });
      if (response?.ok) {
        const config = normalizeLegacyVenueDigest(await response.json());
        memo = { url: configUrl, loadedAt: now, config };
        return config;
      }
    } catch (error) {
      console.warn('RUDI_LEGACY_VENUE_CONFIG_ERROR', String(error?.message || error));
    }
  }

  memo = { url: configUrl, loadedAt: now, config: fallback };
  return fallback;
}

function telegramText(init = {}) {
  if (typeof init.body === 'string') {
    try { return String(JSON.parse(init.body)?.text || ''); }
    catch { return ''; }
  }
  if (init.body instanceof URLSearchParams) return String(init.body.get('text') || '');
  return '';
}

function shouldSuppressLegacyVenueDigest(text, config = {}) {
  if (config?.enabled !== false) return false;
  const heading = firstMeaningfulLine(text);
  if (!heading) return false;
  const tokens = Array.isArray(config.titleTokens) && config.titleTokens.length
    ? config.titleTokens.map(normalizeText).filter(Boolean)
    : DEFAULT_TITLE_TOKENS.map(normalizeText);
  return tokens.some((token) => heading.includes(token));
}

function isTelegramSendMessageUrl(input) {
  const value = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  return /https:\/\/api\.telegram\.org\/bot[^/]+\/sendMessage(?:\?|$)/u.test(value);
}

function syntheticTelegramSuccess() {
  return new Response(JSON.stringify({
    ok: true,
    result: {
      message_id: 0,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 0, type: 'supergroup' },
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function maybeSuppressLegacyVenueDigest(input, init = {}, options = {}) {
  if (!isTelegramSendMessageUrl(input)) return null;
  const text = telegramText(init);
  if (!text) return null;
  const heading = firstMeaningfulLine(text);
  if (!looksLikeLegacyVenueDigestHeading(heading)) return null;
  const config = await loadLegacyVenueDigestConfig(options);
  if (!shouldSuppressLegacyVenueDigest(text, config)) return null;
  console.warn('RUDI_LEGACY_VENUE_DIGEST_SUPPRESSED', heading);
  return syntheticTelegramSuccess();
}

function resetLegacyVenueDigestMemo() { memo = null; }

module.exports = {
  DEFAULT_CONFIG_URL,
  DEFAULT_TITLE_TOKENS,
  normalizeText,
  firstMeaningfulLine,
  looksLikeLegacyVenueDigestHeading,
  normalizeLegacyVenueDigest,
  loadLegacyVenueDigestConfig,
  telegramText,
  shouldSuppressLegacyVenueDigest,
  syntheticTelegramSuccess,
  maybeSuppressLegacyVenueDigest,
  resetLegacyVenueDigestMemo,
};

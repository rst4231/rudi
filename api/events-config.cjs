const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/events.json';
const DEFAULT_CACHE_MS = 5 * 60 * 1000;
const localConfigPath = path.join(__dirname, '..', 'config', 'events.json');

let memo = null;

function assertHttpUrl(value, label) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error(`${label} must be a valid URL`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} must use http or https`);
  return url.toString();
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/ё/gu, 'е');
}

function findCinemaSource(cinemaInput, type, fallbackName, fallbackUrl) {
  const sources = Array.isArray(cinemaInput.sources) ? cinemaInput.sources : [];
  const source = sources.find((item) => item?.enabled !== false && String(item?.type || '').toLowerCase() === type)
    || cinemaInput[type]
    || {};
  return {
    name: String(source.name || fallbackName).trim(),
    url: assertHttpUrl(source.url || fallbackUrl, `cinema.${type}.url`),
  };
}

function collectInitialSeenTitles(cinemaInput) {
  const titles = [];
  const manualByDate = cinemaInput.manualByDate && typeof cinemaInput.manualByDate === 'object'
    ? cinemaInput.manualByDate
    : {};
  for (const rows of Object.values(manualByDate)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const title = String(row?.title || '').trim();
      if (title) titles.push(title);
    }
  }
  if (Array.isArray(cinemaInput.initialSeenTitles)) titles.push(...cinemaInput.initialSeenTitles);
  return [...new Set(titles.map((title) => String(title).trim()).filter(Boolean))];
}

function validateEventsConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Events config is invalid');
  const venueInput = Array.isArray(input.blockedVenueTokens)
    ? input.blockedVenueTokens
    : (Array.isArray(input.venueBlocklist) ? input.venueBlocklist : []);
  const blockedVenueTokens = [...new Set(venueInput.map(normalizeToken).filter(Boolean))];

  const cinemaInput = input.cinemaPremieres || input.cinema || {};
  const cinemaPremieres = {
    enabled: cinemaInput.enabled !== false,
    topicId: Number.isInteger(Number(cinemaInput.topicId)) ? Number(cinemaInput.topicId) : 19,
    maxItems: Math.max(1, Math.min(20, Number(cinemaInput.maxItems || 12))),
    kinopolis: findCinemaSource(
      cinemaInput,
      'kinopolis',
      'Кинополис Мурино',
      'https://sky.kinopolis-film.ru/',
    ),
    mirage: findCinemaSource(
      cinemaInput,
      'mirage',
      'Мираж Синема',
      'https://www.mirage.ru/spb/films/soon/',
    ),
    initialSeenTitles: collectInitialSeenTitles(cinemaInput),
  };
  if (!blockedVenueTokens.length) throw new Error('Events config must contain a venue blocklist');
  return { version: Number(input.version || 1), blockedVenueTokens, cinemaPremieres };
}

function readBundledConfig() {
  return JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
}

async function loadEventsConfig(options = {}) {
  const configUrl = String(options.configUrl || process.env.EVENTS_CONFIG_URL || DEFAULT_CONFIG_URL).trim();
  const cacheMs = Number.isFinite(Number(options.cacheMs)) ? Math.max(0, Number(options.cacheMs)) : DEFAULT_CACHE_MS;
  const now = Number(options.now || Date.now());
  if (memo && cacheMs > 0 && memo.url === configUrl && now - memo.loadedAt < cacheMs) return memo.config;

  const fallback = validateEventsConfig(options.localConfig || readBundledConfig());
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (configUrl && typeof fetchImpl === 'function') {
    try {
      const response = await fetchImpl(configUrl, {
        headers: { 'user-agent': 'RUDI-Events-Config/1.0' },
        cache: 'no-store',
      });
      if (response?.ok) {
        const config = validateEventsConfig(await response.json());
        memo = { url: configUrl, loadedAt: now, config };
        return config;
      }
    } catch (error) {
      console.warn('RUDI_EVENTS_CONFIG_ERROR', String(error?.message || error));
    }
  }
  memo = { url: configUrl, loadedAt: now, config: fallback };
  return fallback;
}

function resetEventsConfigMemo() { memo = null; }

module.exports = {
  DEFAULT_CONFIG_URL,
  normalizeToken,
  validateEventsConfig,
  loadEventsConfig,
  resetEventsConfigMemo,
};

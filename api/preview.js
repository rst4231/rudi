const {
  loadClientsAdviceConfig,
  selectUnseenAdviceForDate,
  formatClientsAdvice,
  rewriteClientsPreviewPayloadWithAdvice,
} = require('./clients-advice.cjs');
const { resolvePreviewDate } = require('./preview-date.cjs');
const { normalizePreviewSections, applyPreviewContentOverride } = require('./preview-sections.cjs');
const { getContentOverride } = require('./section-controls.cjs');
const { SECTION_NAMES } = require('./rudi-settings.cjs');
const { DEFAULT_MAX_ITEMS, rankHolidayEntries } = require('./holiday-significance.cjs');
const { writeHolidayHighlights } = require('./holiday-highlights-store.cjs');
const { stripStagePriceLines } = require('./event-text-sanitizer.cjs');

function sanitizeStagePrices(value) {
  if (typeof value === 'string') return stripStagePriceLines(value);
  if (Array.isArray(value)) return value.map(sanitizeStagePrices);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeStagePrices(item)]));
  }
  return value;
}

function extractHolidayEntries(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.match(/^\s*[•●▪◦‣·*\-–—]\s+(.+)$/u)?.[1] || '')
    .map((line) => line.replace(/<[^>]*>/gu, '').replace(/&amp;/giu, '&').replace(/&quot;/giu, '"').replace(/&nbsp;/giu, ' ').trim())
    .filter(Boolean);
}

async function loadPreviewOverrides(date, options = {}) {
  const rows = await Promise.all(SECTION_NAMES.map(async (section) => [
    section,
    await getContentOverride(date, section, { cache: options.controlCache }),
  ]));
  return Object.fromEntries(rows);
}

async function runPreview(req, res, options = {}) {
  const handler = options.handler || require('./index.js');
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const requestedDate = resolvePreviewDate(req?.query?.date || 'today', now);
  const config = await loadClientsAdviceConfig({
    fetchImpl: options.fetchImpl || globalThis.fetch,
    configUrl: options.configUrl,
    settings: options.settings,
    localConfig: options.localConfig,
  });
  const selection = await selectUnseenAdviceForDate(config, now, {
    cache: options.controlCache,
    days: options.settings?.dedupe?.clientsDays || 45,
    now,
    seenFingerprints: options.clientsSeenFingerprints,
  });
  const advice = formatClientsAdvice(selection.item);
  const overrides = options.overrides || await loadPreviewOverrides(requestedDate, options);

  const originalJson = typeof res?.json === 'function' ? res.json.bind(res) : null;
  if (originalJson) {
    res.json = (payload) => {
      const rewritten = sanitizeStagePrices(rewriteClientsPreviewPayloadWithAdvice(payload, advice));
      const warnings = Array.isArray(rewritten?.warnings) ? [...rewritten.warnings] : [];
      if (rewritten?.date && rewritten.date !== requestedDate) {
        warnings.push({ code: 'runtime-date-mismatch', expected: requestedDate, actual: rewritten.date });
      }
      const rawSections = normalizePreviewSections(rewritten);
      const sections = {};
      for (const section of SECTION_NAMES) {
        sections[section] = applyPreviewContentOverride(rawSections[section], overrides[section]);
      }
      const holidayEntries = extractHolidayEntries(
        rewritten?.results?.holidays?.preview?.message || sections?.holidays?.parts?.[0] || ''
      );
      const holidayHighlights = rankHolidayEntries(holidayEntries, DEFAULT_MAX_ITEMS);
      if (rewritten?.date && holidayHighlights.length) {
        writeHolidayHighlights(rewritten.date, holidayHighlights, options).catch((error) => {
          console.warn('RUDI_HOLIDAY_HIGHLIGHTS_CACHE_ERROR', String(error?.message || error));
        });
      }

      return originalJson({
        ...rewritten,
        requestedDate,
        generatedAt: now.toISOString(),
        warnings,
        sections,
        holidayHighlights,
      });
    };
  }
  req.query = { ...(req.query || {}), route: 'preview', date: requestedDate };
  try {
    return await handler(req, res);
  } finally {
    if (originalJson) res.json = originalJson;
  }
}

module.exports = (req, res) => runPreview(req, res);
module.exports.runPreview = runPreview;
module.exports.loadPreviewOverrides = loadPreviewOverrides;
module.exports.extractHolidayEntries = extractHolidayEntries;
module.exports.sanitizeStagePrices = sanitizeStagePrices;
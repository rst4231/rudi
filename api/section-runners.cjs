const {
  getPublicationRecord,
  markPublicationPending,
  markPublicationPublished,
  markPublicationFailed,
} = require('./publication-journal.cjs');
const { emitOperationalAlert } = require('./alert-service.cjs');
const { incrementSectionMetric } = require('./feedback-analytics.cjs');

function getNativeSectionRunner(section, deps = {}) {
  if (section === 'labor') return deps.labor || (async () => require('./index.js').publishDailyLaborArticle());
  if (section === 'cinema') return deps.cinema || (async (options) => require('./cinema-premieres-collage.cjs').publishWeeklyCinemaPremieres(options));
  if (section === 'weekend') return deps.weekend || (async (options) => require('./weekend-digest.cjs').publishWeekendDigest(options));
  return null;
}

async function metric(section, name, amount, options) {
  try {
    const increment = options.incrementMetric || incrementSectionMetric;
    await increment(section, name, amount, {
      cache: options.analyticsCache || options.controlCache,
      now: options.now,
    });
  } catch (error) {
    console.warn('RUDI_ANALYTICS_METRIC_ERROR', section, name, String(error?.message || error));
  }
}

async function runNativeSection(section, options = {}) {
  const date = options.date || options.dateKey;
  if (!date) throw new Error('native section date required');

  const getRecord = options.getRecord || ((d, s) => getPublicationRecord(d, s, { cache: options.journalCache }));
  const record = await getRecord(date, section);
  if (record?.status === 'published' && !options.force) return { skipped: 'already-published', date, section };
  if (options.retryFailedOnly && record?.status !== 'failed') return { skipped: 'not-failed', date, section };

  const runner = options.runner || getNativeSectionRunner(section, options.deps || {});
  if (!runner) throw new Error(`No native runner for ${section}`);

  const pending = options.markPending || ((input) => markPublicationPending(input, { cache: options.journalCache, now: options.now }));
  const failed = options.markFailed || ((input) => markPublicationFailed(input, { cache: options.journalCache, now: options.now }));
  const published = options.markPublished || ((input) => markPublicationPublished(input, { cache: options.journalCache, now: options.now }));
  const alert = options.alert || ((input) => emitOperationalAlert(input, {
    cache: options.alertCache,
    fetchImpl: options.fetchImpl,
    env: options.env,
    dedupeMinutes: options.alertDedupeMinutes,
  }));
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 2));
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await pending({ date, section });
    try {
      const result = await runner({
        ...options,
        dateKey: date,
        manageJournal: false,
      });
      if (result?.skipped) return { section, date, ...result };
      const messageIds = Array.isArray(result?.messageIds)
        ? result.messageIds
        : (result?.messageId ? [result.messageId] : []);
      await published({
        date,
        section,
        messageIds,
        sourceIds: result?.sourceIds || [],
        fingerprints: result?.fingerprints || [],
        metadata: { nativeResult: result },
      });
      await metric(section, 'publications', 1, options);
      await metric(section, 'successfulPublications', 1, options);
      return { section, date, ...result };
    } catch (error) {
      lastError = error;
      await failed({ date, section, error });
      if (attempt < maxAttempts) continue;
    }
  }

  await metric(section, 'failures', 1, options);
  await alert({ code: `${section}-failed`, section, message: String(lastError?.message || lastError) });
  throw lastError;
}

module.exports = { getNativeSectionRunner, runNativeSection };
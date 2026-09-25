const { prepareDailyTopicCleanup } = require('./topic-maintenance.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { markProductsRuntimeStale } = require('./products-state.cjs');
const { runNativeSection } = require('./section-runners.cjs');
const { loadRudiSettings } = require('./rudi-settings.cjs');
const { markPublicationPublished, markPublicationSkipped, writeDailyRunSummary } = require('./publication-journal.cjs');
const { emitOperationalAlert } = require('./alert-service.cjs');
const { incrementSectionMetric } = require('./feedback-analytics.cjs');
const { moscowDateKey } = require('./preview-date.cjs');
const { rankHolidayEntries, DEFAULT_MAX_ITEMS } = require('./holiday-significance.cjs');
const { writeHolidayHighlights } = require('./holiday-highlights-store.cjs');
const { updateFeedSections } = require('./feed-store.cjs');
const { publishForDiToRudi, hasQueuedForDiSource } = require('./for-di-private.cjs');

function feedSectionsFromRun(payload = {}, nativeResults = {}, now = new Date()) {
  const results = payload?.results || {};
  const sections = {};
  const fact = String(results.facts?.preview?.message || '').trim();
  if (fact) {
    sections.facts = { parts: [fact], source: 'daily-facts' };
  }

  const events = [
    results.events?.preview?.concerts,
    results.events?.preview?.stage,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  if (events.length) {
    sections.events = { parts: events, source: 'daily-events' };
  }

  const cinema = nativeResults?.cinema;
  if (cinema && !cinema.failed && !['not-thursday', 'already-published'].includes(String(cinema.skipped || ''))) {
    const feedMessage = String(cinema.feedMessage || '').trim();
    const titles = Array.isArray(cinema.titles) ? cinema.titles.map((value) => String(value || '').trim()).filter(Boolean) : [];
    const feedItems = Array.isArray(cinema.feedItems) ? cinema.feedItems : [];
    if (feedMessage) {
      sections.cinema = { parts: [feedMessage], items: feedItems, source: 'weekly-cinema' };
    } else if (titles.length) {
      const message = ['🎬 <b>Кинопремьеры</b>', '', ...titles.map((title) => '• ' + title)].join('\n');
      sections.cinema = { parts: [message], items: feedItems, source: 'weekly-cinema' };
    } else if (Number(cinema.published || 0) === 0 && !cinema.skipped) {
      sections.cinema = {
        parts: ['🎬 <b>Кинопремьеры</b>\n\nНа этой неделе новых кинопремьер не найдено.'],
        source: 'weekly-cinema',
      };
    }
  }

  return sections;
}

async function updateFeedFromRun(payload, nativeResults, date, options = {}) {
  const sections = feedSectionsFromRun(payload, nativeResults, options.now || new Date());
  if (!Object.keys(sections).length) return null;
  const updater = options.updateFeed || updateFeedSections;
  return updater(sections, {
    ...options,
    date,
    now: options.now || new Date(),
  });
}

async function metric(section, name, amount, options = {}) {
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

async function recordGeneratedPayload(payload, date, options = {}) {
  const results = payload?.results || {};
  try {
    const holidayMessage = String(results.holidays?.preview?.message || '');
    const holidayEntries = holidayMessage.split('\n')
      .map((line) => line.match(/^\s*[•●▪◦‣·*\-–—]\s+(.+)$/u)?.[1] || '')
      .map((line) => line.replace(/<[^>]*>/gu, '').trim())
      .filter(Boolean);
    const highlights = rankHolidayEntries(holidayEntries, DEFAULT_MAX_ITEMS);
    if (highlights.length) await writeHolidayHighlights(date, highlights, options);
  } catch (error) {
    console.warn('RUDI_HOLIDAY_HIGHLIGHTS_CACHE_ERROR', String(error?.message || error));
  }
  const rows = [
    ['events', results.events],
    ['holidays', results.holidays],
    ['facts', results.facts],
    ['clients', results.clients],
  ];
  for (const [section, value] of rows) {
    if (!value) continue;
    const skipReason = value.skipped || (value.sent === false ? 'not-sent' : null);
    if (skipReason) {
      await markPublicationSkipped({ date, section, reason: String(skipReason) }, { cache: options.journalCache, now: options.now });
      continue;
    }
    await markPublicationPublished({
      date,
      section,
      sourceIds: [section === 'events' ? 'events-runtime' : 'generated-runtime'],
      metadata: { runtime: true },
    }, { cache: options.journalCache, now: options.now });
    await metric(section, 'publications', 1, options);
    await metric(section, 'successfulPublications', 1, options);
  }
}

async function runDailyOrchestrator(req, res, options = {}) {
  const date = options.date || moscowDateKey(options.now || new Date());
  const loaded = options.settings
    ? { settings: options.settings }
    : await (options.settingsLoader || loadRudiSettings)(options.settingsOptions || {});
  const settings = loaded.settings;
  const failures = [];
  const nativeResults = {};

  try {
    await (options.cleanup || prepareDailyTopicCleanup)({
      token: options.token || resolveTelegramBotToken(options.env || process.env),
      fetchImpl: options.fetchImpl || globalThis.fetch,
      settings,
    });
  } catch (error) {
    failures.push({ section: 'cleanup', error: String(error?.message || error) });
  }

  for (const section of ['labor', 'cinema']) {
    if (settings.sections?.[section]?.enabled === false) continue;
    try {
      nativeResults[section] = await (options.runNative || ((name, runOptions) => runNativeSection(name, runOptions)))(section, {
        ...options,
        date,
        settings,
      });
    } catch (error) {
      nativeResults[section] = { failed: true, error: String(error?.message || error) };
      failures.push({ section, error: String(error?.message || error) });
    }
  }

  let cinemaFeedUpdated = false;
  if (nativeResults.cinema && !nativeResults.cinema.failed) {
    try {
      cinemaFeedUpdated = Boolean(await updateFeedFromRun({}, { cinema: nativeResults.cinema }, date, options));
    } catch (error) {
      failures.push({ section: 'feed-cinema', error: String(error?.message || error) });
    }
  }

  let captured = null;
  let runtimeError = null;
  const originalJson = typeof res?.json === 'function' ? res.json.bind(res) : null;
  if (originalJson) res.json = (payload) => { captured = payload; return originalJson(payload); };
  const previousSettings = req.rudiSettings;
  req.rudiSettings = settings;
  let runtimeReturn;
  try {
    runtimeReturn = await (options.runRuntime || require('./index.js').runRuntime)(req, res);
  } catch (error) {
    runtimeError = error;
    failures.push({ section: 'generated-runtime', error: String(error?.message || error) });
  } finally {
    if (previousSettings === undefined) delete req.rudiSettings;
    else req.rudiSettings = previousSettings;
    if (originalJson) res.json = originalJson;
    markProductsRuntimeStale();
  }

  const payload = captured || runtimeReturn || {};
  if (!runtimeError) {
    try {
      await (options.recordGenerated || recordGeneratedPayload)(payload, date, options);
    } catch (error) {
      failures.push({ section: 'journal', error: String(error?.message || error) });
    }

    try {
      await updateFeedFromRun(
        payload,
        cinemaFeedUpdated ? { ...nativeResults, cinema: null } : nativeResults,
        date,
        options
      );
    } catch (error) {
      failures.push({ section: 'feed', error: String(error?.message || error) });
    }
  }

  if (settings?.sections?.labor?.enabled) {
    try {
      const hasLaborQueued = await (options.hasForDiSource || hasQueuedForDiSource)('labor', {
        now: options.now || new Date(),
        cacheOptions: options.cacheOptions,
      });
      if (!hasLaborQueued) {
        const recoverLabor = options.recoverLabor || ((recoveryOptions) => require('./index.js').publishDailyLaborArticle(recoveryOptions));
        nativeResults.laborRecovery = await recoverLabor({ force: true, queueOnly: true, now: options.now || new Date() });
      }
    } catch (error) {
      nativeResults.laborRecovery = { failed: true, error: String(error?.message || error) };
      failures.push({ section: 'labor-recovery', error: String(error?.message || error) });
    }
  }

  try {
    nativeResults.forDi = await (options.publishForDi || publishForDiToRudi)({
      now: options.now || new Date(),
      cacheOptions: options.cacheOptions,
    });
  } catch (error) {
    nativeResults.forDi = { failed: true, error: String(error?.message || error) };
    failures.push({ section: 'for-di', error: String(error?.message || error) });
  }

  const summary = {
    date,
    sections: {
      ...Object.fromEntries(Object.entries(nativeResults).map(([key, value]) => [
        key,
        value?.failed ? 'failed' : value?.skipped ? 'skipped' : 'published',
      ])),
      ...(runtimeError ? { generatedRuntime: 'failed' } : {}),
    },
    failures: failures.length,
  };
  await (options.writeSummary || writeDailyRunSummary)(date, summary, { cache: options.journalCache, now: options.now });
  if (failures.length) {
    try {
      await (options.alert || emitOperationalAlert)({
        code: 'daily-partial-failure',
        section: 'daily',
        message: failures.map((failure) => failure.section).join(', '),
      }, { cache: options.alertCache, fetchImpl: options.fetchImpl, env: options.env });
    } catch {}
  }
  if (runtimeError) throw runtimeError;
  return { runtime: payload, native: nativeResults, failures };
}

module.exports = { feedSectionsFromRun, updateFeedFromRun, recordGeneratedPayload, runDailyOrchestrator };

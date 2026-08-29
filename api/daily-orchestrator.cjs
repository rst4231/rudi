const { prepareDailyTopicCleanup } = require('./topic-maintenance.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { markProductsRuntimeStale } = require('./products-state.cjs');
const { runNativeSection } = require('./section-runners.cjs');
const { loadRudiSettings } = require('./rudi-settings.cjs');
const { markPublicationPublished, markPublicationSkipped, writeDailyRunSummary } = require('./publication-journal.cjs');
const { emitOperationalAlert } = require('./alert-service.cjs');
const { incrementSectionMetric } = require('./feedback-analytics.cjs');
const { moscowDateKey } = require('./preview-date.cjs');

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
  const rows = [
    ['events', results.events],
    ['holidays', results.holidays],
    ['facts', results.facts],
    ['clients', results.clients],
    ['lulu', results.morning?.preview?.lulu ? results.morning : null],
    ['recipes', Array.isArray(results.morning?.preview?.recipes) || results.morning?.recipeIds?.length ? results.morning : null],
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

  for (const section of ['labor', 'cinema', 'weekend']) {
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

module.exports = { recordGeneratedPayload, runDailyOrchestrator };
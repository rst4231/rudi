const nativeFetch = globalThis.fetch.bind(globalThis);
const { prepareDailyTopicCleanup } = require('./topic-maintenance.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { markProductsRuntimeStale } = require('./products-state.cjs');
const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { publishWeeklyCinemaPremieres } = require('./cinema-premieres-collage.cjs');
const indexHandler = require('./index.js');

// Facts/Lulu cross-day sequencing is resolved from external config before this runtime publishes.
async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  try {
    const cleanup = await prepareDailyTopicCleanup({
      token: resolveTelegramBotToken(process.env),
      fetchImpl: nativeFetch,
    });
    console.log('RUDI_TOPIC_CLEANUP_RESULT', cleanup);
  } catch (error) {
    console.error('RUDI_DAILY_TOPIC_CLEANUP_ERROR', error);
  }

  try {
    const labor = await indexHandler.publishDailyLaborArticle();
    if (labor) console.log('RUDI_LABOR_ARTICLE_RESULT', labor);
  } catch (error) {
    console.error('RUDI_LABOR_ARTICLE_ERROR', error);
  }

  try {
    const cinema = await publishWeeklyCinemaPremieres({ fetchImpl: nativeFetch });
    if (cinema) console.log('RUDI_CINEMA_PREMIERES_RESULT', cinema);
  } catch (error) {
    console.error('RUDI_CINEMA_PREMIERES_ERROR', error);
  }

  let runtimeResult;
  try {
    runtimeResult = await indexHandler.runRuntime(req, res);
  } finally {
    markProductsRuntimeStale();
  }
  return runtimeResult;
}

module.exports = handler;
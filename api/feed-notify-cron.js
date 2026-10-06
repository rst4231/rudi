const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { sendDailyMorningSummaries } = require('./morning-summary.cjs');
const { publishForDiToRudi } = require('./for-di-private.cjs');
const { publishDailyLaborArticle } = require('./index.js');



async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    console.warn('RUDI_FEED_NOTIFY_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  const mode = String(req.query?.mode || 'morning');
  try {
    const force = String(req.query?.force || '') === '1';
    const recoveryKey = String(req.query?.recoveryKey || '').trim();
    let laborCatchup = null;
    let result;
    if (mode === 'for-di') {
      try {
        laborCatchup = await publishDailyLaborArticle({
          force,
          queueOnly: true,
          now: new Date(),
        });
      } catch (error) {
        laborCatchup = { failed: true, error: String(error?.message || error) };
        console.warn('RUDI_FOR_DI_LABOR_CATCHUP_WARN', laborCatchup.error);
      }
      result = await publishForDiToRudi();
    } else {
      result = await sendDailyMorningSummaries({ force, recoveryKey });
    }
    const logLabel = mode === 'for-di' ? 'RUDI_FOR_DI_RESULT' : 'RUDI_MORNING_SUMMARY_RESULT';
    console.log(logLabel, JSON.stringify({ mode, force, recoveryKey, laborCatchup, ...result }));
    return res.status(200).json({
      ok: true,
      mode,
      force,
      ...(mode === 'for-di' ? { laborCatchup } : {}),
      ...result,
    });
  } catch (error) {
    console.error(
      mode === 'for-di' ? 'RUDI_FOR_DI_CRON_ERROR' : 'RUDI_MORNING_SUMMARY_CRON_ERROR',
      String(error?.message || error),
      error?.result ? JSON.stringify(error.result) : ''
    );
    return res.status(500).json({
      ok: false,
      error: mode === 'for-di' ? 'for-di-delivery-failed' : 'morning-summary-failed',
      ...(error?.result || {}),
    });
  }
}

module.exports = handler;

const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { sendDailyMorningSummaries } = require('./morning-summary.cjs');
const { sendForDiPrivateMessages } = require('./for-di-private.cjs');
const { runVacuumWatch } = require('./vacuum-watch.cjs');

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    console.error('RUDI_FEED_NOTIFY_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  const mode = String(req.query?.mode || 'morning');
  try {
    const result = mode === 'for-di'
      ? await sendForDiPrivateMessages()
      : mode === 'vacuum'
        ? await runVacuumWatch()
        : await sendDailyMorningSummaries();
    return res.status(200).json({ ok: true, mode, ...result });
  } catch (error) {
    const label = mode === 'for-di' ? 'RUDI_FOR_DI_CRON_ERROR' : mode === 'vacuum' ? 'RUDI_VACUUM_WATCH_CRON_ERROR' : 'RUDI_MORNING_SUMMARY_CRON_ERROR';
    console.error(label, String(error?.message || error));
    const code = mode === 'for-di' ? 'for-di-delivery-failed' : mode === 'vacuum' ? 'vacuum-watch-failed' : 'morning-summary-failed';
    return res.status(500).json({ ok: false, error: code });
  }
}

module.exports = handler;

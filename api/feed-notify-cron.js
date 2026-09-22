const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { sendDailyMorningSummaries } = require('./morning-summary.cjs');
const { sendForDiPrivateMessages } = require('./for-di-private.cjs');

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    console.error('RUDI_FEED_NOTIFY_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  const mode = String(req.query?.mode || 'morning');
  try {
    const result = mode === 'for-di'
      ? await sendForDiPrivateMessages()
      : await sendDailyMorningSummaries();
    return res.status(200).json({ ok: true, mode, ...result });
  } catch (error) {
    console.error(mode === 'for-di' ? 'RUDI_FOR_DI_CRON_ERROR' : 'RUDI_MORNING_SUMMARY_CRON_ERROR', String(error?.message || error));
    return res.status(500).json({ ok: false, error: mode === 'for-di' ? 'for-di-delivery-failed' : 'morning-summary-failed' });
  }
}

module.exports = handler;

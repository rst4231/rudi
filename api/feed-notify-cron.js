const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { sendDailyMorningSummaries } = require('./morning-summary.cjs');

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    console.error('RUDI_MORNING_SUMMARY_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  try {
    const result = await sendDailyMorningSummaries();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('RUDI_MORNING_SUMMARY_CRON_ERROR', String(error?.message || error));
    return res.status(500).json({ ok: false, error: 'morning-summary-failed' });
  }
}

module.exports = handler;

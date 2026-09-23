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
    const force = String(req.query?.force || '') === '1';
    const recoveryDate = String(req.query?.recoveryDate || '').trim();
    const recoveryKey = String(req.query?.recoveryKey || '').trim();
    if (recoveryDate) {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const today = values.year + '-' + values.month + '-' + values.day;
      if (today !== recoveryDate) {
        return res.status(200).json({ ok: true, mode, skipped: 'recovery-date-mismatch', recoveryDate, today });
      }
    }
    const result = mode === 'for-di'
      ? await sendForDiPrivateMessages()
      : await sendDailyMorningSummaries({ force, recoveryKey });
    console.log('RUDI_MORNING_SUMMARY_RESULT', JSON.stringify({ mode, force, recoveryDate, recoveryKey, ...result }));
    return res.status(200).json({ ok: true, mode, force, recoveryDate: recoveryDate || null, ...result });
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

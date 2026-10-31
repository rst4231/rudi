const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { sendDailyMorningSummaries } = require('./morning-summary.cjs');
const { run: runPersonalAi } = require('./personal-center-cron-handler.cjs');



async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    console.warn('RUDI_FEED_NOTIFY_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  const mode = String(req.query?.mode || 'morning');
  try {
    const force = String(req.query?.force || '') === '1';
    const recoveryKey = String(req.query?.recoveryKey || '').trim();
    if (mode === 'for-di') return res.status(410).json({ ok:false, error:'feature-removed' });
    let result;
    // Both reports use the same existing Vercel morning cron. Either can
    // complete independently; an AI outage never blocks Telegram delivery.
    const [telegramResult, aiResult] = await Promise.allSettled([
      sendDailyMorningSummaries({ force, recoveryKey }),
      runPersonalAi({ now: Date.now() }),
    ]);
    const personalAi = aiResult.status === 'fulfilled'
      ? aiResult.value
      : { ok: false, error: String(aiResult.reason?.message || aiResult.reason || 'ai-failed') };
    if (!personalAi.ok) console.error('RUDI_MORNING_PERSONAL_AI_WARN', JSON.stringify(personalAi));
    if (telegramResult.status === 'rejected') throw telegramResult.reason;
    result = { ...telegramResult.value, personalAi };
    const logLabel = 'RUDI_MORNING_SUMMARY_RESULT';
    console.log(logLabel, JSON.stringify({ mode, force, recoveryKey, ...result }));
    return res.status(200).json({
      ok: true,
      mode,
      force,
      ...result,
    });
  } catch (error) {
    console.error(
      'RUDI_MORNING_SUMMARY_CRON_ERROR',
      String(error?.message || error),
      error?.result ? JSON.stringify(error.result) : ''
    );
    return res.status(500).json({
      ok: false,
      error: 'morning-summary-failed',
      ...(error?.result || {}),
    });
  }
}

module.exports = handler;

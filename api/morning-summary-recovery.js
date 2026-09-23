const { sendDailyMorningSummaries } = require('./morning-summary.cjs');
const { moscowDateKey } = require('./feed-store.cjs');

const RECOVERY_DATE = '2026-09-23';
const RECOVERY_KEY = 'manual-2026-09-23-final';

module.exports = async function handler(req, res) {
  const today = moscowDateKey(new Date());
  if (today !== RECOVERY_DATE) {
    return res.status(410).json({ ok:false, error:'recovery-expired', today });
  }

  try {
    const result = await sendDailyMorningSummaries({
      force: true,
      recoveryKey: RECOVERY_KEY,
    });
    console.log('RUDI_MORNING_RECOVERY_RESULT', JSON.stringify(result));
    return res.status(200).json({ ok:true, ...result });
  } catch (error) {
    console.error(
      'RUDI_MORNING_RECOVERY_ERROR',
      String(error?.message || error),
      error?.result ? JSON.stringify(error.result) : ''
    );
    return res.status(500).json({
      ok:false,
      error:String(error?.message || error),
      ...(error?.result || {}),
    });
  }
};

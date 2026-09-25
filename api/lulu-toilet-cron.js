const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { runLuluToiletAlert } = require('./lulu-toilet-alert.cjs');

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    console.error('RUDI_LULU_TOILET_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }
  try {
    const result = await runLuluToiletAlert();
    console.log('RUDI_LULU_TOILET_CRON_RESULT', JSON.stringify(result));
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('RUDI_LULU_TOILET_CRON_ERROR', String(error?.message || error));
    return res.status(500).json({ ok: false, error: 'lulu-toilet-alert-failed' });
  }
}

module.exports = handler;

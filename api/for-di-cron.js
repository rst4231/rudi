const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { sendForDiPrivateMessages } = require('./for-di-private.cjs');

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    console.error('RUDI_FOR_DI_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }
  try {
    const result = await sendForDiPrivateMessages();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('RUDI_FOR_DI_CRON_ERROR', String(error?.message || error));
    return res.status(500).json({ ok: false, error: 'for-di-delivery-failed' });
  }
}

module.exports = handler;

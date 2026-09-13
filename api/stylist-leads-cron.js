const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { runStylistLeadScan } = require('./stylist-web-search.cjs');

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }
  try {
    const result = await runStylistLeadScan();
    return res.status(200).json(result);
  } catch (error) {
    console.error('RUDI_STYLIST_LEADS_CRON_ERROR', String(error?.message || error));
    return res.status(500).json({ ok: false, error: 'stylist-leads-failed' });
  }
}

module.exports = handler;
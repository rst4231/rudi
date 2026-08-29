const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { runDailyOrchestrator } = require('./daily-orchestrator.cjs');

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }
  return runDailyOrchestrator(req, res);
}

module.exports = handler;

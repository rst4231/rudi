const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { sendDailyFeedNotifications } = require('./feed-notifications.cjs');

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) {
    console.error('RUDI_FEED_NOTIFY_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  try {
    const result = await sendDailyFeedNotifications();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('RUDI_FEED_NOTIFY_CRON_ERROR', String(error?.message || error));
    return res.status(500).json({ ok: false, error: 'feed-notification-failed' });
  }
}

module.exports = handler;

const { sendDailyMorningSummaries } = require('./morning-summary.cjs');

async function sendDailyFeedNotifications(options = {}) {
  return sendDailyMorningSummaries(options);
}

module.exports = {
  sendDailyFeedNotifications,
  sendDailyMorningSummaries,
};

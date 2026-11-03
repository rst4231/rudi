// Retired toilet reminders keep a no-op entry point for the shared cron.
// The cron also sends fasting goal notifications, so it stays scheduled.
async function runLuluToiletAlert() {
  return { sent: [], skipped: 'disabled', probability: null };
}

module.exports = { runLuluToiletAlert };

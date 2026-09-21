const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('legacy feed notifier no longer contains the old 10am feed-update message', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'feed-notifications.cjs'), 'utf8');
  assert.match(source, /sendDailyMorningSummaries/);
  assert.doesNotMatch(source, /я обновил Ленту/);
  assert.doesNotMatch(source, /Добавил.*концерт/);
});

test('cron calls the morning summary instead of the legacy feed notifier', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'feed-notify-cron.js'), 'utf8');
  assert.match(source, /sendDailyMorningSummaries/);
  assert.doesNotMatch(source, /sendDailyFeedNotifications/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { updateFeedSections } = require('../api/feed-store.cjs');
const { sendDailyFeedNotifications } = require('../api/feed-notifications.cjs');

function memoryCache() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
  };
}

test('10am feed notifier sends personalized rich message once per recipient/version', async () => {
  const cache = memoryCache();
  const now = new Date('2026-09-21T07:00:00Z');
  await updateFeedSections({
    facts: { parts: ['fact'] },
    events: { parts: ['event'] },
  }, { feedCache: cache, now, date: '2026-09-21' });

  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 100 + calls.length } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const options = {
    now,
    feedCache: cache,
    recipients: { 'Рустам': 1, 'Диана': 2 },
    botToken: 'test-token',
    fetchImpl,
  };

  const first = await sendDailyFeedNotifications(options);
  const second = await sendDailyFeedNotifications(options);

  assert.equal(first.sent, 2);
  assert.equal(second.sent, 0);
  assert.equal(calls.length, 2);
  assert.match(calls[0].text, /<b>Рустам, я обновил Ленту<\/b>/);
  assert.match(calls[1].text, /<b>Диана, я обновил Ленту<\/b>/);
  assert.equal(calls[0].parse_mode, 'HTML');
  assert.match(calls[0].reply_markup.inline_keyboard[0][0].web_app.url, /[?&]tab=feed/);
});

test('feed notifier stays silent when current day has no new feed changes', async () => {
  const cache = memoryCache();
  const previous = new Date('2026-09-20T07:00:00Z');
  await updateFeedSections({
    facts: { parts: ['fact'] },
  }, { feedCache: cache, now: previous, date: '2026-09-20' });

  const calls = [];
  const result = await sendDailyFeedNotifications({
    now: new Date('2026-09-21T07:00:00Z'),
    feedCache: cache,
    recipients: { 'Рустам': 1, 'Диана': 2 },
    botToken: 'test-token',
    fetchImpl: async (...args) => { calls.push(args); throw new Error('should-not-send'); },
  });

  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 'nothing-new');
  assert.equal(calls.length, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FACTS_TOPIC_ID,
  wrapDailyContentDedupe,
  formatCatalogEntry,
} = require('../api/daily-content-dedupe.cjs');

function resilientCache() {
  const values = new Map();
  let failHistoryWrites = true;
  return {
    values,
    stopFailingHistory() { failHistoryWrites = false; },
    async get(key) { return values.get(key); },
    async set(key, value) {
      if (failHistoryWrites && key === 'daily-content:72:history') {
        throw new Error('simulated history write failure after Telegram success');
      }
      values.set(key, value);
    },
  };
}

function telegramResponse(messageId) {
  return new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('a successful Telegram post stays reserved even if the later history write fails', async () => {
  const first = { id: 'facts-first', type: 'facts', emoji: '1️⃣', category: 'Тест', body: 'Первый', sourceUrl: 'https://example.com/first' };
  const second = { id: 'facts-second', type: 'facts', emoji: '2️⃣', category: 'Тест', body: 'Второй', sourceUrl: 'https://example.com/second' };
  const cache = resilientCache();
  const sent = [];
  const fetchImpl = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return telegramResponse(1000 + sent.length);
  };

  const dayOne = wrapDailyContentDedupe(fetchImpl, {
    cache,
    catalog: { facts: [first, second], lulu: [] },
    alwaysReplace: true,
    now: new Date('2026-08-26T00:30:00.000Z'),
  });

  await assert.rejects(() => dayOne('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'runtime fact' }),
  }), /history write failure/i);

  assert.deepEqual(cache.values.get('daily-content:72:used-ids'), ['facts-first']);
  assert.equal(cache.values.get('daily-content:72:date:2026-08-26')?.id, 'facts-first');

  const retrySameDay = await dayOne('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'runtime fact retry' }),
  });
  assert.equal(sent.length, 1);
  assert.equal((await retrySameDay.json()).result.suppressed_duplicate, true);

  cache.stopFailingHistory();
  const dayTwo = wrapDailyContentDedupe(fetchImpl, {
    cache,
    catalog: { facts: [first, second], lulu: [] },
    alwaysReplace: true,
    now: new Date('2026-08-27T00:30:00.000Z'),
  });
  await dayTwo('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'runtime fact next day' }),
  });

  assert.equal(sent.length, 2);
  assert.equal(sent[1].text, formatCatalogEntry(second));
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FACTS_TOPIC_ID,
  LULU_TOPIC_ID,
  wrapDailyContentDedupe,
  formatCatalogEntry,
} = require('../api/daily-content-dedupe.cjs');

function emptyCache() {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, value); },
  };
}

function telegramResponse(messageId) {
  return new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const facts = [
  { id: 'facts-retired', type: 'facts', category: 'Тест', body: 'Уже публиковалось', sourceUrl: 'https://example.com/f0' },
  { id: 'facts-day0', type: 'facts', category: 'Тест', body: 'Первый новый факт', sourceUrl: 'https://example.com/f1' },
  { id: 'facts-day1', type: 'facts', category: 'Тест', body: 'Второй новый факт', sourceUrl: 'https://example.com/f2' },
];
const lulu = [
  { id: 'lulu-retired', type: 'lulu', title: 'Старый совет', body: 'Уже публиковалось', sourceUrl: 'https://example.com/l0' },
  { id: 'lulu-day0', type: 'lulu', title: 'Первый совет', body: 'Первый новый совет', sourceUrl: 'https://example.com/l1' },
  { id: 'lulu-day1', type: 'lulu', title: 'Второй совет', body: 'Второй новый совет', sourceUrl: 'https://example.com/l2' },
];

const catalog = {
  publishedIds: ['facts-retired', 'lulu-retired'],
  facts,
  lulu,
  sequence: {
    startDate: '2026-08-30',
    factsStartId: 'facts-day0',
    luluStartId: 'lulu-day0',
  },
};

async function sendForDay({ now, topicId, text }) {
  let sent;
  const wrapped = wrapDailyContentDedupe(async (_url, init) => {
    sent = JSON.parse(init.body);
    return telegramResponse(1000 + topicId);
  }, {
    cache: emptyCache(), // simulate Runtime Cache loss between days
    catalog,
    alwaysReplace: true,
    now: new Date(now),
  });

  await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: topicId, text }),
  });
  return sent?.text;
}

test('calendar sequence keeps Facts and Lulu unique across days even when Runtime Cache is empty', async () => {
  const factsDay0 = await sendForDay({ now: '2026-08-29T21:30:00.000Z', topicId: FACTS_TOPIC_ID, text: 'runtime fact' });
  const luluDay0 = await sendForDay({ now: '2026-08-29T21:30:00.000Z', topicId: LULU_TOPIC_ID, text: 'runtime lulu' });
  const factsDay1 = await sendForDay({ now: '2026-08-30T21:30:00.000Z', topicId: FACTS_TOPIC_ID, text: 'runtime fact' });
  const luluDay1 = await sendForDay({ now: '2026-08-30T21:30:00.000Z', topicId: LULU_TOPIC_ID, text: 'runtime lulu' });

  assert.equal(factsDay0, formatCatalogEntry(facts[1]));
  assert.equal(luluDay0, formatCatalogEntry(lulu[1]));
  assert.equal(factsDay1, formatCatalogEntry(facts[2]));
  assert.equal(luluDay1, formatCatalogEntry(lulu[2]));
});

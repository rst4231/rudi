const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FACTS_TOPIC_ID,
  LULU_TOPIC_ID,
  wrapDailyContentDedupe,
  formatCatalogEntry,
} = require('../api/daily-content-dedupe.cjs');

function memoryCache() {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, value); },
  };
}

function response(messageId) {
  return new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('known Aug 24/25 facts and Lulu posts stay retired even with empty runtime history', async () => {
  const oldFact = { id: 'facts-sleep-7h', type: 'facts', emoji: '🌙', category: 'Сон', body: 'Уже выходило', sourceUrl: 'https://example.com/old-fact' };
  const newFact = { id: 'facts-new-after-repeat', type: 'facts', emoji: '💡', category: 'Новое', body: 'Новый факт', sourceUrl: 'https://example.com/new-fact' };
  const oldLulu = { id: 'lulu-teeth-daily', type: 'lulu', title: 'Уже выходило', body: 'Старый совет', sourceUrl: 'https://example.com/old-lulu' };
  const newLulu = { id: 'lulu-new-after-repeat', type: 'lulu', title: 'Новый совет', body: 'Новый совет для Лулу', sourceUrl: 'https://example.com/new-lulu' };
  const catalog = { facts: [oldFact, newFact], lulu: [oldLulu, newLulu] };
  const sent = [];
  const wrapped = wrapDailyContentDedupe(async (_url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    return response(900 + sent.length);
  }, {
    cache: memoryCache(),
    catalog,
    alwaysReplace: true,
    now: new Date('2026-08-26T00:30:00.000Z'),
  });

  await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'runtime fact' }),
  });
  await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: LULU_TOPIC_ID, text: 'runtime lulu' }),
  });

  assert.equal(sent[0].text, formatCatalogEntry(newFact));
  assert.equal(sent[1].text, formatCatalogEntry(newLulu));
});

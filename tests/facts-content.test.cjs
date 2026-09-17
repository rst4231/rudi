const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCatalog, applySequenceState } = require('../api/daily-content-config.cjs');
const { FACTS_TOPIC_ID, formatCatalogEntry, wrapDailyContentDedupe } = require('../api/daily-content-dedupe.cjs');

function cache() {
  const data = new Map();
  return {
    async get(key) { return data.get(key) ?? null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
  };
}

const fact = {
  id: 'facts-test',
  type: 'facts',
  emoji: '💡',
  category: 'Наука',
  body: 'Проверочный факт.',
  application: 'Проверочное применение.',
  sourceUrl: 'https://example.com/fact',
  sourceLabel: 'Источник →',
};

test('facts-only catalog validates without retired sections', () => {
  const source = { version: 5, publishedIds: [], facts: [fact] };
  const withSequence = applySequenceState(source, {
    enabled: true,
    startDate: '2026-09-17',
    factsStartId: fact.id,
    retiredIds: [],
  });
  const catalog = validateCatalog(withSequence);
  assert.equal(catalog.facts.length, 1);
  assert.equal(catalog.sequence.factsStartId, fact.id);
  assert.equal('lulu' in catalog, false);
});

test('facts formatter keeps application and source', () => {
  const message = formatCatalogEntry(fact);
  assert.match(message, /Полезные факты/);
  assert.match(message, /Как использовать в жизни/);
  assert.match(message, /example\.com\/fact/);
});

test('facts transport replaces runtime content and suppresses a second publication on the same Moscow date', async () => {
  const store = cache();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const wrapped = wrapDailyContentDedupe(fetchImpl, {
    cache: store,
    catalog: {
      version: 5,
      publishedIds: [],
      facts: [fact],
      sequence: { startDate: '2026-09-17', factsStartId: fact.id },
    },
    alwaysReplace: true,
    now: new Date('2026-09-17T09:00:00.000Z'),
  });
  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: '-1001', message_thread_id: FACTS_TOPIC_ID, text: 'legacy' }),
  };
  const first = await wrapped('https://api.telegram.org/bot1:test/sendMessage', request);
  const second = await wrapped('https://api.telegram.org/bot1:test/sendMessage', request);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, formatCatalogEntry(fact));
});

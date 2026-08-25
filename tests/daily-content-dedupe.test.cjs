const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FACTS_TOPIC_ID,
  LULU_TOPIC_ID,
  wrapDailyContentDedupe,
  formatCatalogEntry,
} = require('../api/daily-content-dedupe.cjs');

function fakeCache(initial = {}) {
  const values = new Map(Object.entries(initial));
  const setOptions = new Map();
  return {
    values,
    setOptions,
    async get(key) { return values.get(key); },
    async set(key, value, options) {
      values.set(key, value);
      setOptions.set(key, options || {});
    },
  };
}

function telegramResponse(result = { message_id: 777 }, status = 200) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, result }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('facts duplicate is replaced with an unseen catalog fact and remembered', async () => {
  const duplicate = '💡 <b>Полезные факты</b>\n🌙 <b>Сон</b>\n\nПовтор.';
  const replacement = {
    id: 'facts-water-break',
    type: 'facts',
    emoji: '💧',
    category: 'Самочувствие',
    body: 'Новый полезный факт.',
    sourceUrl: 'https://example.com/fact',
    sourceLabel: 'Источник →',
  };
  const cache = fakeCache({
    'daily-content:72:history': [{ fingerprint: 'f:known', normalized: duplicate.toLowerCase() }],
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramResponse();
  };

  const wrapped = wrapDailyContentDedupe(fetchImpl, {
    cache,
    catalog: { facts: [replacement], lulu: [] },
    fingerprint: (text) => text === duplicate ? 'f:known' : `f:${text.length}`,
  });

  const response = await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: duplicate }),
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.text, formatCatalogEntry(replacement));
  const history = await cache.get('daily-content:72:history');
  assert.equal(history.at(-1).id, 'facts-water-break');
  assert.equal(history.at(-1).messageId, 777);
});

test('lulu duplicate is never sent when no unseen replacement exists', async () => {
  const duplicate = '🐶 <b>Для Лулу</b>\n\n<b>Повтор</b>\nСтарый совет.';
  const cache = fakeCache({
    'daily-content:85:history': [{ fingerprint: 'same' }],
  });
  let calls = 0;
  const wrapped = wrapDailyContentDedupe(async () => {
    calls += 1;
    return telegramResponse();
  }, {
    cache,
    catalog: { facts: [], lulu: [] },
    fingerprint: () => 'same',
  });

  const response = await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: LULU_TOPIC_ID, text: duplicate }),
  });

  assert.equal(calls, 0);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.result.message_thread_id, LULU_TOPIC_ID);
});

test('new target-topic content passes through unchanged and is remembered only after success', async () => {
  const text = '🐶 <b>Для Лулу</b>\n\n<b>Новый совет</b>\nТекст.';
  const cache = fakeCache();
  let sentBody;
  const wrapped = wrapDailyContentDedupe(async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return telegramResponse({ message_id: 901 });
  }, { cache, catalog: { facts: [], lulu: [] } });

  await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: LULU_TOPIC_ID, text }),
  });

  assert.equal(sentBody.text, text);
  const history = await cache.get('daily-content:85:history');
  assert.equal(history.length, 1);
  assert.equal(history[0].messageId, 901);
});

test('a second publication for the same Moscow date is suppressed', async () => {
  const cache = fakeCache({
    'daily-content:72:history': [{
      fingerprint: 'old',
      id: 'already-sent',
      messageId: 777,
      dateKey: '2026-08-24',
      publishedAt: '2026-08-24T00:30:00.000Z',
    }],
  });
  let calls = 0;
  const wrapped = wrapDailyContentDedupe(async () => {
    calls += 1;
    return telegramResponse({ message_id: 778 });
  }, {
    cache,
    catalog: {
      facts: [{ id: 'new', type: 'facts', emoji: '💡', category: 'Тест', body: 'Новый факт', sourceUrl: 'https://example.com/new' }],
      lulu: [],
    },
    now: new Date('2026-08-24T10:00:00.000Z'),
  });

  const response = await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'другой встроенный факт' }),
  });

  assert.equal(calls, 0);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.suppressed_duplicate, true);
});

test('an already published content id is never reused even if its text changes', async () => {
  const oldIdChangedText = {
    id: 'facts-used-before',
    type: 'facts',
    emoji: '💡',
    category: 'Тест',
    body: 'Переписанный текст уже опубликованной темы.',
    sourceUrl: 'https://example.com/old',
  };
  const fresh = {
    id: 'facts-fresh',
    type: 'facts',
    emoji: '💡',
    category: 'Тест',
    body: 'Совсем новая тема.',
    sourceUrl: 'https://example.com/fresh',
  };
  const cache = fakeCache({
    'daily-content:72:history': [{ id: 'facts-used-before', fingerprint: 'old-fingerprint', dateKey: '2026-08-20' }],
  });
  let sentBody;
  const wrapped = wrapDailyContentDedupe(async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return telegramResponse({ message_id: 902 });
  }, {
    cache,
    catalog: { facts: [oldIdChangedText, fresh], lulu: [] },
    alwaysReplace: true,
    now: new Date('2026-08-26T00:30:00.000Z'),
  });

  await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'runtime fact' }),
  });

  assert.equal(sentBody.text, formatCatalogEntry(fresh));
  const history = await cache.get('daily-content:72:history');
  assert.equal(history.at(-1).id, 'facts-fresh');
});

test('catalog-published ids are permanently excluded even when runtime history is empty', async () => {
  const retired = {
    id: 'lulu-already-published',
    type: 'lulu',
    title: 'Уже выходило',
    body: 'Этот совет уже был опубликован.',
    sourceUrl: 'https://example.com/retired',
  };
  const fresh = {
    id: 'lulu-new',
    type: 'lulu',
    title: 'Новый совет',
    body: 'Этот совет ещё не выходил.',
    sourceUrl: 'https://example.com/new',
  };
  const cache = fakeCache();
  let sentBody;
  const wrapped = wrapDailyContentDedupe(async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return telegramResponse({ message_id: 903 });
  }, {
    cache,
    catalog: { facts: [], lulu: [retired, fresh], publishedIds: ['lulu-already-published'] },
    alwaysReplace: true,
    now: new Date('2026-08-26T00:30:00.000Z'),
  });

  await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: LULU_TOPIC_ID, text: 'runtime lulu' }),
  });

  assert.equal(sentBody.text, formatCatalogEntry(fresh));
});

test('daily content history is stored without an expiry ttl', async () => {
  const cache = fakeCache();
  const wrapped = wrapDailyContentDedupe(async () => telegramResponse({ message_id: 904 }), {
    cache,
    catalog: {
      facts: [{ id: 'facts-new', type: 'facts', emoji: '💡', category: 'Тест', body: 'Новый факт', sourceUrl: 'https://example.com/new' }],
      lulu: [],
    },
    alwaysReplace: true,
    now: new Date('2026-08-26T00:30:00.000Z'),
  });

  await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'runtime fact' }),
  });

  const options = cache.setOptions.get('daily-content:72:history');
  assert.equal(Object.prototype.hasOwnProperty.call(options, 'ttl'), false);
});

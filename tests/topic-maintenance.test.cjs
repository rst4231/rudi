const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENTS_TOPIC_ID,
  HOLIDAYS_TOPIC_ID,
  COUPLE_TOPIC_ID,
  dateKeyInMoscow,
  shiftDateKey,
  prepareDailyTopicCleanup,
  handleTelegramTopicRequest,
  sanitizeHealthPayload,
} = require('../api/topic-maintenance.cjs');

function fakeCache(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
  };
}

function telegramResponse(result, status = 200) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, result }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('date helpers use Moscow day keys and deterministic day shifting', () => {
  assert.equal(dateKeyInMoscow(new Date('2026-08-19T21:30:00Z')), '2026-08-20');
  assert.equal(shiftDateKey('2026-08-20', -2), '2026-08-18');
});

test('daily cleanup deletes yesterday posts from both events and holidays', async () => {
  const cache = fakeCache({
    'topic:19:chat-id': -100123,
    'topic:19:2026-08-19:messages': [101, 102],
    'topic:44:chat-id': -100123,
    'topic:44:2026-08-19:messages': [201],
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramResponse(true);
  };

  await prepareDailyTopicCleanup({
    now: new Date('2026-08-19T21:30:00Z'),
    cache,
    token: '1:testtoken',
    fetchImpl,
  });

  assert.deepEqual(calls.map((call) => call.body.message_ids), [[101, 102], [201]]);
  assert.equal(await cache.get('topic:19:2026-08-20:cleanup'), true);
  assert.equal(await cache.get('topic:44:2026-08-20:cleanup'), true);
});

test('new event publication clears yesterday posts even when daily cron did not run', async () => {
  const cache = fakeCache({
    'topic:237:deleted:-100123': true,
    'topic:19:2026-08-19:messages': [501, 502],
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'deleteMessages') return telegramResponse(true);
    return telegramResponse({ message_id: 777 });
  };

  const response = await handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:testtoken/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: EVENTS_TOPIC_ID, text: 'today event' }) },
    { cache, now: new Date('2026-08-20T10:00:00Z'), fetchImpl },
  );

  assert.equal(response.status, 200);
  const deletion = calls.find((call) => call.method === 'deleteMessages');
  assert.deepEqual(deletion?.body.message_ids, [501, 502]);
  assert.deepEqual(await cache.get('topic:19:2026-08-20:messages'), [777]);
});

test('outgoing managed topic messages are recorded for future cleanup', async () => {
  const cache = fakeCache();
  const fetchImpl = async () => telegramResponse({ message_id: 777 });

  const response = await handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:testtoken/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: EVENTS_TOPIC_ID, text: 'x' }) },
    { cache, now: new Date('2026-08-19T10:00:00Z'), fetchImpl },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await cache.get('topic:19:2026-08-19:messages'), [777]);
  assert.equal(await cache.get('topic:19:chat-id'), -100123);
});

test('publishing in the main forum also removes the obsolete couple topic once', async () => {
  const cache = fakeCache();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    calls.push(method);
    if (method === 'deleteForumTopic') return telegramResponse(true);
    return telegramResponse({ message_id: 778 });
  };

  await handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:testtoken/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: EVENTS_TOPIC_ID, text: 'event' }) },
    { cache, now: new Date('2026-08-19T10:00:00Z'), fetchImpl },
  );

  assert.deepEqual(calls, ['deleteForumTopic', 'sendMessage']);
});

test('couple topic sends are suppressed and the forum topic is deleted', async () => {
  const cache = fakeCache();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramResponse(true);
  };

  const response = await handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:testtoken/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: COUPLE_TOPIC_ID, text: 'old feature' }) },
    { cache, fetchImpl },
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /deleteForumTopic$/);
  assert.deepEqual(calls[0].body, { chat_id: -100123, message_thread_id: COUPLE_TOPIC_ID });
});

test('health payload no longer exposes the removed couple topic', () => {
  const payload = sanitizeHealthPayload({ ok: true, topics: { events: 19, holidays: 44, couple: 237, products: 263 } });
  assert.deepEqual(payload.topics, { events: 19, holidays: 44, products: 263 });
});

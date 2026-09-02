const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENTS_TOPIC_ID,
  prepareDailyTopicCleanup,
  handleTelegramTopicRequest,
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

test('events delete the previous active batch even when the dated message key is missing', async () => {
  const cache = fakeCache({
    'topic:237:deleted:-100123': true,
    'topic:19:active': {
      dateKey: '2026-08-19',
      chatId: -100123,
      messageIds: [759, 760],
    },
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(init.body);
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
  assert.deepEqual(calls.map((call) => call.method), ['deleteMessages', 'sendMessage']);
  assert.deepEqual(calls[0].body, { chat_id: -100123, message_ids: [759, 760] });
  assert.deepEqual(await cache.get('topic:19:active'), {
    dateKey: '2026-08-20',
    chatId: -100123,
    messageIds: [777],
  });
});

test('nightly cleanup deletes the previous active event batch without a dated key', async () => {
  const cache = fakeCache({
    'topic:19:chat-id': -100123,
    'topic:19:active': {
      dateKey: '2026-08-19',
      chatId: -100123,
      messageIds: [759, 760],
    },
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    calls.push({ method, body: JSON.parse(init.body) });
    return telegramResponse(true);
  };

  await prepareDailyTopicCleanup({
    now: new Date('2026-08-19T21:30:00Z'),
    cache,
    token: '1:testtoken',
    fetchImpl,
  });

  assert.deepEqual(calls[0], {
    method: 'deleteMessages',
    body: { chat_id: -100123, message_ids: [759, 760] },
  });
  assert.equal(await cache.get('topic:19:active'), undefined);
});

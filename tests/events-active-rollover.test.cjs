const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENTS_TOPIC_ID,
  prepareDailyTopicCleanup,
  handleTelegramTopicRequest,
} = require('../api/topic-maintenance.cjs');
const { runWithPublicationContext } = require('../api/section-controls.cjs');

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

test('event replacement publishes the new post and queues stale messages when deletion keeps failing', async () => {
  const cache = fakeCache({
    'topic:237:deleted:-100123': true,
    'topic:19:active': {
      dateKey: '2026-09-16',
      chatId: -100123,
      messageIds: [901, 902],
    },
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'deleteMessages') {
      return new Response(JSON.stringify({ ok: false, description: 'temporary delete failure' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return telegramResponse({ message_id: 903 });
  };

  const response = await handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:testtoken/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: EVENTS_TOPIC_ID, text: 'new event post' }) },
    { cache, now: new Date('2026-09-17T10:00:00Z'), fetchImpl },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.method), ['deleteMessages', 'deleteMessages', 'deleteMessages', 'sendMessage']);
  assert.deepEqual(await cache.get('topic:19:active'), {
    dateKey: '2026-09-17',
    chatId: -100123,
    messageIds: [903],
  });
  assert.deepEqual(await cache.get('topic:19:pending-delete'), {
    batches: [{ dateKey: '2026-09-16', chatId: -100123, messageIds: [901, 902] }],
  });
});

test('same-day replacement deletes dated event messages when active tracking is missing', async () => {
  const cache = fakeCache({
    'topic:237:deleted:-100123': true,
    'topic:19:2026-09-17:messages': [911, 912],
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'deleteMessages') return telegramResponse(true);
    return telegramResponse({ message_id: 913 });
  };

  await runWithPublicationContext({ date: '2026-09-17' }, () => handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:testtoken/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: EVENTS_TOPIC_ID, text: 'replacement' }) },
    { cache, now: new Date('2026-09-17T10:00:00Z'), fetchImpl },
  ));

  assert.deepEqual(calls.map((call) => call.method), ['deleteMessages', 'sendMessage']);
  assert.deepEqual(calls[0].body, { chat_id: -100123, message_ids: [911, 912] });
  assert.deepEqual(await cache.get('topic:19:active'), {
    dateKey: '2026-09-17',
    chatId: -100123,
    messageIds: [913],
  });
});

test('same-day failed cleanup keeps stale ids separate from the newly published event', async () => {
  const cache = fakeCache({
    'topic:237:deleted:-100123': true,
    'topic:19:2026-09-17:messages': [921, 922],
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'deleteMessages') {
      return new Response(JSON.stringify({ ok: false, description: 'temporary delete failure' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return telegramResponse({ message_id: 923 });
  };

  const response = await runWithPublicationContext({ date: '2026-09-17' }, () => handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:testtoken/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: EVENTS_TOPIC_ID, text: 'replacement after cleanup failure' }) },
    { cache, now: new Date('2026-09-17T10:00:00Z'), fetchImpl },
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.method), ['deleteMessages', 'deleteMessages', 'deleteMessages', 'sendMessage']);
  assert.deepEqual(await cache.get('topic:19:2026-09-17:messages'), [923]);
  assert.deepEqual(await cache.get('topic:19:pending-delete'), {
    batches: [{ dateKey: '2026-09-17', chatId: -100123, messageIds: [921, 922] }],
  });
  assert.deepEqual(await cache.get('topic:19:active'), {
    dateKey: '2026-09-17',
    chatId: -100123,
    messageIds: [923],
  });
});

test('a same-day event publication replaces the previous active batch once and keeps its own messages', async () => {
  const cache = fakeCache({
    'topic:237:deleted:-100123': true,
    'topic:19:active': {
      dateKey: '2026-09-15',
      chatId: -100123,
      messageIds: [759, 760],
    },
  });
  const calls = [];
  let nextMessageId = 777;
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'deleteMessages') return telegramResponse(true);
    return telegramResponse({ message_id: nextMessageId++ });
  };

  await runWithPublicationContext({ date: '2026-09-15' }, async () => {
    await handleTelegramTopicRequest(
      'https://api.telegram.org/bot1:testtoken/sendMessage',
      { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: EVENTS_TOPIC_ID, text: 'concerts' }) },
      { cache, now: new Date('2026-09-15T10:00:00Z'), fetchImpl },
    );
    await handleTelegramTopicRequest(
      'https://api.telegram.org/bot1:testtoken/sendMessage',
      { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: EVENTS_TOPIC_ID, text: 'standup' }) },
      { cache, now: new Date('2026-09-15T10:00:01Z'), fetchImpl },
    );
  });

  assert.deepEqual(calls.map((call) => call.method), ['deleteMessages', 'sendMessage', 'sendMessage']);
  assert.deepEqual(calls[0].body, { chat_id: -100123, message_ids: [759, 760] });
  assert.deepEqual(await cache.get('topic:19:active'), {
    dateKey: '2026-09-15',
    chatId: -100123,
    messageIds: [777, 778],
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
  assert.deepEqual(await cache.get('topic:19:cleanup:last'), {
    checkedAt: '2026-08-19T21:30:00.000Z',
    trigger: 'daily',
    date: '2026-08-20',
    targetDateKey: '2026-08-19',
    tracked: 2,
    deleted: 2,
    skipped: null,
    error: null,
  });
  assert.doesNotMatch(JSON.stringify(await cache.get('topic:19:cleanup:last')), /chatId|messageIds/i);
});


test('nightly cleanup uses the known forum chat when the cached chat id is missing', async () => {
  const cache = fakeCache({
    'topic:19:2026-08-19:messages': [801, 802],
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
    body: { chat_id: '-1004476323368', message_ids: [801, 802] },
  });
  assert.equal(await cache.get('topic:19:2026-08-19:messages'), undefined);
});

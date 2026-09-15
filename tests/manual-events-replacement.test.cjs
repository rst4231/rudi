const test = require('node:test');
const assert = require('node:assert/strict');
const { publishSelectedSection } = require('../api/manual-section-publisher.cjs');

function fakeCache(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
  };
}

function telegramResponse(result) {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('manual events replace the previous same-day batch once and keep both new parts', async () => {
  const settings = {
    sections: { events: { enabled: true, topicId: 19 } },
    copy: { footers: {} },
  };
  const preview = {
    results: { events: { preview: { concerts: 'concert', stage: 'stage' } } },
  };
  const topicCache = fakeCache({
    'topic:237:deleted:-100123': true,
    'topic:19:active': {
      dateKey: '2026-09-15',
      chatId: -100123,
      messageIds: [759, 760],
    },
  });
  const controlCache = fakeCache();
  const calls = [];
  let nextMessageId = 777;
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'deleteMessages') return telegramResponse(true);
    return telegramResponse({ message_id: nextMessageId++ });
  };

  const result = await publishSelectedSection({ section: 'events', date: '2026-09-15', force: true }, {
    settingsLoader: async () => ({ settings }),
    previewProvider: async () => preview,
    getRecord: async () => ({ status: 'published', messageIds: [759, 760] }),
    getOverride: async () => null,
    markPending: async () => {},
    markPublished: async () => {},
    markFailed: async () => {},
    incrementMetric: async () => {},
    token: 'test-token',
    chatId: -100123,
    topicCache,
    controlCache,
    fetchImpl,
    now: new Date('2026-09-15T10:00:00Z'),
  });

  assert.equal(result.published, 2);
  assert.deepEqual(calls.map((call) => call.method), ['deleteMessages', 'sendMessage', 'sendMessage']);
  assert.deepEqual(calls[0].body, { chat_id: -100123, message_ids: [759, 760] });
  assert.deepEqual(await topicCache.get('topic:19:active'), {
    dateKey: '2026-09-15',
    chatId: -100123,
    messageIds: [777, 778],
  });
});

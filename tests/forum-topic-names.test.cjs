const test = require('node:test');
const assert = require('node:assert/strict');

const { validateForumTopicsConfig } = require('../api/forum-topics-config.cjs');
const { syncConfiguredForumTopicNames } = require('../api/forum-topic-names.cjs');

test('forum topics config keeps configured Clients name', () => {
  const config = validateForumTopicsConfig({
    version: 2,
    clients: 126,
    labor: 696,
    names: { clients: 'Для Ди' },
  });
  assert.equal(config.names.clients, 'Для Ди');
});

test('configured Clients topic name is sent through editForumTopic', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await syncConfiguredForumTopicNames({
    token: 'test-token',
    chatId: -1001234567890,
    fetchImpl,
    config: {
      version: 2,
      clients: 126,
      labor: 696,
      names: { clients: 'Для Ди' },
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /editForumTopic$/);
  assert.deepEqual(calls[0].body, {
    chat_id: -1001234567890,
    message_thread_id: 126,
    name: 'Для Ди',
  });
  assert.deepEqual(result.updated, [{ topicId: 126, name: 'Для Ди' }]);
});

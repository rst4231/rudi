const test = require('node:test');
const assert = require('node:assert/strict');

const { ensureLaborTopic } = require('../api/labor-code.cjs');

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return true; },
  };
}

test('Labor uses For Di topic 126 and retires legacy topic 696', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ method: String(url).split('/').at(-1), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const topicId = await ensureLaborTopic({
    token: '1:test',
    chatId: '-1004476323368',
    cache: memoryCache(),
    fetchImpl,
    forumTopicsConfig: {
      version: 2,
      clients: 126,
      labor: 696,
      names: { clients: 'Для Ди' },
    },
  });

  assert.equal(topicId, 126);
  assert.equal(calls.some((call) => call.method === 'deleteForumTopic' && call.body.message_thread_id === 696), true);
});

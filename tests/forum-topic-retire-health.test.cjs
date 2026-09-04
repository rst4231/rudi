const test = require('node:test');
const assert = require('node:assert/strict');

const { syncForumTopicNamesSafe } = require('../api/control-plane-health.cjs');

function memoryCache(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return true; },
  };
}

test('health maintenance renames Clients to For Di and deletes legacy Labor topic', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ method: String(url).split('/').at(-1), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const configFetchImpl = async () => new Response(JSON.stringify({
    version: 2,
    clients: 126,
    labor: 696,
    names: { clients: 'Для Ди' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  await syncForumTopicNamesSafe({
    cache: memoryCache({ 'topic:19:chat-id': -1001234567890 }),
    env: { TELEGRAM_BOT_TOKEN: '1:test' },
    fetchImpl,
    configFetchImpl,
  });

  assert.deepEqual(calls.map((call) => call.method), ['editForumTopic', 'deleteForumTopic']);
  assert.equal(calls[0].body.message_thread_id, 126);
  assert.equal(calls[0].body.name, 'Для Ди');
  assert.equal(calls[1].body.message_thread_id, 696);
});

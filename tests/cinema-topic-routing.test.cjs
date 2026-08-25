const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CINEMA_TOPIC_CACHE_KEY,
  resolveCinemaTopicId,
  ensureCinemaTopic,
} = require('../api/cinema-topic.cjs');

function memoryCache(initial = {}) {
  const state = new Map(Object.entries(initial));
  return {
    async get(key) { return state.has(key) ? state.get(key) : null; },
    async set(key, value) { state.set(key, value); return true; },
  };
}

test('cached cinema topic overrides the legacy configured events topic', async () => {
  const cache = memoryCache({ [CINEMA_TOPIC_CACHE_KEY]: 314 });
  assert.equal(await resolveCinemaTopicId({ cache, configuredTopicId: 19 }), 314);
});

test('cinema topic is created once and persisted for later publications', async () => {
  const cache = memoryCache();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      ok: true,
      result: { message_thread_id: 314, name: 'Кинопремьеры' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const first = await ensureCinemaTopic({
    token: 'token',
    chatId: -100123,
    cache,
    fetchImpl,
  });
  const second = await ensureCinemaTopic({
    token: 'token',
    chatId: -100123,
    cache,
    fetchImpl,
  });

  assert.equal(first.topicId, 314);
  assert.equal(second.topicId, 314);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.name, 'Кинопремьеры');
  assert.equal(await cache.get(CINEMA_TOPIC_CACHE_KEY), 314);
});

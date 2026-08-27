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

test('configured cinema topic is persisted and reused without creating a Telegram topic', async () => {
  const cache = memoryCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error('Telegram should not be called');
  };

  const first = await ensureCinemaTopic({
    token: 'token',
    chatId: -100123,
    cache,
    fetchImpl,
    configuredTopicId: 705,
  });
  const second = await ensureCinemaTopic({
    token: 'token',
    chatId: -100123,
    cache,
    fetchImpl,
    configuredTopicId: 705,
  });

  assert.equal(first.topicId, 705);
  assert.equal(second.topicId, 705);
  assert.equal(calls, 0);
  assert.equal(await cache.get(CINEMA_TOPIC_CACHE_KEY), 705);
});

test('cinema routing refuses to create a duplicate topic when no existing topic id is available', async () => {
  const cache = memoryCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      ok: true,
      result: { message_thread_id: 999, name: 'Кинопремьеры' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  await assert.rejects(
    ensureCinemaTopic({
      token: 'token',
      chatId: -100123,
      cache,
      fetchImpl,
    }),
    /refusing to create a duplicate Telegram forum topic/i,
  );
  assert.equal(calls, 0);
});
